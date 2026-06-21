import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("🗑  Wiping existing data…");
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  console.log("✓  Cleared");

  // Admin user
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.create({
    data: { email: "admin@sciencehub.com", password: hashedPassword, name: "Naresh Jha", role: "admin" },
  });
  console.log("✓  Admin user created");

  // Brands
  const brandNames = [
    "ThermoFisher Scientific", "Borosil", "CDH", "Merck", "HiMedia",
    "Remi", "SDFCL", "Hanna Instruments", "Danwer", "Axiva",
    "Benny Impex", "Avantor", "SRL Diagnostics", "Whatman", "Loba Chemie",
  ];
  const brands: Record<string, string> = {};
  for (const name of brandNames) {
    const b = await prisma.brand.create({ data: { name } });
    brands[name] = b.id;
  }
  console.log(`✓  ${brandNames.length} brands created`);

  // Categories
  const categoryNames = [
    "Industrial Chemicals", "Lab Glassware", "Instruments",
    "Water Testing", "Safety Equipment", "Consumables",
  ];
  const cats: Record<string, string> = {};
  for (const name of categoryNames) {
    const c = await prisma.category.create({ data: { name } });
    cats[name] = c.id;
  }
  console.log(`✓  ${categoryNames.length} categories created`);

  // Products
  const productData = [
    { name: "Hydrochloric Acid 35%",        sku: "CHEM-001", unit: "Ltr",  price: 380,   gstRate: 18, stock: 45,  minStock: 10, cat: "Industrial Chemicals", brand: "Merck"             },
    { name: "Sodium Hydroxide Pellets",      sku: "CHEM-002", unit: "Kg",   price: 520,   gstRate: 18, stock: 32,  minStock: 8,  cat: "Industrial Chemicals", brand: "CDH"               },
    { name: "Sulphuric Acid 98%",            sku: "CHEM-003", unit: "Ltr",  price: 290,   gstRate: 18, stock: 60,  minStock: 15, cat: "Industrial Chemicals", brand: "Merck"             },
    { name: "Ethanol 99.9%",                 sku: "CHEM-004", unit: "Ltr",  price: 850,   gstRate: 18, stock: 25,  minStock: 10, cat: "Industrial Chemicals", brand: "SDFCL"             },
    { name: "Distilled Water 5L",            sku: "CHEM-005", unit: "Can",  price: 120,   gstRate: 5,  stock: 80,  minStock: 20, cat: "Industrial Chemicals", brand: "Loba Chemie"       },
    { name: "Beaker 250ml Borosilicate",     sku: "GLAS-001", unit: "Nos",  price: 95,    gstRate: 12, stock: 120, minStock: 20, cat: "Lab Glassware",        brand: "Borosil"           },
    { name: "Erlenmeyer Flask 500ml",        sku: "GLAS-002", unit: "Nos",  price: 145,   gstRate: 12, stock: 60,  minStock: 15, cat: "Lab Glassware",        brand: "Borosil"           },
    { name: "Measuring Cylinder 100ml",      sku: "GLAS-003", unit: "Nos",  price: 115,   gstRate: 12, stock: 85,  minStock: 20, cat: "Lab Glassware",        brand: "Borosil"           },
    { name: "Petri Dish 90mm",               sku: "GLAS-004", unit: "Nos",  price: 55,    gstRate: 12, stock: 200, minStock: 50, cat: "Lab Glassware",        brand: "Borosil"           },
    { name: "Test Tube 25ml (Box/100)",      sku: "GLAS-005", unit: "Box",  price: 320,   gstRate: 12, stock: 40,  minStock: 10, cat: "Lab Glassware",        brand: "Borosil"           },
    { name: "Digital pH Meter",              sku: "INST-001", unit: "Nos",  price: 4500,  gstRate: 18, stock: 8,   minStock: 2,  cat: "Instruments",          brand: "Hanna Instruments" },
    { name: "Analytical Balance 0.001g",     sku: "INST-002", unit: "Nos",  price: 18500, gstRate: 18, stock: 3,   minStock: 1,  cat: "Instruments",          brand: "Remi"              },
    { name: "Magnetic Stirrer Hot Plate",    sku: "INST-003", unit: "Nos",  price: 6800,  gstRate: 18, stock: 5,   minStock: 2,  cat: "Instruments",          brand: "Remi"              },
    { name: "Centrifuge Machine 8-Tube",     sku: "INST-004", unit: "Nos",  price: 22000, gstRate: 18, stock: 2,   minStock: 1,  cat: "Instruments",          brand: "Remi"              },
    { name: "TDS Meter Digital",             sku: "WTST-001", unit: "Nos",  price: 1200,  gstRate: 18, stock: 15,  minStock: 5,  cat: "Water Testing",        brand: "Hanna Instruments" },
    { name: "Water Test Kit Complete",       sku: "WTST-002", unit: "Kit",  price: 2800,  gstRate: 18, stock: 12,  minStock: 3,  cat: "Water Testing",        brand: "Axiva"             },
    { name: "Nitrile Gloves Med (100pcs)",   sku: "SFTY-001", unit: "Box",  price: 480,   gstRate: 12, stock: 50,  minStock: 10, cat: "Safety Equipment",     brand: "Axiva"             },
    { name: "Lab Safety Goggles",            sku: "SFTY-002", unit: "Nos",  price: 220,   gstRate: 12, stock: 30,  minStock: 8,  cat: "Safety Equipment",     brand: "Danwer"            },
    { name: "Whatman Filter Paper No.1",     sku: "CONS-001", unit: "Pack", price: 650,   gstRate: 12, stock: 35,  minStock: 8,  cat: "Consumables",          brand: "Whatman"           },
    { name: "Microscope Slide Box (100pcs)", sku: "CONS-002", unit: "Box",  price: 180,   gstRate: 12, stock: 4,   minStock: 5,  cat: "Consumables",          brand: "Benny Impex"       },
  ];

  const prods: Record<string, { id: string; price: number; gstRate: number; unit: string; name: string }> = {};
  for (const p of productData) {
    const prod = await prisma.product.create({
      data: {
        name: p.name, sku: p.sku, unit: p.unit, price: p.price, gstRate: p.gstRate,
        stock: p.stock, minStock: p.minStock, categoryId: cats[p.cat], brandId: brands[p.brand],
      },
    });
    prods[p.sku] = { id: prod.id, price: p.price, gstRate: p.gstRate, unit: p.unit, name: p.name };
  }
  console.log(`✓  ${productData.length} products created`);

  // Customers
  const customerRows = [
    { name: "Rajasthan Institute of Science", phone: "9414012345", email: "procurement@ris.edu.in",      address: "JLN Marg, Sanganer",            city: "Jaipur",  state: "Rajasthan", pincode: "302012", gstin: "08AABCR1234A1Z5" },
    { name: "City Diagnostic Lab",            phone: "9829054321", email: "lab@citydiag.com",            address: "C-12 Vaishali Nagar",           city: "Jaipur",  state: "Rajasthan", pincode: "302021", gstin: "08AADCC5678B2Z3" },
    { name: "Sunrise Pharmaceuticals",        phone: "9784512345", email: "purchase@sunrisepharma.in",   address: "Industrial Area Phase 2",       city: "Jodhpur", state: "Rajasthan", pincode: "342001", gstin: "08AAECS9012C3Z1" },
    { name: "Delhi University Lab",           phone: "9811234567", email: "lab.du@delhi.edu.in",         address: "North Campus, Mall Road",       city: "Delhi",   state: "Delhi",     pincode: "110007", gstin: "07AABCD1234D4Z9" },
    { name: "Green Valley Hospital",          phone: "9928765432", email: "store@gvhospital.com",        address: "Tonk Road, Durgapura",          city: "Jaipur",  state: "Rajasthan", pincode: "302015", gstin: "08AAFCG6789E5Z7" },
    { name: "Modern Research Institute",      phone: "9414099876", email: "mri.purchase@mri.org.in",    address: "Malviya Nagar",                 city: "Jaipur",  state: "Rajasthan", pincode: "302017", gstin: "08AAGCM2345F6Z5" },
    { name: "Bharat Chemical Supplies",       phone: "9887654321", email: "bcs@bharatchem.com",          address: "Sitapura Industrial Area",      city: "Jaipur",  state: "Rajasthan", pincode: "302022", gstin: "08AAHCB8901G7Z3" },
    { name: "National Water Authority",       phone: "9413212345", email: "lab@nwa.gov.in",              address: "Nirman Bhawan, Sector 8",       city: "Jaipur",  state: "Rajasthan", pincode: "302005", gstin: "08AAICN3456H8Z1" },
    { name: "Ajmer Science College",          phone: "9672345678", email: "science@ajmercollege.ac.in",  address: "Pushkar Road, Near Roshan Bagh", city: "Ajmer",  state: "Rajasthan", pincode: "305001", gstin: "08AAJCA9012I9Z9" },
    { name: "BioTech Solutions Pvt Ltd",      phone: "9024567890", email: "purchase@biotechsol.in",      address: "RICCO Industrial Area, Bhiwadi", city: "Alwar",  state: "Rajasthan", pincode: "301019", gstin: "08AAKBC4567J1Z7" },
  ];

  const custs: Record<string, string> = {};
  for (const c of customerRows) {
    const cust = await prisma.customer.create({ data: c });
    custs[c.name] = cust.id;
  }
  console.log(`✓  ${customerRows.length} customers created`);

  // Helpers
  type Line = { sku: string; qty: number };

  function buildItems(lines: Line[]) {
    return lines.map(({ sku, qty }) => {
      const p = prods[sku];
      const lineSubtotal = qty * p.price;
      const gstAmount = lineSubtotal * p.gstRate / 100;
      return { productId: p.id, name: p.name, quantity: qty, unit: p.unit, price: p.price, gstRate: p.gstRate, gstAmount, total: lineSubtotal + gstAmount };
    });
  }

  function calcTotals(items: ReturnType<typeof buildItems>, isInterState: boolean) {
    const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
    const totalGst = items.reduce((s, i) => s + i.gstAmount, 0);
    const total = subtotal + totalGst;
    return { subtotal, cgst: isInterState ? 0 : totalGst / 2, sgst: isInterState ? 0 : totalGst / 2, igst: isInterState ? totalGst : 0, total };
  }

  async function createInvoice(
    num: string, custName: string, date: Date, dueDate: Date, isInterState: boolean,
    lines: Line[], status: "paid" | "partial" | "unpaid",
    paidAmount = 0, payMethod = "cash", payDate?: Date,
  ) {
    const items = buildItems(lines);
    const t = calcTotals(items, isInterState);
    const paid = status === "paid" ? t.total : paidAmount;
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: num, date, dueDate, customerId: custs[custName], userId: admin.id,
        status, subtotal: t.subtotal, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
        total: t.total, paidAmount: paid, isInterState,
        items: { create: items },
      },
    });
    if (paid > 0) {
      await prisma.payment.create({
        data: { invoiceId: inv.id, amount: paid, method: payMethod, date: payDate ?? date },
      });
    }
    return inv;
  }

  // PAID invoices – April 2026
  await createInvoice("SH-2026-0001", "Rajasthan Institute of Science",
    new Date("2026-04-05"), new Date("2026-05-05"), false,
    [{ sku: "CHEM-001", qty: 10 }, { sku: "CHEM-002", qty: 5 }, { sku: "CHEM-003", qty: 8 }],
    "paid", 0, "bank_transfer", new Date("2026-04-12"));

  await createInvoice("SH-2026-0002", "City Diagnostic Lab",
    new Date("2026-04-12"), new Date("2026-05-12"), false,
    [{ sku: "GLAS-001", qty: 24 }, { sku: "GLAS-002", qty: 12 }, { sku: "GLAS-004", qty: 50 }],
    "paid", 0, "upi", new Date("2026-04-15"));

  await createInvoice("SH-2026-0003", "Sunrise Pharmaceuticals",
    new Date("2026-04-18"), new Date("2026-05-18"), false,
    [{ sku: "INST-001", qty: 2 }, { sku: "INST-003", qty: 1 }],
    "paid", 0, "cheque", new Date("2026-04-25"));

  await createInvoice("SH-2026-0004", "Delhi University Lab",
    new Date("2026-04-22"), new Date("2026-05-22"), true,
    [{ sku: "CHEM-004", qty: 5 }, { sku: "CHEM-005", qty: 10 }, { sku: "CONS-001", qty: 6 }],
    "paid", 0, "bank_transfer", new Date("2026-04-30"));

  await createInvoice("SH-2026-0005", "Green Valley Hospital",
    new Date("2026-04-28"), new Date("2026-05-28"), false,
    [{ sku: "SFTY-001", qty: 10 }, { sku: "SFTY-002", qty: 5 }, { sku: "CONS-001", qty: 4 }, { sku: "CONS-002", qty: 2 }],
    "paid", 0, "cash", new Date("2026-04-28"));

  // PARTIAL invoices – May 2026
  await createInvoice("SH-2026-0006", "Modern Research Institute",
    new Date("2026-05-05"), new Date("2026-06-05"), false,
    [{ sku: "INST-002", qty: 1 }, { sku: "INST-003", qty: 2 }],
    "partial", 15000, "bank_transfer", new Date("2026-05-12"));

  await createInvoice("SH-2026-0007", "Bharat Chemical Supplies",
    new Date("2026-05-10"), new Date("2026-06-10"), false,
    [{ sku: "CHEM-001", qty: 20 }, { sku: "CHEM-002", qty: 15 }, { sku: "CHEM-003", qty: 12 }],
    "partial", 12000, "cash", new Date("2026-05-10"));

  await createInvoice("SH-2026-0008", "National Water Authority",
    new Date("2026-05-15"), new Date("2026-06-15"), false,
    [{ sku: "WTST-001", qty: 5 }, { sku: "WTST-002", qty: 3 }],
    "partial", 8000, "upi", new Date("2026-05-20"));

  await createInvoice("SH-2026-0009", "Delhi University Lab",
    new Date("2026-05-20"), new Date("2026-06-20"), true,
    [{ sku: "GLAS-001", qty: 36 }, { sku: "GLAS-002", qty: 20 }, { sku: "GLAS-003", qty: 24 }, { sku: "GLAS-005", qty: 5 }],
    "partial", 5000, "bank_transfer", new Date("2026-05-25"));

  // UNPAID invoices – May–June 2026
  await createInvoice("SH-2026-0010", "Ajmer Science College",
    new Date("2026-05-28"), new Date("2026-06-28"), false,
    [{ sku: "CHEM-001", qty: 8 }, { sku: "CHEM-004", qty: 3 }, { sku: "CONS-001", qty: 5 }],
    "unpaid");

  await createInvoice("SH-2026-0011", "BioTech Solutions Pvt Ltd",
    new Date("2026-06-03"), new Date("2026-07-03"), false,
    [{ sku: "INST-002", qty: 1 }, { sku: "INST-004", qty: 1 }],
    "unpaid");

  await createInvoice("SH-2026-0012", "Rajasthan Institute of Science",
    new Date("2026-06-08"), new Date("2026-07-08"), false,
    [{ sku: "GLAS-001", qty: 48 }, { sku: "GLAS-004", qty: 100 }, { sku: "GLAS-005", qty: 8 }],
    "unpaid");

  await createInvoice("SH-2026-0013", "City Diagnostic Lab",
    new Date("2026-06-12"), new Date("2026-07-12"), false,
    [{ sku: "CONS-001", qty: 10 }, { sku: "CONS-002", qty: 5 }, { sku: "SFTY-001", qty: 6 }],
    "unpaid");

  await createInvoice("SH-2026-0014", "National Water Authority",
    new Date("2026-06-17"), new Date("2026-07-17"), false,
    [{ sku: "WTST-001", qty: 8 }, { sku: "WTST-002", qty: 4 }, { sku: "GLAS-001", qty: 12 }],
    "unpaid");

  await createInvoice("SH-2026-0015", "Green Valley Hospital",
    new Date("2026-06-20"), new Date("2026-07-20"), false,
    [{ sku: "INST-001", qty: 1 }, { sku: "INST-003", qty: 1 }, { sku: "SFTY-001", qty: 5 }, { sku: "SFTY-002", qty: 3 }],
    "unpaid");

  console.log("✓  15 invoices + payments created (5 paid / 4 partial / 6 unpaid)");
  console.log("\n✅  Seed complete!");
  console.log("   Login: admin@sciencehub.com / admin123");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
