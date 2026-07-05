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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.trim().toLowerCase();

        // Per-account lockout to slow down brute-force/credential-stuffing.
        const limit = rateLimit(`login:${email}`, 8, 15 * 60 * 1000);
        if (!limit.allowed) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        const valid = await bcrypt.compare(credentials.password, user?.password ?? DUMMY_HASH);
        if (!user || !valid) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      // Client-triggered `update()` must never be trusted to set role/email —
      // always re-derive the current, authoritative values from the database.
      if (trigger === "update" && token.id) {
        const current = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, email: true, role: true },
        });
        if (!current) return { ...token, id: undefined };
        token.name = current.name;
        token.email = current.email;
        token.role = current.role;
      }
      return token;
    },
    async session({ session, token }) {
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
