-- Induru Mangalyam — foundation: schemas, enums, config, users, audit, helpers.
--
-- Security model (see docs/decisions/0001-data-access.md):
--   * All tables live in schema `app`, which is NOT exposed through the Data API.
--   * Clients only call SECURITY DEFINER functions in `public` (RPC). Each function
--     authenticates the caller, checks scope server-side, enforces state machines,
--     and writes an audit event in the same transaction.
--   * RLS is enabled on every table as defence in depth (deny-by-default).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
create schema if not exists app_private;

revoke all on schema app, app_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app, app_private from anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type app.membership_status as enum ('APPLIED','UNDER_REVIEW','NEEDS_INFO','APPROVED','DECLINED','SUSPENDED');
create type app.candidate_status  as enum ('DRAFT','AWAITING_CONSENT','UNDER_REVIEW','ACTIVE','PAUSED','WITHDRAWN','ARCHIVED');
create type app.match_status      as enum ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE','MUTUALLY_ACCEPTED','DECLINED','EXPIRED');
create type app.intro_stage       as enum ('PENDING_CONTACT','INTRODUCED','DISCUSSING','MEETING_PLANNED','CLOSED','MATCH_CONFIRMED');
create type app.verification_status as enum ('PENDING','IN_REVIEW','VERIFIED','FAILED','MORE_INFO');
create type app.support_status    as enum ('OPEN','TRIAGED','IN_PROGRESS','RESOLVED','ESCALATED','CLOSED');
create type app.staff_role        as enum ('verifier','broker','moderator','admin','super_admin');
create type app.visibility        as enum ('HIDDEN','MEMBERS','BROKER_ONLY');
create type app.photo_visibility  as enum ('GRANT_ONLY','MEMBERS');
create type app.consent_type      as enum ('PARTICIPATE','PUBLISH','TRADITIONAL_DETAILS');
create type app.family_capability as enum ('EDIT_BIODATA','SUGGEST_INTEREST','VIEW_INTERESTS','COORDINATE_MEETINGS');
create type app.contact_field     as enum ('FULL_NAME','PHONE','EMAIL','PHOTO');

-- ---------------------------------------------------------------------------
-- Service configuration (super admin editable, audited)
-- ---------------------------------------------------------------------------
create table app.config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into app.config (key, value) values
  ('policy_version',            '"2026-10-v1"'),
  ('require_staff_mfa',         'true'),
  ('fresh_auth_minutes',        '60'),
  -- Prohibition of Child Marriage Act minimums; confirm with counsel (PRD §14).
  ('min_age_male',              '21'),
  ('min_age_female',            '18'),
  ('invitation_ttl_hours',      '72'),
  ('interest_ttl_days',         '21'),
  ('decline_cooldown_days',     '180'),
  ('evidence_retention_days',   '90'),
  ('contact_grant_max_days',    '90'),
  ('rate_discover_per_hour',    '120'),
  ('rate_profile_per_hour',     '200'),
  ('rate_interest_per_day',     '10'),
  ('rate_report_per_day',       '10'),
  ('rate_invite_per_day',       '10');

-- Secrets used for at-rest encryption of broker notes. Replace the value in each
-- environment (e.g. from Supabase Vault) — the seed value is for development only.
create table app_private.secrets (
  key   text primary key,
  value text not null
);
insert into app_private.secrets values ('broker_notes_key', encode(extensions.gen_random_bytes(32), 'hex'));

-- ---------------------------------------------------------------------------
-- Users (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table app.users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text check (char_length(display_name) <= 80),
  phone              text,
  locale             text not null default 'te' check (locale in ('te','en')),
  status             text not null default 'ACTIVE' check (status in ('ACTIVE','RESTRICTED','DEACTIVATED')),
  notification_prefs jsonb not null default '{"muted":[],"quiet_hours":null}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index users_phone_idx on app.users (phone);

-- Staff roles are scoped assignments, never a single global user role (PRD §2).
create table app.role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users (id) on delete cascade,
  role        app.staff_role not null,
  scope_type  text not null default 'GLOBAL' check (scope_type in ('GLOBAL','DISTRICT')),
  scope_id    text,
  granted_by  uuid references app.users (id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references app.users (id),
  check ((scope_type = 'GLOBAL') = (scope_id is null))
);
create unique index role_assignments_active_uq
  on app.role_assignments (user_id, role, scope_type, coalesce(scope_id, ''))
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Audit (immutable)
-- ---------------------------------------------------------------------------
create table app.audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text not null,
  object_type text not null,
  object_id   uuid,
  outcome     text not null default 'ALLOWED' check (outcome in ('ALLOWED','DENIED')),
  occurred_at timestamptz not null default now(),
  request_id  text,
  metadata    jsonb not null default '{}'
);
create index audit_events_occurred_idx on app.audit_events (occurred_at desc, id desc);
create index audit_events_object_idx on app.audit_events (object_type, object_id);
create index audit_events_actor_idx on app.audit_events (actor_id, occurred_at desc);

