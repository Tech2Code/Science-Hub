import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCustomer } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";
import { validateCustomerInput } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, phone, email, address, city, state, pincode, gstin, expectedUpdatedAt } = body;

    const validationError = validateCustomerInput({ name, phone, email, pincode, gstin });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const existing = await prisma.customer.findUnique({ where: { id }, select: { deletedAt: true, updatedAt: true } });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    if (existing.deletedAt) {
      return NextResponse.json({ error: "This customer is in the bin — restore it before editing" }, { status: 400 });
    }
    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()) {
      return NextResponse.json({ error: "This customer was updated by someone else since you opened this page. Please refresh and try again." }, { status: 409 });
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { name: name.trim(), phone, email, address, city, state, pincode, gstin },
    });
    await logActivity(auth.session.user.id, "update_customer", `Updated customer "${customer.name}" | Phone: ${phone || "—"} | Email: ${email || "—"} | City: ${city || "—"}${state ? ", " + state : ""} | GSTIN: ${gstin || "—"}`, id, "customer");
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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id }, select: { name: true, phone: true, city: true, gstin: true } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    const invoiceCount = await prisma.invoice.count({ where: { customerId: id, deletedAt: null } });
    if (invoiceCount > 0) {
      return NextResponse.json(
        { error: `"${customer.name}" has ${invoiceCount} invoice${invoiceCount > 1 ? "s" : ""} and cannot be deleted. Delete those invoices first.` },
        { status: 400 }
      );
    }
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(auth.session.user.id, "delete_customer", `Moved customer "${customer.name}" to bin | Phone: ${customer.phone || "—"} | City: ${customer.city || "—"} | GSTIN: ${customer.gstin || "—"}`, id, "customer");
    revalidateTag("customers", { expire: 0 });
    return NextResponse.json({ message: "Customer moved to bin" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
