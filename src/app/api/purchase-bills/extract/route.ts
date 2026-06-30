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

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI extraction is not configured. Add GOOGLE_API_KEY to your environment variables. Get a free key at aistudio.google.com." },
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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: file.type, data: base64 } },
              { text: EXTRACT_PROMPT },
            ],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      console.error("Gemini API error:", err);
      const msg = err?.error?.message ?? "AI extraction service failed. Please try again.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const result  = await geminiRes.json();
    const rawText: string = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse Gemini response:", rawText);
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
