import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { encrypt } from "../src/lib/crypto";
import { batchAdjustStock } from "../src/lib/stockMovement";

config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

// Deterministic pseudo-random so re-running produces the same dummy dataset.
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Neon's pooled connection occasionally needs a moment to wake/reconnect
// between many sequential transactions — retry a couple of times on the
// "unable to start a transaction" error instead of failing the whole run.
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      if (code !== "P2028" && code !== "P2034") throw err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  console.log("Wiping existing transactional data…");

  // Children first, FK-safe order.
  await prisma.returnItem.deleteMany();
  await prisma.return.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.purchaseBillItem.deleteMany();
  await prisma.purchasePayment.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.purchaseBill.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.sectionPermission.deleteMany();
  await prisma.passwordResetToken.deleteMany();

  // Remove Naresh Jha; keep Dev Admin's existing account (id/password) untouched.
  const devAdmin = await prisma.user.findFirst({ where: { email: "dev@admin.com" } });
  if (!devAdmin) throw new Error("Dev Admin user (dev@admin.com) not found — refusing to seed without a surviving admin account.");
  await prisma.user.deleteMany({ where: { NOT: { id: devAdmin.id } } });
  console.log(`Kept admin: ${devAdmin.name} <${devAdmin.email}>`);

  // ── Business Settings (dummy identity) ──────────────────────────────────
  await prisma.businessSettings.update({
    where: { id: "singleton" },
    data: {
      name: "Apex Scientific & Lab Supplies",
      tagline: "Precision Instruments. Trusted Chemicals.",
      email: "info@apexscientific.in",
      phone: "9811223344",
      address: "Plot 14, Okhla Industrial Area Phase II",
      city: "Delhi",
      state: "Delhi",
      pincode: "110020",
      gstin: "07AAAPA1234Q1Z5",
      pan: "AAAPA1234Q",
      gmailUser: "invoices.apexscientific@gmail.com",
      gmailAppPassword: encrypt("dummy-app-password"),
      bankName: "HDFC Bank",
      bankAccountName: "Apex Scientific & Lab Supplies",
      bankAccountNumber: encrypt("50100123456789"),
      bankIfsc: "HDFC0001234",
      bankBranch: "Okhla Industrial Area, New Delhi",
    },
  });
  console.log("✓ Business settings updated (dummy identity)");

  // ── Brands & Categories ──────────────────────────────────────────────────
  const brandNames = [
    "ThermoFisher Scientific", "Borosil", "CDH", "Merck", "HiMedia",
    "Remi", "SDFCL", "Hanna Instruments", "Danwer", "Axiva",
    "Benny Impex", "Avantor", "SRL Diagnostics", "Whatman", "Loba Chemie",
  ];
  const brands: Record<string, string> = {};
  for (const name of brandNames) brands[name] = (await prisma.brand.create({ data: { name } })).id;
  console.log(`✓ ${brandNames.length} brands`);

  const categoryNames = ["Industrial Chemicals", "Lab Glassware", "Instruments", "Water Testing", "Safety Equipment", "Consumables"];
  const cats: Record<string, string> = {};
  for (const name of categoryNames) cats[name] = (await prisma.category.create({ data: { name } })).id;
  console.log(`✓ ${categoryNames.length} categories`);

  // ── Products (30) ─────────────────────────────────────────────────────────
  const productData = [
    { name: "Hydrochloric Acid 35%",        sku: "CHEM-001", hsn: "2806", unit: "Ltr",  price: 380,   gstRate: 18, stock: 220, minStock: 30, cat: "Industrial Chemicals", brand: "Merck" },
    { name: "Sodium Hydroxide Pellets",      sku: "CHEM-002", hsn: "2815", unit: "Kg",   price: 520,   gstRate: 18, stock: 180, minStock: 25, cat: "Industrial Chemicals", brand: "CDH" },
    { name: "Sulphuric Acid 98%",            sku: "CHEM-003", hsn: "2807", unit: "Ltr",  price: 290,   gstRate: 18, stock: 240, minStock: 30, cat: "Industrial Chemicals", brand: "Merck" },
    { name: "Ethanol 99.9%",                 sku: "CHEM-004", hsn: "2207", unit: "Ltr",  price: 850,   gstRate: 18, stock: 150, minStock: 20, cat: "Industrial Chemicals", brand: "SDFCL" },
    { name: "Distilled Water 5L",            sku: "CHEM-005", hsn: "2201", unit: "Can",  price: 120,   gstRate: 5,  stock: 300, minStock: 40, cat: "Industrial Chemicals", brand: "Loba Chemie" },
    { name: "Acetone Lab Grade",             sku: "CHEM-006", hsn: "2914", unit: "Ltr",  price: 410,   gstRate: 18, stock: 160, minStock: 20, cat: "Industrial Chemicals", brand: "Avantor" },
    { name: "Potassium Permanganate",        sku: "CHEM-007", hsn: "2841", unit: "Kg",   price: 640,   gstRate: 18, stock: 90,  minStock: 15, cat: "Industrial Chemicals", brand: "CDH" },
    { name: "Beaker 250ml Borosilicate",     sku: "GLAS-001", hsn: "7017", unit: "Nos",  price: 95,    gstRate: 12, stock: 400, minStock: 60, cat: "Lab Glassware",        brand: "Borosil" },
    { name: "Erlenmeyer Flask 500ml",        sku: "GLAS-002", hsn: "7017", unit: "Nos",  price: 145,   gstRate: 12, stock: 260, minStock: 40, cat: "Lab Glassware",        brand: "Borosil" },
    { name: "Measuring Cylinder 100ml",      sku: "GLAS-003", hsn: "7017", unit: "Nos",  price: 115,   gstRate: 12, stock: 300, minStock: 40, cat: "Lab Glassware",        brand: "Borosil" },
    { name: "Petri Dish 90mm",               sku: "GLAS-004", hsn: "7017", unit: "Nos",  price: 55,    gstRate: 12, stock: 600, minStock: 100, cat: "Lab Glassware",       brand: "Borosil" },
    { name: "Test Tube 25ml (Box/100)",      sku: "GLAS-005", hsn: "7017", unit: "Box",  price: 320,   gstRate: 12, stock: 140, minStock: 20, cat: "Lab Glassware",        brand: "Borosil" },
    { name: "Volumetric Flask 1000ml",       sku: "GLAS-006", hsn: "7017", unit: "Nos",  price: 380,   gstRate: 12, stock: 90,  minStock: 15, cat: "Lab Glassware",        brand: "Borosil" },
    { name: "Digital pH Meter",              sku: "INST-001", hsn: "9027", unit: "Nos",  price: 4500,  gstRate: 18, stock: 35,  minStock: 6,  cat: "Instruments",          brand: "Hanna Instruments" },
    { name: "Analytical Balance 0.001g",     sku: "INST-002", hsn: "9027", unit: "Nos",  price: 18500, gstRate: 18, stock: 14,  minStock: 3,  cat: "Instruments",          brand: "Remi" },
    { name: "Magnetic Stirrer Hot Plate",    sku: "INST-003", hsn: "8419", unit: "Nos",  price: 6800,  gstRate: 18, stock: 22,  minStock: 5,  cat: "Instruments",          brand: "Remi" },
    { name: "Centrifuge Machine 8-Tube",     sku: "INST-004", hsn: "8421", unit: "Nos",  price: 22000, gstRate: 18, stock: 9,   minStock: 2,  cat: "Instruments",          brand: "Remi" },
    { name: "Hot Air Oven",                  sku: "INST-005", hsn: "8419", unit: "Nos",  price: 15500, gstRate: 18, stock: 11,  minStock: 2,  cat: "Instruments",          brand: "ThermoFisher Scientific" },
    { name: "Autoclave 20L",                 sku: "INST-006", hsn: "8419", unit: "Nos",  price: 28500, gstRate: 18, stock: 6,   minStock: 2,  cat: "Instruments",          brand: "ThermoFisher Scientific" },
    { name: "TDS Meter Digital",             sku: "WTST-001", hsn: "9027", unit: "Nos",  price: 1200,  gstRate: 18, stock: 60,  minStock: 10, cat: "Water Testing",        brand: "Hanna Instruments" },
    { name: "Water Test Kit Complete",       sku: "WTST-002", hsn: "9027", unit: "Kit",  price: 2800,  gstRate: 18, stock: 48,  minStock: 8,  cat: "Water Testing",        brand: "Axiva" },
    { name: "Turbidity Meter",               sku: "WTST-003", hsn: "9027", unit: "Nos",  price: 5200,  gstRate: 18, stock: 20,  minStock: 4,  cat: "Water Testing",        brand: "Hanna Instruments" },
    { name: "Nitrile Gloves Med (100pcs)",   sku: "SFTY-001", hsn: "4015", unit: "Box",  price: 480,   gstRate: 12, stock: 220, minStock: 30, cat: "Safety Equipment",     brand: "Axiva" },
    { name: "Lab Safety Goggles",            sku: "SFTY-002", hsn: "9004", unit: "Nos",  price: 220,   gstRate: 12, stock: 130, minStock: 20, cat: "Safety Equipment",     brand: "Danwer" },
    { name: "Lab Coat (White, XL)",          sku: "SFTY-003", hsn: "6210", unit: "Nos",  price: 650,   gstRate: 12, stock: 70,  minStock: 12, cat: "Safety Equipment",     brand: "Danwer" },
    { name: "Fire Extinguisher 4kg CO2",     sku: "SFTY-004", hsn: "8424", unit: "Nos",  price: 3200,  gstRate: 18, stock: 25,  minStock: 5,  cat: "Safety Equipment",     brand: "Danwer" },
    { name: "Whatman Filter Paper No.1",     sku: "CONS-001", hsn: "4823", unit: "Pack", price: 650,   gstRate: 12, stock: 150, minStock: 25, cat: "Consumables",          brand: "Whatman" },
    { name: "Microscope Slide Box (100pcs)", sku: "CONS-002", hsn: "7017", unit: "Box",  price: 180,   gstRate: 12, stock: 60,  minStock: 15, cat: "Consumables",          brand: "Benny Impex" },
    { name: "Micropipette Tips (Box/1000)",  sku: "CONS-003", hsn: "3926", unit: "Box",  price: 420,   gstRate: 12, stock: 95,  minStock: 15, cat: "Consumables",          brand: "HiMedia" },
    { name: "Culture Media Agar 500g",       sku: "CONS-004", hsn: "3821", unit: "Pack", price: 890,   gstRate: 18, stock: 55,  minStock: 10, cat: "Consumables",          brand: "HiMedia" },
  ];

  const prods: Record<string, { id: string; price: number; gstRate: number; unit: string; name: string; hsn: string }> = {};
  for (const p of productData) {
    const prod = await prisma.product.create({
      data: { name: p.name, sku: p.sku, hsn: p.hsn, unit: p.unit, price: p.price, purchasePrice: Math.round(p.price * 0.72), gstRate: p.gstRate, stock: p.stock, minStock: p.minStock, categoryId: cats[p.cat], brandId: brands[p.brand] },
    });
    prods[p.sku] = { id: prod.id, price: p.price, gstRate: p.gstRate, unit: p.unit, name: p.name, hsn: p.hsn };
  }
  const skus = Object.keys(prods);
  console.log(`✓ ${productData.length} products`);

  // ── Customers (20) — mix of intra-state (Delhi/Haryana/UP) and inter-state ──
  const customerRows = [
    { name: "Delhi University Central Lab",   phone: "9811234567", email: "lab.du@delhi.edu.in",       address: "North Campus, Mall Road",         city: "Delhi",     state: "Delhi",          pincode: "110007", gstin: "07AABCD1234D4Z9" },
    { name: "Capital Diagnostics Pvt Ltd",    phone: "9811098765", email: "purchase@capitaldiag.in",   address: "Nehru Place",                     city: "Delhi",     state: "Delhi",          pincode: "110019", gstin: "07AADCC5678B2Z3" },
    { name: "Green Valley Hospital",          phone: "9928765432", email: "store@gvhospital.com",      address: "Preet Vihar",                     city: "Delhi",     state: "Delhi",          pincode: "110092", gstin: "07AAFCG6789E5Z7" },
    { name: "National Water Authority",       phone: "9413212345", email: "lab@nwa.gov.in",            address: "Nirman Bhawan, Sector 8",         city: "Delhi",     state: "Delhi",          pincode: "110001", gstin: "07AAICN3456H8Z1" },
    { name: "Metro Pathlab Chain",            phone: "9811556677", email: "central@metropathlab.in",   address: "Lajpat Nagar",                    city: "Delhi",     state: "Delhi",          pincode: "110024", gstin: "07AAMPP1234K1Z2" },
    { name: "Faridabad Research Institute",   phone: "9034512345", email: "purchase@fri.edu.in",       address: "Sector 21C",                      city: "Faridabad", state: "Haryana",        pincode: "121001", gstin: "06AAFRI5678L2Z4" },
    { name: "Gurugram Analytical Labs",       phone: "9871234567", email: "orders@gglabs.in",          address: "Udyog Vihar Phase 3",             city: "Gurugram",  state: "Haryana",        pincode: "122016", gstin: "06AAGAL9012M3Z6" },
    { name: "Panipat Textile Testing Center", phone: "9896541230", email: "lab@panipattest.in",        address: "GT Road Industrial Area",         city: "Panipat",   state: "Haryana",        pincode: "132103", gstin: "06AAPTT3456N4Z8" },
    { name: "Noida BioSciences",              phone: "9910234567", email: "procurement@noidabio.in",   address: "Sector 63",                       city: "Noida",     state: "Uttar Pradesh",  pincode: "201301", gstin: "09AANBS7890O5Z1" },
    { name: "Kanpur Chemical Works",          phone: "9450123456", email: "kcw@kanpurchem.in",         address: "Panki Industrial Area",           city: "Kanpur",    state: "Uttar Pradesh",  pincode: "208020", gstin: "09AAKCW2345P6Z3" },
    { name: "Rajasthan Institute of Science", phone: "9414012345", email: "procurement@ris.edu.in",    address: "JLN Marg, Sanganer",               city: "Jaipur",    state: "Rajasthan",      pincode: "302012", gstin: "08AABCR1234A1Z5" },
    { name: "Sunrise Pharmaceuticals",        phone: "9784512345", email: "purchase@sunrisepharma.in", address: "Industrial Area Phase 2",          city: "Jodhpur",   state: "Rajasthan",      pincode: "342001", gstin: "08AAECS9012C3Z1" },
    { name: "Bharat Chemical Supplies",       phone: "9887654321", email: "bcs@bharatchem.com",        address: "Sitapura Industrial Area",         city: "Jaipur",    state: "Rajasthan",      pincode: "302022", gstin: "08AAHCB8901G7Z3" },
    { name: "Mumbai Marine BioLabs",          phone: "9820012345", email: "orders@mmbiolabs.in",       address: "Andheri East",                     city: "Mumbai",    state: "Maharashtra",    pincode: "400069", gstin: "27AAMMB4567Q1Z9" },
    { name: "Pune Precision Instruments",     phone: "9860123456", email: "sales@puneprecision.in",    address: "Hinjewadi Phase 1",                city: "Pune",      state: "Maharashtra",    pincode: "411057", gstin: "27AAPPI8901R2Z1" },
    { name: "Ahmedabad Textile Labs",         phone: "9825012345", email: "atl@ahmedabadtex.in",       address: "Naroda Industrial Estate",         city: "Ahmedabad", state: "Gujarat",        pincode: "382330", gstin: "24AAATL2345S3Z3" },
    { name: "Bengaluru Genomics Center",      phone: "9880123456", email: "procurement@bggenomics.in", address: "Electronic City Phase 1",          city: "Bengaluru", state: "Karnataka",      pincode: "560100", gstin: "29AABGC6789T4Z5" },
    { name: "Chennai Marine Research",        phone: "9840123456", email: "purchase@chennaimarine.in", address: "OMR, Perungudi",                   city: "Chennai",   state: "Tamil Nadu",     pincode: "600096", gstin: "33AACMR0123U5Z7" },
    { name: "Kolkata Water Board Lab",        phone: "9830123456", email: "lab@kolkatawater.in",       address: "Salt Lake Sector V",               city: "Kolkata",   state: "West Bengal",    pincode: "700091", gstin: "19AAKWB4567V6Z9" },
    { name: "Ajmer Science College",         phone: "9672345678", email: "science@ajmercollege.ac.in", address: "Pushkar Road, Near Roshan Bagh",   city: "Ajmer",     state: "Rajasthan",      pincode: "305001", gstin: "08AAJCA9012I9Z9" },
  ];
  const custs: Record<string, string> = {};
  for (const c of customerRows) custs[c.name] = (await prisma.customer.create({ data: c })).id;
  const custNames = Object.keys(custs);
  console.log(`✓ ${customerRows.length} customers`);

  // ── Vendors (15) ──────────────────────────────────────────────────────────
  const vendorRows = [
    { name: "MediChem Distributors",     company: "MediChem Distributors Pvt Ltd", phone: "9811990011", email: "sales@medichem.in",       address: "Wazirpur Industrial Area", city: "Delhi",     state: "Delhi",         pincode: "110052", gstin: "07AAMCD1234A1Z2" },
    { name: "GlassCraft Suppliers",      company: "GlassCraft Suppliers",          phone: "9811990022", email: "orders@glasscraft.in",    address: "Mayapuri Industrial Area",  city: "Delhi",     state: "Delhi",         pincode: "110064", gstin: "07AAGCS5678B2Z4" },
    { name: "InstruTech Traders",        company: "InstruTech Traders",            phone: "9811990033", email: "sales@instrutech.in",     address: "Okhla Phase 1",             city: "Delhi",     state: "Delhi",         pincode: "110020", gstin: "07AAITT9012C3Z6" },
    { name: "SafeGuard Industrial",      company: "SafeGuard Industrial Supplies", phone: "9811990044", email: "orders@safeguard.in",     address: "Bawana Industrial Area",    city: "Delhi",     state: "Delhi",         pincode: "110039", gstin: "07AASGI3456D4Z8" },
    { name: "Haryana Chem Traders",      company: "Haryana Chem Traders",          phone: "9034990055", email: "hct@haryanachem.in",      address: "IMT Manesar",               city: "Gurugram",  state: "Haryana",       pincode: "122051", gstin: "06AAHCT7890E5Z1" },
    { name: "Faridabad Glassware Co",    company: "Faridabad Glassware Co",        phone: "9034990066", email: "sales@fgco.in",           address: "Sector 25",                 city: "Faridabad", state: "Haryana",       pincode: "121004", gstin: "06AAFGC1234F6Z3" },
    { name: "UP Scientific Traders",     company: "UP Scientific Traders",         phone: "9450990077", email: "upst@scitraders.in",      address: "Site B, Panki",             city: "Kanpur",    state: "Uttar Pradesh", pincode: "208020", gstin: "09AAUST5678G7Z5" },
    { name: "Noida Consumables Hub",     company: "Noida Consumables Hub Pvt Ltd", phone: "9910990088", email: "orders@ncholesale.in",    address: "Sector 63",                 city: "Noida",     state: "Uttar Pradesh", pincode: "201301", gstin: "09AANCH9012H8Z7" },
    { name: "Rajasthan Chemical Depot",  company: "Rajasthan Chemical Depot",      phone: "9414990099", email: "sales@rcdepot.in",        address: "Sitapura Industrial Area",  city: "Jaipur",    state: "Rajasthan",     pincode: "302022", gstin: "08AARCD3456I9Z9" },
    { name: "Mumbai Instruments Corp",   company: "Mumbai Instruments Corp",       phone: "9820990111", email: "sales@mumbaiinst.in",     address: "Andheri MIDC",              city: "Mumbai",    state: "Maharashtra",   pincode: "400093", gstin: "27AAMIC7890J1Z2" },
    { name: "Pune Labware Exports",      company: "Pune Labware Exports",          phone: "9860990122", email: "export@punelabware.in",   address: "Bhosari MIDC",              city: "Pune",      state: "Maharashtra",   pincode: "411026", gstin: "27AAPLE1234K2Z4" },
    { name: "Gujarat Petrochem Supplies",company: "Gujarat Petrochem Supplies",    phone: "9825990133", email: "sales@gujpetrochem.in",   address: "GIDC Vatva",                city: "Ahmedabad", state: "Gujarat",       pincode: "382445", gstin: "24AAGPS5678L3Z6" },
    { name: "Bengaluru Precision Tools", company: "Bengaluru Precision Tools",     phone: "9880990144", email: "sales@bptools.in",        address: "Peenya Industrial Area",    city: "Bengaluru", state: "Karnataka",     pincode: "560058", gstin: "29AABPT9012M4Z8" },
    { name: "Chennai Safety Equipments", company: "Chennai Safety Equipments",     phone: "9840990155", email: "orders@chennaisafety.in", address: "Ambattur Industrial Estate",city: "Chennai",   state: "Tamil Nadu",    pincode: "600058", gstin: "33AACSE3456N5Z1" },
    { name: "Kolkata Glass Industries",  company: "Kolkata Glass Industries",      phone: "9830990166", email: "sales@kolkataglass.in",   address: "Howrah Industrial Belt",    city: "Howrah",    state: "West Bengal",   pincode: "711101", gstin: "19AAKGI7890O6Z3" },
  ];
  const vendors: Record<string, string> = {};
  for (const v of vendorRows) vendors[v.name] = (await prisma.vendor.create({ data: v })).id;
  const vendorNames = Object.keys(vendors);
  console.log(`✓ ${vendorRows.length} vendors`);

  // ── Date range: 1 Apr 2026 → 9 Aug 2026 ──────────────────────────────────
  const rangeStart = new Date("2026-04-01");
  const rangeEnd = new Date("2026-08-09");
  const totalDays = Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
  function randomDateInRange() {
    return addDays(rangeStart, randInt(0, totalDays));
  }

  type Line = { sku: string; qty: number };
  function buildInvoiceItems(lines: Line[]) {
    return lines.map(({ sku, qty }) => {
      const p = prods[sku];
      const lineSubtotal = qty * p.price;
      const gstAmount = lineSubtotal * p.gstRate / 100;
      return { productId: p.id, name: p.name, hsn: p.hsn, quantity: qty, unit: p.unit, price: p.price, gstRate: p.gstRate, gstAmount, total: lineSubtotal + gstAmount };
    });
  }
  function calcTotals(items: { quantity: number; price: number; gstAmount: number }[], isInterState: boolean) {
    const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
    const totalGst = items.reduce((s, i) => s + i.gstAmount, 0);
    const total = subtotal + totalGst;
    return { subtotal, cgst: isInterState ? 0 : totalGst / 2, sgst: isInterState ? 0 : totalGst / 2, igst: isInterState ? totalGst : 0, total };
  }

  const paymentMethods = ["cash", "upi", "bank_transfer", "cheque"];
  const businessState = "Delhi";

  // ── Invoices (70) across April–August 2026 ───────────────────────────────
  const INVOICE_COUNT = 70;
  const invoiceIds: { id: string; total: number; paidAmount: number; date: Date }[] = [];
  for (let i = 1; i <= INVOICE_COUNT; i++) {
    const custName = pick(custNames);
    const customer = customerRows.find((c) => c.name === custName)!;
    const isInterState = customer.state !== businessState;
    const date = randomDateInRange();
    const dueDate = addDays(date, 30);
    const lineCount = randInt(1, 4);
    const lines: Line[] = [];
    for (let l = 0; l < lineCount; l++) lines.push({ sku: pick(skus), qty: randInt(1, 12) });
    const items = buildInvoiceItems(lines);
    const totals = calcTotals(items, isInterState);

    // Older invoices are more likely settled; recent ones more likely open.
    const ageDays = Math.floor((rangeEnd.getTime() - date.getTime()) / 86400000);
    const roll = rand();
    let status: "paid" | "partial" | "unpaid";
    let paidAmount = 0;
    if (ageDays > 60) status = roll < 0.75 ? "paid" : roll < 0.92 ? "partial" : "unpaid";
    else if (ageDays > 20) status = roll < 0.5 ? "paid" : roll < 0.8 ? "partial" : "unpaid";
    else status = roll < 0.25 ? "paid" : roll < 0.45 ? "partial" : "unpaid";

    if (status === "paid") paidAmount = totals.total;
    else if (status === "partial") paidAmount = Math.round(totals.total * (0.3 + rand() * 0.4));

    const invoiceNumber = `SH-2026-${String(i).padStart(4, "0")}`;
    const stockUpdates = items.map((it) => ({ productId: it.productId!, quantity: -it.quantity }));

    const inv = await withRetry(() => prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber, date, dueDate, customerId: custs[custName], userId: devAdmin.id,
          status, subtotal: totals.subtotal, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst,
          total: totals.total, paidAmount, isInterState, placeOfSupply: customer.state,
          items: { create: items },
        },
      });
      await batchAdjustStock(tx, stockUpdates, { type: "sale", reference: invoiceNumber, createdByUserId: devAdmin.id });
      if (paidAmount > 0) {
        await tx.payment.create({ data: { invoiceId: created.id, amount: paidAmount, method: pick(paymentMethods), date: addDays(date, randInt(0, 15)) } });
      }
      await tx.activityLog.create({ data: { userId: devAdmin.id, action: "invoice_create", details: `Created invoice ${invoiceNumber} for ${custName}`, entityId: created.id, entityType: "invoice", createdAt: date } });
      return created;
    }, { maxWait: 15000, timeout: 20000 }));
    invoiceIds.push({ id: inv.id, total: totals.total, paidAmount, date });
  }
  console.log(`✓ ${INVOICE_COUNT} invoices + payments + stock movements`);

  // ── Credit notes (returns) against 8 of the paid/partial invoices ────────
  const returnable = invoiceIds.filter((i) => i.paidAmount > 0);
  const RETURN_COUNT = Math.min(8, returnable.length);
  for (let i = 1; i <= RETURN_COUNT; i++) {
    const inv = returnable[randInt(0, returnable.length - 1)];
    const full = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { items: true } });
    if (!full || full.items.length === 0) continue;
    const item = pick(full.items);
    const retQty = Math.min(item.quantity, randInt(1, Math.max(1, Math.floor(item.quantity / 2))));
    if (retQty <= 0) continue;
    const gstAmount = (retQty * item.price) * (item.gstRate / 100);
    const total = retQty * item.price + gstAmount;
    const isInterState = full.isInterState;
    const creditNoteNumber = `CN-2026-${String(i).padStart(4, "0")}`;
    const returnDate = addDays(full.date, randInt(2, 20));

    await withRetry(() => prisma.$transaction(async (tx) => {
      await tx.return.create({
        data: {
          invoiceId: full.id, creditNoteNumber, date: returnDate,
          subtotal: retQty * item.price,
          cgst: isInterState ? 0 : gstAmount / 2, sgst: isInterState ? 0 : gstAmount / 2, igst: isInterState ? gstAmount : 0,
          total,
          items: { create: [{ productId: item.productId, name: item.name, quantity: retQty, price: item.price, gstRate: item.gstRate, gstAmount, total }] },
        },
      });
      if (item.productId) {
        await batchAdjustStock(tx, [{ productId: item.productId, quantity: retQty }], { type: "return", reference: creditNoteNumber, createdByUserId: devAdmin.id });
      }
      await tx.activityLog.create({ data: { userId: devAdmin.id, action: "credit_note_create", details: `Created credit note ${creditNoteNumber} against ${full.invoiceNumber}`, entityId: full.id, entityType: "invoice", createdAt: returnDate } });
    }, { maxWait: 15000, timeout: 20000 }));
  }
  console.log(`✓ ${RETURN_COUNT} credit notes`);

  // ── Purchase bills (40) across April–August 2026 ─────────────────────────
  const PURCHASE_COUNT = 40;
  for (let i = 1; i <= PURCHASE_COUNT; i++) {
    const vendorName = pick(vendorNames);
    const vendor = vendorRows.find((v) => v.name === vendorName)!;
    const isInterState = vendor.state !== businessState;
    const billDate = randomDateInRange();
    const dueDate = addDays(billDate, 30);
    const lineCount = randInt(1, 4);
    const lineSkus: Line[] = [];
    for (let l = 0; l < lineCount; l++) lineSkus.push({ sku: pick(skus), qty: randInt(5, 40) });

    const items = lineSkus.map(({ sku, qty }) => {
      const p = prods[sku];
      const purchasePrice = Math.round(p.price * 0.72);
      const lineSubtotal = qty * purchasePrice;
      const gstAmount = lineSubtotal * p.gstRate / 100;
      return { productId: p.id, name: p.name, hsn: p.hsn, quantity: qty, unit: p.unit, purchasePrice, gstRate: p.gstRate, gstAmount, total: lineSubtotal + gstAmount };
    });
    const subtotal = items.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);
    const taxAmount = items.reduce((s, i) => s + i.gstAmount, 0);
    const total = subtotal + taxAmount;

    const ageDays = Math.floor((rangeEnd.getTime() - billDate.getTime()) / 86400000);
    const roll = rand();
    let status: "paid" | "partial" | "unpaid" | "cancelled";
    let paidAmount = 0;
    if (roll > 0.95) status = "cancelled";
    else if (ageDays > 60) status = roll < 0.7 ? "paid" : roll < 0.9 ? "partial" : "unpaid";
    else if (ageDays > 20) status = roll < 0.45 ? "paid" : roll < 0.75 ? "partial" : "unpaid";
    else status = roll < 0.2 ? "paid" : roll < 0.4 ? "partial" : "unpaid";

    if (status === "paid") paidAmount = total;
    else if (status === "partial") paidAmount = Math.round(total * (0.3 + rand() * 0.4));

    const billNumber = `PB-2026-${String(i).padStart(4, "0")}`;

    await withRetry(() => prisma.$transaction(async (tx) => {
      const created = await tx.purchaseBill.create({
        data: {
          billNumber, vendorId: vendors[vendorName], billDate, dueDate,
          subtotal, taxAmount, isInterState, placeOfSupply: vendor.state,
          cgst: isInterState ? 0 : taxAmount / 2, sgst: isInterState ? 0 : taxAmount / 2, igst: isInterState ? taxAmount : 0,
          total, paidAmount, status, createdByUserId: devAdmin.id,
          items: { create: items },
        },
      });
      if (status !== "cancelled") {
        await batchAdjustStock(tx, items.map((it) => ({ productId: it.productId, quantity: it.quantity })), { type: "purchase", reference: billNumber, purchaseBillId: created.id, createdByUserId: devAdmin.id });
      }
      if (paidAmount > 0) {
        await tx.purchasePayment.create({ data: { purchaseBillId: created.id, amount: paidAmount, method: pick(paymentMethods), date: addDays(billDate, randInt(0, 15)) } });
      }
      await tx.activityLog.create({ data: { userId: devAdmin.id, action: "purchase_bill_create", details: `Created purchase bill ${billNumber} from ${vendorName}`, entityId: created.id, entityType: "purchase_bill", createdAt: billDate } });
    }, { maxWait: 15000, timeout: 20000 }));
  }
  console.log(`✓ ${PURCHASE_COUNT} purchase bills + payments + stock movements`);

  // ── Extra login activity noise ────────────────────────────────────────────
  for (let i = 0; i < 20; i++) {
    await prisma.activityLog.create({ data: { userId: devAdmin.id, action: "login", details: "Logged in", createdAt: randomDateInRange() } });
  }
  console.log("✓ Activity log noise");

  console.log("\n✅ Dummy dataset seeded (April–August 2026).");
  console.log(`   Login: ${devAdmin.email}`);
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
