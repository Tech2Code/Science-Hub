import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export type AuthedSession = {
  user: { id: string; role: string; name?: string | null; email?: string | null };
};

type AuthResult =
  | { ok: true; session: AuthedSession }
  | { ok: false; response: NextResponse };

// Enforces an authenticated session. Call at the top of every route handler
// that touches non-public data; `if (!auth.ok) return auth.response`.
export async function requireSession(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, session: session as AuthedSession };
}

// Enforces an authenticated session with the admin role.
export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  if (auth.session.user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return auth;
}