create function app_private.audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end $$;

create trigger audit_events_immutable
  before update or delete or truncate on app.audit_events
  for each statement execute function app_private.audit_immutable();

-- Rate limiting buckets
create table app.rate_events (
  user_id uuid not null,
  bucket  text not null,
  at      timestamptz not null default now()
);
create index rate_events_lookup_idx on app.rate_events (user_id, bucket, at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Raises a stable machine error code. PostgREST surfaces it as
-- {code:'P0001', message:<CODE>, hint:<human message>, details:<json>}.
create function app_private.fail(p_code text, p_hint text default null, p_details jsonb default null)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_code,
    hint = coalesce(p_hint, ''), detail = coalesce(p_details::text, '');
end $$;

create function app_private.cfg(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from app.config where key = p_key
$$;

create function app_private.cfg_int(p_key text) returns int
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::int from app.config where key = p_key
$$;

create function app_private.request_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-request-id',
    'srv-' || gen_random_uuid()::text)
$$;

create function app_private.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function app_private.audit(
  p_action text, p_object_type text, p_object_id uuid,
  p_metadata jsonb default '{}', p_outcome text default 'ALLOWED')
returns void language sql security definer set search_path = '' as $$
  insert into app.audit_events (actor_id, action, object_type, object_id, outcome, request_id, metadata)
  values ((select auth.uid()), p_action, p_object_type, p_object_id, p_outcome,
          app_private.request_id(), coalesce(p_metadata, '{}'));
$$;

-- Returns the authenticated, active caller or raises.
create function app_private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then perform app_private.fail('UNAUTHENTICATED'); end if;
  select status into v_status from app.users where id = v_uid;
  if v_status is null then perform app_private.fail('PROFILE_NOT_INITIALISED'); end if;
  if v_status <> 'ACTIVE' then perform app_private.fail('ACCOUNT_RESTRICTED'); end if;
  return v_uid;
end $$;

-- Step-up check: the session must come from an OTP verification in the last N minutes.
create function app_private.require_recent_auth() returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_latest bigint;
begin
  select max((e ->> 'timestamp')::bigint) into v_latest
  from jsonb_array_elements(coalesce(app_private.jwt() -> 'amr', '[]')) e;
  if v_latest is null
     or to_timestamp(v_latest) < now() - make_interval(mins => app_private.cfg_int('fresh_auth_minutes')) then
    perform app_private.fail('REAUTH_REQUIRED', 'Please verify your phone again to continue.');
  end if;
end $$;

create function app_private.has_role(p_roles app.staff_role[], p_uid uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.role_assignments ra
    where ra.user_id = coalesce(p_uid, (select auth.uid()))
      and ra.revoked_at is null
      and (ra.role = any (p_roles) or ra.role = 'super_admin')
  )
$$;

-- Staff gate: role + MFA (aal2) + active account.
create function app_private.require_staff(p_roles app.staff_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
begin
  if not app_private.has_role(p_roles, v_uid) then
    perform app_private.fail('FORBIDDEN', 'Staff permission required.');
  end if;
  if (app_private.cfg('require_staff_mfa'))::boolean
     and coalesce(app_private.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    perform app_private.fail('MFA_REQUIRED', 'Complete two-factor verification.');
  end if;
  return v_uid;
end $$;

create function app_private.rate_limit(p_bucket text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  select count(*) into v_count from app.rate_events
  where user_id = v_uid and bucket = p_bucket and at > now() - p_window;
  if v_count >= p_max then
    perform app_private.fail('RATE_LIMITED', 'Too many requests. Please try again later.');
  end if;
  insert into app.rate_events (user_id, bucket) values (v_uid, p_bucket);
end $$;

-- Opaque, non-sequential public codes (no ambiguous characters).
create function app_private.random_code(p_prefix text, p_len int default 7) returns text
language plpgsql volatile as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(p_len);
  v_out text := p_prefix;
begin
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_out;
end $$;

create function app_private.sha256(p text) returns text
language sql immutable as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

create function app_private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger users_touch before update on app.users
  for each row execute function app_private.touch_updated_at();

alter table app.config            enable row level security;
alter table app.users             enable row level security;
alter table app.role_assignments  enable row level security;
alter table app.audit_events      enable row level security;
alter table app.rate_events       enable row level security;
alter table app_private.secrets   enable row level security;

-- Denials that must be audited cannot raise (the audit row would roll back with the
-- transaction). Such functions return {"error": CODE} instead; the API client turns it
-- into the same ApiError shape as a raised error.
create function app_private.denied(p_code text, p_action text, p_object_type text, p_object_id uuid,
                                   p_metadata jsonb default '{}', p_hint text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.audit(p_action, p_object_type, p_object_id, p_metadata, 'DENIED');
  return jsonb_build_object('error', p_code, 'message', p_hint);
end $$;
