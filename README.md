# Electron Email + Password Login (Supabase Auth + Entitlement RPC + HWID Lock)

This project is an Electron desktop login app that uses:

- Supabase Auth (`signInWithPassword`) for user login
- Supabase Postgres RPC (`authorize_app_access`) for entitlement + HWID gate
- A machine HWID from Electron main process (`node-machine-id`)
- A monochrome animated login UI

## 1) Install

```bash
npm install
```

## 2) Configure environment

Copy `.env.example` to `.env` (already gitignored) and adjust if needed:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

The app reads `.env` in `main.js` and passes only runtime config needed for Supabase client init to the renderer through preload IPC.

## 3) Setup database in Supabase

1. Open Supabase SQL Editor.
2. Paste `supabase.sql`.
3. Run it.

`supabase.sql` creates:

- `public.user_entitlements` table (`active` / `revoked`)
- `updated_at` trigger
- `public.authorize_app_access(p_hwid text)` RPC
- `public.has_app_access()` RPC

## 4) Create test user + entitlement

1. Create the user in Supabase Auth (Dashboard -> Authentication -> Users).
2. Insert entitlement row for that auth user id:

```sql
insert into public.user_entitlements (user_id, product_id, status)
values ('YOUR_AUTH_USER_ID', 'app_access', 'active')
on conflict (user_id, product_id)
do update set status = excluded.status;
```

`revoked` or missing entitlement blocks app access.

## 5) Run app

```bash
npm start
```

## 6) Login behavior

1. User enters email/password and clicks `Sign in`.
2. Renderer asks main process for HWID via `window.device.getHWID()`.
3. Renderer signs in with Supabase Auth:
   - `supabase.auth.signInWithPassword({ email, password })`
4. Renderer calls entitlement gate RPC:
   - `supabase.rpc('authorize_app_access', { p_hwid })`
5. Access gate enforces:
   - no entitlement -> `no_purchase_access`
   - revoked/inactive -> blocked
   - first successful access binds HWID if empty
   - mismatch -> `hwid_mismatch`
6. If gate fails, renderer signs out immediately and shows error.
7. If gate passes, app shows logged-in panel with transition.

## 7) UI error mapping

- invalid credentials -> `Invalid email or password`
- no entitlement / revoked / inactive -> `Purchase required`
- `hwid_mismatch` -> `Wrong HWID, contact support`
- missing HWID -> `HWID error`
