-- Families, membership applications, invitations, verification cases & evidence, notifications.

create table app.families (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique default app_private.random_code('F-', 6),
  name                 text not null check (char_length(name) between 2 and 80),
  district             text not null check (char_length(district) between 2 and 60),
  hometown             text not null check (char_length(hometown) between 2 and 80),
  status               app.membership_status not null default 'APPLIED',
  eligibility_declared_at timestamptz not null,
  applicant_message    text,          -- shown to applicant for NEEDS_INFO / DECLINED
  internal_notes       text,          -- staff only
  created_by           uuid not null references app.users (id),
  decided_by           uuid references app.users (id),
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index families_status_idx on app.families (status, created_at);
create trigger families_touch before update on app.families
  for each row execute function app_private.touch_updated_at();

create table app.family_members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references app.families (id) on delete cascade,
  user_id    uuid not null references app.users (id) on delete cascade,
  relation   text not null check (relation in ('FATHER','MOTHER','GUARDIAN','SIBLING','RELATIVE','CANDIDATE')),
  is_primary boolean not null default false,
  can_invite boolean not null default false,
  active     boolean not null default true,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz
);
-- MVP decision: a user belongs to at most one active family (docs/decisions/0002).
create unique index family_members_one_active_family on app.family_members (user_id) where active;
create index family_members_family_idx on app.family_members (family_id) where active;

create table app.referrals (
  id                  uuid primary key default gen_random_uuid(),
  applicant_family_id uuid not null references app.families (id) on delete cascade,
  referee_family_code text,
  referee_name        text not null check (char_length(referee_name) between 2 and 80),
  referee_phone       text check (referee_phone ~ '^\+[1-9][0-9]{7,14}$'),
  relation_to_applicant text check (char_length(relation_to_applicant) <= 60),
  check_status        text not null default 'PENDING' check (check_status in ('PENDING','CONFIRMED','UNCONFIRMED')),
  checked_by          uuid references app.users (id),
  checked_at          timestamptz,
  notes               text,
  created_at          timestamptz not null default now()
);
create index referrals_family_idx on app.referrals (applicant_family_id);

create table app.invitations (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('FAMILY_MEMBER','CANDIDATE')),
  family_id    uuid not null references app.families (id) on delete cascade,
  candidate_id uuid,  -- FK added in candidates migration
  phone        text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  relation     text,
  token_hash   text not null unique,
  invited_by   uuid not null references app.users (id),
  expires_at   timestamptz not null,
  accepted_by  uuid references app.users (id),
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  check ((kind = 'CANDIDATE') = (candidate_id is not null))
);
create index invitations_family_idx on app.invitations (family_id);
create index invitations_candidate_idx on app.invitations (candidate_id) where candidate_id is not null;

create table app.verification_cases (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('MEMBERSHIP','CANDIDATE')),
  subject_id  uuid not null,
  reviewer_id uuid references app.users (id),
  status      app.verification_status not null default 'PENDING',
  decision    text,
  reasons     text,
  checklist   jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index verification_cases_open_uq on app.verification_cases (type, subject_id)
  where status in ('PENDING','IN_REVIEW','MORE_INFO');
create index verification_cases_queue_idx on app.verification_cases (type, status, created_at);
create index verification_cases_reviewer_idx on app.verification_cases (reviewer_id) where reviewer_id is not null;
create trigger verification_cases_touch before update on app.verification_cases
  for each row execute function app_private.touch_updated_at();

-- Evidence files live in the private `evidence` bucket. No Aadhaar type by design.
create table app.verification_evidence (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references app.verification_cases (id) on delete cascade,
  type          text not null check (type in ('REFERENCE_LETTER','COMMUNITY_DOCUMENT','EDUCATION','EMPLOYMENT','OTHER')),
  storage_path  text not null unique,
  uploaded_by   uuid not null references app.users (id),
  uploaded_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  deleted_at    timestamptz,
  review_status text not null default 'PENDING' check (review_status in ('PENDING','ACCEPTED','REJECTED'))
);
create index verification_evidence_case_idx on app.verification_evidence (case_id);
create index verification_evidence_expiry_idx on app.verification_evidence (expires_at) where deleted_at is null;

