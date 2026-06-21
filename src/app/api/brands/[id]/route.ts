import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Unassign products before deleting (brandId is optional)
    await prisma.product.updateMany({ where: { brandId: id }, data: { brandId: null } });
    await prisma.brand.delete({ where: { id } });

    return NextResponse.json({ message: "Brand deleted" });
  } catch (error) {
    console.error("DELETE /api/brands/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
  }
}
