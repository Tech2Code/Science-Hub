@AGENTS.md

# Science Hub — Billing & Inventory

GST billing and inventory management app for a science supplies business. Next.js 16 App Router, PostgreSQL (Neon) via Prisma, NextAuth v4 (credentials + JWT).

---

## Project Structure

```
src/
  app/
    (dashboard)/          # All authenticated pages (route group, no URL segment)
      layout.tsx          # "use client" — sidebar, topbar, auth guard
      page.tsx            # Dashboard — KPI cards + recent invoices
      invoices/
        page.tsx          # Invoice list with status filter
        new/page.tsx      # Create invoice form
        [id]/page.tsx     # Invoice detail + payment recording
        edit/[id]/page.tsx
      customers/
        page.tsx          # Customer list
        new/page.tsx
        [id]/page.tsx     # Customer detail + invoice history
        edit/[id]/page.tsx
      products/
        page.tsx          # Product list
        new/page.tsx
        edit/[id]/page.tsx
      brands/page.tsx     # Brand CRUD
      payments/page.tsx   # Payment history
      reports/page.tsx    # Summary / outstanding / low-stock reports
    api/
      auth/[...nextauth]/ # NextAuth handler
      invoices/           # GET (list), POST (create)
        [id]/             # GET, PUT (edit/status), DELETE
          payment/        # POST (record payment)
      customers/          # GET, POST
        [id]/             # GET, PUT, DELETE
      products/           # GET (with ?search=), POST
        [id]/             # GET, PUT, DELETE
      brands/             # GET, POST
        [id]/             # DELETE
      categories/         # GET, POST
      payments/           # GET (all payments)
      reports/            # GET ?type=summary|outstanding|stock
      setup/              # POST (seed first admin user)
    layout.tsx            # Root server layout — fonts, Providers
    providers.tsx         # "use client" — SessionProvider + ThemeProvider
    login/page.tsx        # Login form
  components/             # Shared UI — Button, Input, Badge, Breadcrumb,
                          #   ConfirmDialog, Skeleton, Spinner
  lib/
    auth.ts               # NextAuth config (CredentialsProvider, JWT)
    db.ts                 # Server-side cached query helpers (unstable_cache)
    prisma.ts             # Prisma client singleton
    theme.tsx             # ThemeContext — light/dark via localStorage
    useCache.ts           # Client-side in-memory cache (TTL 2 min) + useFetch hook
    loading.tsx           # Full-screen loading component
  types/
    next-auth.d.ts        # Extends Session/JWT with id, role
prisma/
  schema.prisma           # PostgreSQL schema
  seed.ts                 # Seed script (npx tsx prisma/seed.ts)
```

---

## Key Files — Read Before Editing

| File | Why it matters |
|------|----------------|
| `src/lib/db.ts` | All server-side DB queries go here, wrapped in `unstable_cache`. Add new queries here, not directly in route handlers. |
| `src/lib/useCache.ts` | Client-side fetch + cache hook. `useFetch(url)` returns `{ data, loading, mutate }`. Call `mutate()` after mutations. `bustCache(url)` for one-off busting. |
| `src/lib/auth.ts` | NextAuth config. `NEXTAUTH_SECRET` must be a real secret in production. |
| `prisma/schema.prisma` | Source of truth for data model. Run `npx prisma migrate dev` after schema changes. |
| `src/app/api/invoices/route.ts` | Invoice number format is `SH-{YEAR}-{0001}`. Don't break that sequence logic. |

---

## Data Flow

All pages are `"use client"`. There are no async server components that fetch data.

```
Browser → useFetch("/api/...") → API Route Handler → unstable_cache → Prisma → Neon DB
                                         ↑ on mutation: revalidateTag(tag, { expire: 0 })
```

- **Reads**: `useFetch` hits API route → route handler calls `unstable_cache` wrapper → cache hit (fast) or DB query (first time / after mutation)
- **Writes**: POST/PUT/DELETE route handler mutates DB, then calls `revalidateTag` to expire server cache. Client calls `mutate()` to refresh its local state.

---

## Cache Tags

`revalidateTag(tag, { expire: 0 })` must be called after every mutation. Tags:

| Tag | Covers |
|-----|--------|
| `"invoices"` | Invoice list + individual invoice queries |
| `"customers"` | Customer list + individual customer queries |
| `"products"` | Product list queries |
| `"reports"` | Dashboard summary, outstanding, stock reports |

Reports are also busted on invoice and product mutations since they aggregate that data.

---

## Rules — Do Not

- **Do not** write Prisma queries directly in route handlers. Add them to `src/lib/db.ts` as `unstable_cache` wrappers.
- **Do not** add `"use cache"` directive anywhere — it requires `cacheComponents: true` which triggers "Blocking Route Server" errors on navigation.
- **Do not** add `cacheComponents: true` to `next.config.ts` — confirmed to break this app.
- **Do not** use single-arg `revalidateTag(tag)` — deprecated in Next.js 16. Always use `revalidateTag(tag, { expire: 0 })`.
- **Do not** import from `src/lib/db.ts` or `src/lib/prisma.ts` in any client component — server-only modules.
- **Do not** create a mutation route handler (POST/PUT/DELETE) without calling `revalidateTag` — lists will show stale data.
- **Do not** change the invoice number format `SH-{YYYY}-{0001}` — it appears on printed invoices.
- **Do not** remove the `postinstall` script from package.json — it generates the Prisma client on Vercel.

---

## Database Models (summary)

- **User** — id, name, email, password (bcrypt), role (admin/staff)
- **Customer** — id, name, phone, email, address, city, state, pincode, gstin
- **Product** — id, name, sku, unit, price, gstRate, stock, minStock, categoryId, brandId
- **Category** / **Brand** — id, name (unique)
- **Invoice** — invoiceNumber (unique, `SH-YYYY-0001`), date, dueDate, customerId, userId, status (unpaid/partial/paid), subtotal, cgst, sgst, igst, total, paidAmount, isInterState
- **InvoiceItem** — invoiceId, productId, name, quantity, unit, price, gstRate, gstAmount, total
- **Payment** — invoiceId, amount, method, reference, date

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string. Use the **pooled** URL (`?pgbouncer=true&connection_limit=1`) in production. |
| `NEXTAUTH_SECRET` | Yes | Random secret min 32 chars. Generate: `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | Production only | Full deployed URL e.g. `https://your-app.vercel.app`. Required by NextAuth v4. |

---

## Common Tasks

**Add a new cached query:**
1. Add an `unstable_cache` wrapper to `src/lib/db.ts`
2. Import and call it from the GET route handler
3. Add `revalidateTag` calls to any mutation handlers that affect that data

**Add a new page:**
1. Create `src/app/(dashboard)/<page>/page.tsx` with `"use client"` at top
2. Use `useFetch("/api/<resource>")` for data, call `mutate()` to refresh after writes

**Schema change:**
```bash
npx prisma migrate dev --name describe-change
npx prisma generate
```

**Seed database:**
```bash
npx tsx prisma/seed.ts
```

**First admin user (production):**
POST to `/api/setup` with `{ name, email, password }` — creates the first admin account. Delete or protect this route after first use.
