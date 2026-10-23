# 0001 — All data access through audited RPCs, not table APIs

**Status:** accepted · 2026-10-23

## Context
The PRD requires server-side scope checks, distinct safe projections per audience, atomic audited
state transitions, protection against IDOR/forged roles/stale consent, and RLS at the database layer.

## Decision
- Tables live in schema `app`, which is not exposed by PostgREST, and `authenticated` has no table
  privileges. RLS is enabled on every table (deny-by-default) as a second barrier.
- Clients call `SECURITY DEFINER` functions in `public` with `search_path = ''`. Each one derives the
  caller from `auth.uid()`, checks scope, runs the transition, returns a projection, and writes
  `app.audit_events` in the same transaction.
- Other members' candidates are addressed by random public **codes** (`IM-XXXXXXX`), never UUIDs.
- Denials that must remain in the audit log are returned as `{error}` instead of raised.
- Storage: private buckets; object access re-checked by policies calling `app_policy.*` helpers.

## Consequences
- One place to review authorization (the SQL), covered by `tests/db`.
- Adding a feature means adding an RPC (no ad-hoc table queries from clients).
- No Supabase Realtime on tables; the PWA polls/refetches (acceptable at pilot scale).
