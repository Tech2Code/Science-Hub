import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const EXTRACT_PROMPT = `You are a bill/invoice data extraction assistant. Extract all purchase bill details from this image/document and return ONLY a valid JSON object with this exact structure (no markdown, no explanation):

{
  "vendorName": "string or null",
  "vendorGstin": "string or null",
  "vendorPhone": "string or null",
  "vendorAddress": "string or null",
  "billNumber": "string or null",
  "billDate": "YYYY-MM-DD or null",
  "dueDate": "YYYY-MM-DD or null",
  "category": "one of: Raw Materials, Lab Chemicals, Lab Equipment, Office Supplies, Packaging, Services, Other — pick closest match or null",
  "notes": "string or null",
  "items": [
    {
      "name": "item name string",
      "quantity": number,
      "unit": "one of: Pcs, Box, Set, Kg, Ltr, Mtr, Dozen, Pack, Pair, Nos — pick closest or Pcs",
      "purchasePrice": number (unit price excluding GST/tax),
      "gstRate": number (0, 5, 12, 18, or 28 — pick closest standard GST slab)
    }
  ],
  "subtotal": number or null,
  "taxAmount": number or null,
  "discount": number or null,
  "total": number or null
}

Rules:
- All monetary values must be numbers (not strings), use 0 if unknown.
- For Indian GST invoices: subtotal = amount before GST, taxAmount = total CGST+SGST or IGST.
- If a field cannot be determined, use null.
- items array must have at least one entry if any line items are visible.
- Return ONLY the JSON object — no markdown fences, no other text.`;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI extraction is not configured. Add ANTHROPIC_API_KEY to your environment variables." },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a JPG, PNG, WebP, or PDF." },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 10 MB." }, { status: 400 });
    }

    const bytes  = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const isPdf  = file.type === "application/pdf";

    const contentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image",    source: { type: "base64", media_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } };

    const headers: Record<string, string> = {
      "x-api-key":          apiKey,
      "anthropic-version":  "2023-06-01",
      "content-type":       "application/json",
    };
    if (isPdf) headers["anthropic-beta"] = "pdfs-2024-09-25";

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers,
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{
          role:    "user",
          content: [contentBlock, { type: "text", text: EXTRACT_PROMPT }],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      console.error("Anthropic API error:", err);
      return NextResponse.json(
        { error: err?.error?.message ?? "AI extraction service failed. Please try again." },
        { status: 500 }
      );
    }

    const result = await anthropicRes.json();
    const rawText: string = result.content?.[0]?.text ?? "";

    // Strip markdown fences if model adds them despite instructions
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawText);
      return NextResponse.json(
        { error: "Could not parse extracted data. Please fill the form manually.", raw: rawText },
        { status: 422 }
      );
    }

    return NextResponse.json(extracted);
  } catch (err) {
    console.error("Bill extraction error:", err);
    return NextResponse.json({ error: "Extraction failed. Please try again." }, { status: 500 });
  }
}
