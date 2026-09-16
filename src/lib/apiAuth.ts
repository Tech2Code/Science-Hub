import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ProtectedSection } from "@/lib/sections";

export type AuthedSession = {
  user: { id: string; role: string; name?: string | null; email?: string | null; sections: string[] };
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

// Enforces write (create/edit/delete) access. Managers are read-only users
// and cannot mutate business data.
export async function requireWriteAccess(): Promise<AuthResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  if (auth.session.user.role === "manager") {
    return { ok: false, response: NextResponse.json({ error: "Managers have read-only access" }, { status: 403 }) };
  }
  return auth;
}

// Sales+Purchase data merge here despite sitting behind separate permissions — an all-or-nothing
// gate avoids handing a partial, misleading filing package to a user with only one half. Shared by
// /api/gst-filing and any other route that surfaces the same real net-GST-payable figure (e.g. the
// Dashboard's Cash Flow tile), so that figure is never shown more broadly than the actual filing
// report itself is.
export async function requireGstFilingAccess(): Promise<AuthResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  const { role, sections } = auth.session.user;
  if (role === "admin") return auth;
  const userSections = Array.isArray(sections) ? sections : [];
  if (!userSections.includes("reports_sales") || !userSections.includes("reports_purchases")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "GST Filing requires both Sales Reports and Purchase Reports access." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

// Enforces section-level access. Admin always passes.
// Other roles need the section in their token.
export async function requireSectionAccess(section: ProtectedSection): Promise<AuthResult> {
  const auth = await requireSession();
  if (!auth.ok) return auth;

  const { role, sections } = auth.session.user;

  // Admin bypasses all section checks
  if (role === "admin") return auth;

  // All other roles — check section array
  // Handle undefined/malformed sections by treating as empty (deny all)
  const userSections = Array.isArray(sections) ? sections : [];
  if (!userSections.includes(section)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Insufficient section permissions" },
        { status: 403 }
      ),
    };
  }

  return auth;
}
