# POS26

React + TypeScript + Vite + Tailwind + Supabase. PWA shell included.

## Setup
1. `npm install`
2. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/0001_init.sql` and then `supabase/migrations/0002_pos_core.sql` in order (or use `supabase db push` with the CLI).
3. Supabase → Authentication → URL Configuration: set Site URL to `http://localhost:5173` (and add your production URL later). Keep "Confirm email" ON.
4. `cp .env.example .env` and fill in the project URL and **anon** key (Settings → API). Never use the service-role key in this app.
5. `npm run dev`, register, confirm the email, sign in, and create your business workspace.

## Features
- Dashboard metrics for today's sales, orders, customers, active products, and low stock.
- Product catalogue with SKU, category, price, and archive/restore.
- Stock receipt and correction records with a movement history.
- Point of sale with customer association and an atomic checkout that validates stock, records the sale, and deducts inventory.
- Order history, receipts, and full-sale refunds that restore inventory.
- Customer contact book with order counts and lifetime completed sales.
- Cash drawer sessions, opening floats, paid-in/paid-out records, and closing variance.
- Sales reports with date ranges, top products, stock-at-retail value, and CSV export.
- Business workspace setup, account sign-in, and role-based owner/admin controls.

The workspace is configured for KES, with no tax applied. Checkout records an M-Pesa payment reference only; it does not initiate, verify, or reverse M-Pesa payments. Confirm payment through your normal M-Pesa workflow before completing checkout. Refund records do not trigger a payment reversal.

All business tables use row-level security. Checkout, refunds, inventory adjustments, cash sessions, and cash movements use database functions to keep related writes atomic and authorized.

## Build and deploy
`npm run build` → deploy `dist/` to Cloudflare Pages (build command `npm run build`, output `dist`, add the two env vars, and a SPA fallback so all routes serve `index.html`).

## Current limits
- PWA icon is SVG; add 192/512 PNG icons before store-style installs on older Android/iOS.
- M-Pesa gateway integration, payment verification/reversal, partial refunds, team invitations, and multi-currency/tax support are not included.
- Apply both migrations to your Supabase project before signing in. The repository does not provision or modify a hosted database automatically.
