# Science Hub

GST billing and inventory management for a science-supplies business: invoices with financial-year auto-numbering, customers, products and stock ledger, payments, credit notes, purchases (vendors, purchase bills, payments), rate lists, PDF generation and email delivery, a GST filing package export, a recycle bin, and role/section-based access with activity logging.

**Stack:** Next.js 16 (App Router, all pages `"use client"`) · PostgreSQL on Neon via Prisma 5 · NextAuth v4 (credentials + JWT) · Nodemailer (Gmail SMTP) · Vercel Blob · CSS Modules · Vitest + Playwright. Hosted on Vercel.

> **Where the real documentation is.** [`CLAUDE.md`](CLAUDE.md) is the maintained, authoritative project reference (architecture, every API route, data models, conventions, the "Do not" rules, features built, known issues). [`DEVELOPMENT_LOG.md`](DEVELOPMENT_LOG.md) is the chronological build history and operational notes. [`STRUCTURE.md`](STRUCTURE.md) is an older developer reference (CLAUDE.md wins where they differ). `docs/` and `SECURITY_AUDIT_2026-07-03.md` are point-in-time audit records.

## Getting started

```bash
npm install                      # also runs `prisma generate` and installs the git hooks (postinstall)
cp .env.example .env             # then fill it in — see Environment below
npx prisma migrate deploy        # apply the committed migrations to your database
npm run dev                      # http://localhost:3000
```

First admin: `POST /api/setup` with `{ name, email, password }` — it refuses once any user exists, and is disabled in production after that.

`npx tsx prisma/seed.ts` fills a **development** database with a dummy dataset. It is destructive (wipes every table except one dev admin account) — never run it against a database holding real data.

After a schema change use `npx prisma migrate dev --name <change>` (stop the dev server first on Windows — the generated client DLL is locked while it runs). Every schema change must ship with a migration; a pre-commit hook enforces it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Wipes `.next`, runs `next build`, then applies migrations with a retrying `prisma migrate deploy` (migrations apply only after the app compiles) |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run check:dates` | Scans for the IST/UTC date anti-patterns (also run by the pre-commit hook) |
| `npm test` / `test:watch` / `test:coverage` | Vitest — unit tests always run; `tests/api/**` need a disposable test database (see below) |
| `npm run test:e2e` / `test:e2e:ui` | Playwright full-browser tests (start their own server on :3100) |
| `npm run seed` | Same as `npx tsx prisma/seed.ts` — destructive, dev only |

## Environment

`.env.example` lists every variable with comments. Required: `DATABASE_URL` (Neon pooled URL), `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` in production. Optional: `GMAIL_USER`/`GMAIL_APP_PASSWORD` (fallback sender), `BLOB_READ_WRITE_TOKEN` (business logo), `PRIVATE_BLOB_READ_WRITE_TOKEN` (purchase-bill attachments), `ENCRYPTION_KEY`, and `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (shared login rate limiting — without them it stays per-instance).

## Testing

Copy `.env.test.example` to `.env.test` and point `TEST_DATABASE_URL` at a **disposable** database (a dedicated Neon branch works) — the integration tests truncate every table, and Vitest refuses to start if it equals your real `DATABASE_URL`. Without it, `tests/api/**` skips itself. Details are in `CLAUDE.md` → Testing.

## Deploying

Vercel + Neon. `postinstall` generates the Prisma client — do not remove it. Set the environment variables above in the Vercel project; `NEXTAUTH_URL` must be the live domain (a stale value breaks logout redirects and password-reset links).
