import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";

// Proxies the public Razorpay IFSC directory (https://ifsc.razorpay.com) so the
// browser doesn't need to call a third-party host directly, and so lookups are
// gated behind the same admin check as editing bank details.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { code } = await params;
  const ifsc = code.trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return NextResponse.json({ error: "Invalid IFSC format." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json({ error: "IFSC code not found." }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json({
      bank: data.BANK ?? "",
      branch: data.BRANCH ?? "",
      city: data.CITY ?? "",
      state: data.STATE ?? "",
      address: data.ADDRESS ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the IFSC lookup service." }, { status: 502 });
  }
}
