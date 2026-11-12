# KAZI360 POS — Sprint 1 foundation

React + TypeScript + Vite + Tailwind + Supabase. PWA shell included.

## Setup
1. `npm install`
2. Create a Supabase project. In **SQL Editor**, run `supabase/migrations/0001_init.sql` (or `supabase db push` with the CLI).
3. Supabase → Authentication → URL Configuration: set Site URL to `http://localhost:5173` (and add your production URL later). Keep "Confirm email" ON.
4. `cp .env.example .env` and fill in the project URL and **anon** key (Settings → API). Never use the service-role key in this app.
5. `npm run dev`, register, confirm the email, sign in, create your business.

## Build and deploy
`npm run build` → deploy `dist/` to Cloudflare Pages (build command `npm run build`, output `dist`, add the two env vars, and a SPA fallback so all routes serve `index.html`).

## Known limits (Sprint 1)
- PWA icon is SVG; add 192/512 PNG icons before store-style installs on older Android/iOS.
- POS, products, inventory, sales, cash, customers, reports are placeholder routes (Sprints 2–5).
- Checkout, refunds and cash writes will go through `security definer` SQL functions; direct client inserts are intentionally blocked by RLS for those tables.
- Not yet run: dependencies were not installed in the build environment, so `npm run build`, the SQL migration and RLS were not executed.
