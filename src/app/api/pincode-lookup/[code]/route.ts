import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";

interface PostOffice {
  Name: string;
  District: string;
  State: string;
}
interface PincodeApiResult {
  Status: string;
  PostOffice: PostOffice[] | null;
}

// Proxies the public India Post pincode directory (api.postalpincode.in) so
// the browser doesn't need to call a third-party host directly — mirrors the
// pattern in /api/settings/ifsc-lookup, but open to any authenticated user
// (not admin-only) since every customer/vendor/settings-address form needs it.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const limit = rateLimit(`pincode-lookup:${auth.session.user.id}`, 30, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many lookups — please wait a bit and try again." }, { status: 429 });
  }

  const { code } = await params;
  const pincode = code.trim();
  if (!/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ error: "Invalid pincode format." }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json({ error: "Could not reach the pincode lookup service." }, { status: 502 });
    }
    const data = (await res.json()) as PincodeApiResult[];
    const postOffice = data?.[0]?.PostOffice?.[0];
    if (data?.[0]?.Status !== "Success" || !postOffice) {
      return NextResponse.json({ error: "Pincode not found." }, { status: 404 });
    }
    return NextResponse.json({
      city: postOffice.District ?? "",
      state: postOffice.State ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the pincode lookup service." }, { status: 502 });
  }
}
