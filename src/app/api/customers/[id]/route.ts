import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { getCustomer } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customer = await getCustomer(id);
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json(customer);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, phone, email, address, city, state, pincode, gstin } = body;
    const customer = await prisma.customer.update({
      where: { id },
      data: { name, phone, email, address, city, state, pincode, gstin },
    });
    revalidateTag(`customer-${id}`, { expire: 0 });
    revalidateTag("customers", { expire: 0 });
    return NextResponse.json(customer);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceCount = await prisma.invoice.count({ where: { customerId: id } });
    if (invoiceCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete customer with ${invoiceCount} existing invoice(s)` },
        { status: 400 }
      );
    }
    await prisma.customer.delete({ where: { id } });
    revalidateTag(`customer-${id}`, { expire: 0 });
    revalidateTag("customers", { expire: 0 });
    return NextResponse.json({ message: "Customer deleted" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
