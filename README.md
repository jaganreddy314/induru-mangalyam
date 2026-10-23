# Induru Mangalyam · ఇందూరు మాంగల్యం

Private, verified, family-assisted matchmaking for the Indhur (Nizamabad) region community.
Members-only, invitation/referral based, candidate-led consent. Not a social network: no public
profiles, no open chat, no contact details until both candidates agree and explicitly share.

This repository implements the MVP described in `Induru_Mangalyam_MVP_Coding_Agent_Spec.docx`,
delivered as an installable **PWA** (instead of React Native) plus a staff **admin web app**.

```
apps/pwa        Families & candidates — React + Vite PWA, Telugu/English (M01–M22)
apps/admin      Staff console — verification, matchmaking, introductions, support, audit (A01–A10)
packages/shared Supabase client, typed RPC wrapper, DTO types, i18n (te/en), design tokens, UI kit
supabase/       Migrations (schema, RLS, RPCs, storage policies), seed, config
tests/db        Acceptance tests for PRD §15 run against the real migrations
docs/           API contract, requirement traceability, decisions & open questions
```

## Architecture in one paragraph

All data lives in Postgres schema `app`, which is **not exposed** through the Supabase Data API, and
the `authenticated` role has no table privileges. Clients call `SECURITY DEFINER` functions in
`public` (RPC). Each function authenticates the caller, checks scope server-side (family membership,
candidate ownership, explicit delegations, staff role + MFA), enforces the state machine, returns a
purpose-scoped projection, and writes an immutable audit event in the same transaction. RLS is
enabled everywhere as defence in depth; private Storage buckets (`evidence`, `photos`) have their own
policies. See [docs/decisions/0001-data-access.md](docs/decisions/0001-data-access.md).

## Prerequisites

- Node 20+ and npm 10+
- A Supabase project (hosted), **or** Docker + Supabase CLI for a local stack
- PostgreSQL 15+ on `localhost:5432` for the database test suite (no Docker needed)

## Quick start for testers (no Docker)

Needs Node 20+ and PostgreSQL on `localhost:5432`.

```bash
npm install
npm run dev:backend        # tester backend on http://127.0.0.1:54321 (real migrations + seed)
npm run dev:pwa            # family app   → http://localhost:5173
npm run dev:admin          # staff console → http://localhost:5174
```

Both apps need a `.env.local` with `VITE_SUPABASE_URL=http://127.0.0.1:54321` and any non-empty
`VITE_SUPABASE_ANON_KEY`. **Tester code: 123456** for every phone number and for staff two-factor.
The sign-in screens list the demo accounts in development builds only. `npm run dev:backend:reset`
rebuilds the demo data. `scripts/dev-backend.mjs` is a local stand-in for Supabase and must never be deployed.

## Quick start (local Supabase stack)

```bash
npm install
supabase start                 # needs Docker; applies migrations + supabase/seed.sql
cp apps/pwa/.env.example apps/pwa/.env.local     # fill with `supabase status` API URL + anon key
cp apps/admin/.env.example apps/admin/.env.local
npm run dev:pwa                # http://localhost:5173
npm run dev:admin              # http://localhost:5174
```

Demo accounts (all fictitious, OTP **123456**, from `supabase/config.toml`):

| Phone | Who | Use it to |
|---|---|---|
| +91 90000 00011 | Kotha family father | Family view: discover, shortlist, propose interest |
| +91 90000 00012 | Arjun (candidate, Kotha) | Confirm/decide interests, share contact |
| +91 90000 00021 / 22 | Pasula mother / Lakshmi | Second family |
| +91 90000 00031 / 32 | Gaddam father / Sravani | Third family |
| +91 90000 00041 | Bheemana applicant | Pending membership (no tabs) |
| +91 90000 00051 | (new) | Fresh sign-up → membership application |
| +91 90000 00001 | Super admin | Admin app (enrol TOTP on first sign-in) |
| +91 90000 00002 / 03 / 04 | Verifier / Broker / Moderator | Admin app |

## Hosted Supabase setup

1. `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations`).
2. Auth → Providers: enable **Phone** with an Indian SMS provider (Twilio / MessageBird / Textlocal /
   Vonage; DLT-registered template required in India). Disable email sign-up.
3. Auth → MFA: enable **TOTP** (required for staff).
4. Have the first administrator sign in once on the PWA, then in the SQL editor run
   `select app_private.bootstrap_super_admin('+91XXXXXXXXXX', 'Name');`
5. Replace the generated `broker_notes_key` (`update app_private.secrets set value = '<64 hex>' where key = 'broker_notes_key'`)
   with a secret managed outside the repo, before any broker notes are written.
6. Optional: schedule `select app_private.expire_stale_matches();` hourly with `pg_cron`.
7. Do **not** run `seed.sql` against production.

## Scripts

```bash
npm run test:db       # 41 DB acceptance tests (creates throwaway DBs on localhost:5432)
npm run typecheck     # all workspaces
npm run build         # PWA (with service worker) + admin
```

`TEST_DATABASE_URL` overrides the server used by the DB tests (default `postgres://localhost:5432/postgres`).
The tests load a small shim of Supabase's `auth`/`storage` schemas (`tests/db/shim.sql`) so they run
on plain PostgreSQL.

## PWA notes

- Installable (manifest + icons), offline app shell. **API responses are never cached by the service
  worker**, and React Query keeps private data in memory only.
- Language defaults to Telugu, chosen on first launch, persisted locally and on the account.
  All strings live in `packages/shared/src/i18n`; missing Telugu keys or unknown keys fail `tsc`.
- Consent, contact sharing and withdrawal require a fresh OTP (server returns `REAUTH_REQUIRED`;
  the app prompts and retries).
- Push notifications are not wired yet — notifications are in-app (see docs/open-questions.md).

## Documentation

- [docs/api-contract.md](docs/api-contract.md) — every RPC, who may call it, errors
- [docs/traceability.md](docs/traceability.md) — PRD requirement → implementation → test
- [docs/decisions/](docs/decisions/) — architecture decisions
- [docs/open-questions.md](docs/open-questions.md) — legal/policy items that must be confirmed before launch
