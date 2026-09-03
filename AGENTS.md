# AGENTS.md

## Cursor Cloud specific instructions

`orcared` (OrçaRede) is a single **Next.js 16 (App Router, React 19, Turbopack)** web app backed by **Supabase** (Postgres + Auth + Storage + Realtime + Deno Edge Functions). Package manager is **npm** (`package-lock.json`). Standard scripts live in `package.json` (`dev`, `build`, `start`, `lint`).

### Services

| Service | Required | How to run | Notes |
| --- | --- | --- | --- |
| Next.js web app | yes | `npm run dev` (port 3000) | Needs `.env.local` (see below). `npm run build` also works. |
| Local Supabase stack | yes | `supabase start` (from repo root) | API `54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`. See schema caveat below. |
| Supabase Edge Functions | only for supplier‑PDF / AI flows | `supabase functions serve` | Deno; needs `GEMINI_API_KEY`. |
| Google Gemini | only for AI flows | external API via `GEMINI_API_KEY` | Not needed for auth/budget UI. |

### Starting services (Docker + Supabase are pre-installed in the snapshot; the update script only runs `npm install`)

The Supabase CLI and Docker are already installed in the VM image but their daemons are **not** auto-started. Each session:

1. Start the Docker daemon (it is not running on boot): `sudo dockerd &` then `sudo chmod 666 /var/run/docker.sock` (the socket is root-owned and its perms reset every time `dockerd` restarts, so re-run the `chmod` after any daemon restart to use `docker`/`supabase` without `sudo`).
2. `supabase start` from the repo root to bring up Postgres/Auth/Storage/PostgREST/Studio.
3. `npm run dev` for the app.

### Critical caveat: local DB has no base schema

The 93 files in `supabase/migrations/` are **incremental** (they start at `20260401...`). They do **not** create the core baseline tables (`budgets`, `materials`, `profiles`, `organizations`, the `current_org_id` / `is_org_admin` / `current_module_access` RPCs, etc.) — that baseline lives only in the hosted Supabase projects (dev/prod refs are in `.mcp.json`). Consequences:

- A clean `supabase start` / `supabase db reset` **fails** on `20260404000000_supplier_module.sql` with `relation "budgets" does not exist`. To bring the local stack up you must start it with the `supabase/migrations/*.sql` files temporarily moved aside (auth/storage default schemas only).
- With only the default schemas, **login/auth works** but the post-login Portal shows **0 modules** and data-driven features (budgets, pricing, suppliers, works) are empty, because their tables and RPCs are absent.
- To exercise full data flows you need the real schema: either point the app at a **hosted Supabase project** (set the env vars below to the hosted dev project) or import a schema dump (`supabase db dump`) from a hosted project into local Postgres.

### Environment variables (`.env.local`, git-ignored)

The app throws at import if Supabase vars are missing (`src/lib/supabaseClient.ts`). Minimum for local:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — get local values from `supabase status` (they are the deterministic Supabase CLI demo keys).
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`; `INTERNAL_JOB_SECRET` / `ORCAREDE_JOB_SECRET` — any dev string.
- AI/proposal flows also need `GEMINI_API_KEY` and optional `PROPOSAL_AI_*` / `SEMANTIC_MATCH_*` tuning vars.

Create a local user for auth testing via the Supabase admin API (service_role key):
`POST http://127.0.0.1:54321/auth/v1/admin/users` with `{"email":...,"password":...,"email_confirm":true}`.

### Lint

`npm run lint` runs but the repo currently reports pre-existing lint errors/warnings (React hooks rules); these are not environment problems — do not "fix" them as part of setup.
