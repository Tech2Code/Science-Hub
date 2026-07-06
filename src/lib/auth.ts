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

        // Per-account lockout to slow down brute-force against one account,
        // plus a per-IP lockout (higher ceiling, to tolerate shared office
        // IPs) to blunt credential-stuffing across many distinct accounts
        // from one source, which the per-account limit alone can't catch.
        const headers = (req?.headers ?? {}) as Record<string, string | undefined>;
        const ip = headers["x-vercel-forwarded-for"]?.split(",")[0]?.trim()
          || headers["x-real-ip"]?.trim()
          || headers["x-forwarded-for"]?.split(",")[0]?.trim()
          || "unknown";
        const ipLimit = rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
        const accountLimit = rateLimit(`login:${email}`, 8, 15 * 60 * 1000);
        if (!ipLimit.allowed || !accountLimit.allowed) return null;

        const user = await prisma.user.findUnique({ where: { email } });
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
        return token;
      }
      if (!token.id) return token;

      // getServerSession() runs this callback on every single authenticated
      // API request — checking tokenVersion against the DB on every one of
      // those added a full extra Postgres round-trip per request and made
      // the whole app noticeably slow. Only re-check every few minutes (and
      // always on an explicit client update()) instead: this bounds how
      // long a reset/changed password takes to actually lock out an
      // already-issued token to a few minutes, in exchange for not hitting
      // the DB on every request.
      const CHECK_INTERVAL_MS = 5 * 60 * 1000;
      const lastChecked = typeof token.tvCheckedAt === "number" ? token.tvCheckedAt : 0;
      if (trigger !== "update" && Date.now() - lastChecked < CHECK_INTERVAL_MS) {
        return token;
      }

      // A password change/reset bumps tokenVersion server-side, which is
      // how an already-issued, stateless JWT gets invalidated early instead
      // of staying valid until its natural 8-hour expiry. Client-triggered
      // `update()` must never be trusted to set name/email/role — always
      // re-derive those from the database.
      const current = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { name: true, email: true, role: true, tokenVersion: true },
      });
      if (!current) return { ...token, id: undefined };
      // A JWT issued before this field existed has no tokenVersion at all
      // (undefined) rather than a stale one — backfill it instead of
      // invalidating, or every already-logged-in user gets signed out the
      // moment this code ships. Only an actual mismatch (a real password
      // change since the token was issued) invalidates the session.
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
      // Returning `null` here to force useSession() into "unauthenticated"
      // was tried and reverted — this next-auth version's client code
      // spreads the fetched session value and crashes on null
      // ("Cannot convert undefined or null to object"). requireSession()
      // already rejects API calls once token.id is cleared; pages that need
      // an active redirect check response status themselves.
      if (token?.id) {
        session.user.id   = token.id   as string;
        session.user.role = token.role as string;
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