-- Notifications carry only a template key and opaque references (PRD §13).
create table app.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references app.users (id) on delete cascade,
  template_key text not null,
  payload      jsonb not null default '{}',
  status       text not null default 'UNREAD' check (status in ('UNREAD','READ')),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index notifications_recipient_idx on app.notifications (recipient_id, created_at desc);

alter table app.families              enable row level security;
alter table app.family_members        enable row level security;
alter table app.referrals             enable row level security;
alter table app.invitations           enable row level security;
alter table app.verification_cases    enable row level security;
alter table app.verification_evidence enable row level security;
alter table app.notifications         enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app_private.notify(p_recipient uuid, p_template text, p_payload jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into app.notifications (recipient_id, template_key, payload)
  values (p_recipient, p_template, coalesce(p_payload, '{}'));
$$;

create function app_private.notify_staff(p_roles app.staff_role[], p_template text, p_payload jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into app.notifications (recipient_id, template_key, payload)
  select distinct ra.user_id, p_template, coalesce(p_payload, '{}')
  from app.role_assignments ra
  where ra.revoked_at is null and ra.role = any (p_roles);
$$;

create function app_private.my_family_id(p_uid uuid default null) returns uuid
language sql stable security definer set search_path = '' as $$
  select fm.family_id from app.family_members fm
  where fm.user_id = coalesce(p_uid, (select auth.uid())) and fm.active
$$;

-- Approved family gate for member features (discovery, shortlist, interests).
create function app_private.require_approved_family() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid;
  v_status app.membership_status;
begin
  select f.id, f.status into v_family, v_status
  from app.family_members fm join app.families f on f.id = fm.family_id
  where fm.user_id = v_uid and fm.active;
  if v_family is null or v_status <> 'APPROVED' then
    perform app_private.fail('MEMBERSHIP_PENDING', 'Your family membership is not approved yet.');
  end if;
  return v_family;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: session bootstrap
-- ---------------------------------------------------------------------------
create function public.ensure_profile(p_locale text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
begin
  if v_uid is null then perform app_private.fail('UNAUTHENTICATED'); end if;
  select case when u.phone is null or u.phone = '' then null
              when left(u.phone, 1) = '+' then u.phone else '+' || u.phone end
    into v_phone from auth.users u where u.id = v_uid;
  insert into app.users (id, phone, locale)
  values (v_uid, v_phone, coalesce(p_locale, 'te'))
  on conflict (id) do update
    set phone  = excluded.phone,
        locale = coalesce(p_locale, app.users.locale);
  return public.get_session_state();
end $$;

create function public.set_preferences(p_locale text default null, p_display_name text default null,
                                       p_notification_prefs jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_user();
begin
  if p_locale is not null and p_locale not in ('te','en') then
    perform app_private.fail('VALIDATION', 'Unsupported language');
  end if;
  update app.users set
    locale = coalesce(p_locale, locale),
    display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
    notification_prefs = coalesce(p_notification_prefs, notification_prefs)
  where id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: membership application (M04–M06)
-- ---------------------------------------------------------------------------
create function public.apply_membership(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid;
  v_case uuid;
begin
  -- Idempotent: an existing (non-declined) membership is returned unchanged.
  select fm.family_id into v_family from app.family_members fm where fm.user_id = v_uid and fm.active;
  if v_family is not null then
    return public.get_my_membership();
  end if;

  if coalesce((p ->> 'eligibility_declaration')::boolean, false) is not true then
    perform app_private.fail('VALIDATION', 'Eligibility declaration is required.', '{"field":"eligibility_declaration"}');
  end if;
  if coalesce(p ->> 'relation', '') not in ('FATHER','MOTHER','GUARDIAN','SIBLING','RELATIVE','CANDIDATE') then
    perform app_private.fail('VALIDATION', 'Relation is required.', '{"field":"relation"}');
  end if;
  if char_length(coalesce(trim(p ->> 'applicant_name'), '')) < 2 then
    perform app_private.fail('VALIDATION', 'Name is required.', '{"field":"applicant_name"}');
  end if;

  update app.users set display_name = trim(p ->> 'applicant_name') where id = v_uid;

  insert into app.families (name, district, hometown, status, eligibility_declared_at, created_by)
  values (trim(p ->> 'family_name'), trim(p ->> 'district'), trim(p ->> 'hometown'),
          'APPLIED', now(), v_uid)
  returning id into v_family;

  insert into app.family_members (family_id, user_id, relation, is_primary, can_invite)
  values (v_family, v_uid, p ->> 'relation', true, true);

  if p ? 'referral' and coalesce(trim(p -> 'referral' ->> 'name'), '') <> '' then
    insert into app.referrals (applicant_family_id, referee_family_code, referee_name, referee_phone, relation_to_applicant)
    values (v_family, nullif(upper(trim(p -> 'referral' ->> 'family_code')), ''),
            trim(p -> 'referral' ->> 'name'), nullif(trim(p -> 'referral' ->> 'phone'), ''),
            nullif(trim(p -> 'referral' ->> 'relation'), ''));
  end if;

  insert into app.verification_cases (type, subject_id) values ('MEMBERSHIP', v_family) returning id into v_case;

  perform app_private.audit('membership.apply', 'family', v_family);
  perform app_private.notify(v_uid, 'membership.submitted', jsonb_build_object('family_id', v_family));
  perform app_private.notify_staff(array['verifier','admin']::app.staff_role[], 'staff.membership_queued', jsonb_build_object('case_id', v_case));
  return public.get_my_membership();
end $$;

create function public.get_my_membership()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_out jsonb;
begin
  select jsonb_build_object(
      'family_id', f.id, 'family_code', f.code, 'family_name', f.name,
      'district', f.district, 'hometown', f.hometown,
      'status', f.status, 'applicant_message', f.applicant_message,
      'relation', fm.relation, 'is_primary', fm.is_primary, 'can_invite', fm.can_invite,
      'submitted_at', f.created_at, 'decided_at', f.decided_at,
      'case_id', (select vc.id from app.verification_cases vc
                  where vc.type = 'MEMBERSHIP' and vc.subject_id = f.id
                  order by vc.created_at desc limit 1),
      'evidence_count', (select count(*) from app.verification_evidence ve
                         join app.verification_cases vc on vc.id = ve.case_id
                         where vc.subject_id = f.id and ve.deleted_at is null),
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                     'user_id', m.user_id, 'name', u.display_name, 'relation', m.relation,
                     'is_primary', m.is_primary, 'is_me', m.user_id = v_uid) order by m.joined_at), '[]')
                  from app.family_members m join app.users u on u.id = m.user_id
                  where m.family_id = f.id and m.active))
    into v_out
  from app.family_members fm join app.families f on f.id = fm.family_id
  where fm.user_id = v_uid and fm.active;
  return v_out;  -- null when the user has not applied
end $$;

-- Applicant responds to NEEDS_INFO.
create function public.update_membership_application(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid;
  v_status app.membership_status;
begin
  select f.id, f.status into v_family, v_status
  from app.family_members fm join app.families f on f.id = fm.family_id
  where fm.user_id = v_uid and fm.active and fm.is_primary;
  if v_family is null then perform app_private.fail('NOT_FOUND'); end if;
  if v_status not in ('APPLIED','NEEDS_INFO') then
    perform app_private.fail('INVALID_STATE', 'Application can no longer be edited.');
  end if;

  update app.families set
    name     = coalesce(nullif(trim(p ->> 'family_name'), ''), name),
    district = coalesce(nullif(trim(p ->> 'district'), ''), district),
    hometown = coalesce(nullif(trim(p ->> 'hometown'), ''), hometown),
    status   = case when status = 'NEEDS_INFO' then 'UNDER_REVIEW'::app.membership_status else status end
  where id = v_family;

  if p ? 'referral' and coalesce(trim(p -> 'referral' ->> 'name'), '') <> '' then
    insert into app.referrals (applicant_family_id, referee_family_code, referee_name, referee_phone, relation_to_applicant)
    values (v_family, nullif(upper(trim(p -> 'referral' ->> 'family_code')), ''),
            trim(p -> 'referral' ->> 'name'), nullif(trim(p -> 'referral' ->> 'phone'), ''),
            nullif(trim(p -> 'referral' ->> 'relation'), ''));
  end if;

  update app.verification_cases set status = 'IN_REVIEW'
  where type = 'MEMBERSHIP' and subject_id = v_family and status = 'MORE_INFO';

  perform app_private.audit('membership.update', 'family', v_family);
  return public.get_my_membership();
end $$;

-- Registers a file the applicant uploaded to evidence/<case_id>/<uuid>.<ext>.
create function public.register_evidence(p_case_id uuid, p_type text, p_storage_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_ok boolean;
  v_id uuid;
begin
  select exists (
    select 1 from app.verification_cases vc
    where vc.id = p_case_id and vc.status in ('PENDING','IN_REVIEW','MORE_INFO')
      and (
        (vc.type = 'MEMBERSHIP' and vc.subject_id = app_private.my_family_id(v_uid))
        or (vc.type = 'CANDIDATE' and exists (
              select 1 from app.family_candidates fc
              where fc.candidate_id = vc.subject_id and fc.revoked_at is null
                and fc.family_id = app_private.my_family_id(v_uid)))
      )) into v_ok;
  if not v_ok then perform app_private.fail('FORBIDDEN'); end if;
  if split_part(p_storage_path, '/', 1) <> p_case_id::text then
    perform app_private.fail('VALIDATION', 'Invalid storage path.');
  end if;

  insert into app.verification_evidence (case_id, type, storage_path, uploaded_by, expires_at)
  values (p_case_id, p_type, p_storage_path, v_uid,
          now() + make_interval(days => app_private.cfg_int('evidence_retention_days')))
  returning id into v_id;
  perform app_private.audit('evidence.register', 'verification_evidence', v_id, jsonb_build_object('type', p_type));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: family member invitations
-- ---------------------------------------------------------------------------
create function public.create_family_invitation(p_phone text, p_relation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
  v_token text := encode(extensions.gen_random_bytes(24), 'base64');
  v_id uuid;
begin
  if not exists (select 1 from app.family_members where user_id = v_uid and family_id = v_family and active and can_invite) then
    perform app_private.fail('FORBIDDEN', 'You do not have permission to invite family members.');
  end if;
  if p_relation not in ('FATHER','MOTHER','GUARDIAN','SIBLING','RELATIVE') then
    perform app_private.fail('VALIDATION', 'Invalid relation.', '{"field":"relation"}');
  end if;
  perform app_private.rate_limit('invite', app_private.cfg_int('rate_invite_per_day'), interval '1 day');
  v_token := translate(v_token, '+/=', '-_');

  insert into app.invitations (kind, family_id, phone, relation, token_hash, invited_by, expires_at)
  values ('FAMILY_MEMBER', v_family, p_phone, p_relation, app_private.sha256(v_token), v_uid,
          now() + make_interval(hours => app_private.cfg_int('invitation_ttl_hours')))
  returning id into v_id;
  perform app_private.audit('invitation.create', 'invitation', v_id, jsonb_build_object('kind', 'FAMILY_MEMBER'));
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end $$;

create function public.get_invitation(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_out jsonb;
begin
  select jsonb_build_object(
      'kind', i.kind, 'family_name', f.name, 'relation', i.relation,
      'expired', i.expires_at < now(), 'used', i.accepted_at is not null or i.revoked_at is not null,
      'phone_matches', i.phone = (select phone from app.users where id = v_uid))
    into v_out
  from app.invitations i join app.families f on f.id = i.family_id
  where i.token_hash = app_private.sha256(p_token);
  if v_out is null then perform app_private.fail('NOT_FOUND', 'Invitation not found.'); end if;
  return v_out;
end $$;
