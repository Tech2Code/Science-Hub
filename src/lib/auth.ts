import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { rateLimit } from "./rateLimit";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is required");
}

// Fixed dummy hash used to keep authorize()'s timing constant whether or not
// the email exists, so response time can't be used to enumerate accounts.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8/Wq5rE/H2LTKq/i9v9r0Kv6WGqA0e";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();

        // Per-account lockout for brute-force plus a higher-ceiling per-IP lockout for
        // credential-stuffing across accounts, which the per-account limit alone can't catch.
        const headers = (req?.headers ?? {}) as Record<string, string | undefined>;
        const ip = headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
          || headers["x-real-ip"]?.trim()
          || headers["x-forwarded-for"]?.split(",")[0]?.trim()
          || "unknown";
        const ipLimit = rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
        const accountLimit = rateLimit(`login:${email}`, 8, 15 * 60 * 1000);
        if (!ipLimit.allowed || !accountLimit.allowed) return null;

        // A DB error must not surface as a message distinct from "wrong password" (would leak which
        // case occurred); NextAuth already collapses thrown errors, so this catch is just for server-side logging.
        let user;
        try {
          user = await prisma.user.findUnique({ where: { email } });
        } catch (err) {
          console.error("[auth] DB lookup failed during login attempt", { email, err });
          return null;
        }
        const valid = await bcrypt.compare(credentials.password, user?.password ?? DUMMY_HASH);
        if (!user || !valid) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, tokenVersion: user.tokenVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.tokenVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
        token.tvCheckedAt = Date.now();

        // Load section permissions for the user
        try {
          const permissions = await prisma.sectionPermission.findMany({
            where: { userId: user.id, enabled: true },
            select: { section: true },
          });
          token.sections = permissions.map((p) => p.section);
        } catch {
          token.sections = [];
        }

        return token;
      }
      if (!token.id) return token;

      // Reload section permissions every 30 seconds so permission changes
      // by admin take effect quickly without hitting DB on every request.
      const PERMS_INTERVAL_MS = 30 * 1000;
      const lastPermsCheck = typeof token.permsCheckedAt === "number" ? token.permsCheckedAt : 0;
      if (trigger === "update" || Date.now() - lastPermsCheck >= PERMS_INTERVAL_MS) {
        try {
          const freshPerms = await prisma.sectionPermission.findMany({
            where: { userId: token.id as string, enabled: true },
            select: { section: true },
          });
          token.sections = freshPerms.map((p) => p.section);
          token.permsCheckedAt = Date.now();
        } catch {
          // Keep existing sections on failure
        }
      }

      // Checking tokenVersion against the DB on every request made the app noticeably slow —
      // only re-check every few minutes (or on explicit update()), bounding revocation delay instead.
      const CHECK_INTERVAL_MS = 5 * 60 * 1000;
      const lastChecked = typeof token.tvCheckedAt === "number" ? token.tvCheckedAt : 0;
      if (trigger !== "update" && Date.now() - lastChecked < CHECK_INTERVAL_MS) {
        return token;
      }

      // A password change/reset bumps tokenVersion server-side to invalidate an issued JWT early.
      // Client-triggered update() must never be trusted for name/email/role — always re-derive from DB.
      const current = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { name: true, email: true, role: true, tokenVersion: true },
      });
      if (!current) return { ...token, id: undefined };
      // A JWT issued before this field existed has tokenVersion undefined, not stale — backfill it
      // rather than invalidating, or every logged-in user gets signed out when this ships.
      if (token.tokenVersion !== undefined && current.tokenVersion !== token.tokenVersion) {
        return { ...token, id: undefined };
      }
      token.tokenVersion = current.tokenVersion;
      token.tvCheckedAt = Date.now();

      if (trigger === "update") {
        token.name = current.name;
        token.email = current.email;
        token.role = current.role;
      }
      return token;
    },
    async session({ session, token }) {
      // Returning null here (to force "unauthenticated") crashes this next-auth version's client code,
      // which spreads the session value. requireSession() already rejects once token.id is cleared.
      if (token?.id) {
        session.user.id   = token.id   as string;
        session.user.role = token.role as string;
        session.user.sections = (token.sections as string[]) ?? [];
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 hours
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
};
