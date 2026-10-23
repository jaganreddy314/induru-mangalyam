-- Candidates, biodata, consent, family delegation, privacy settings and eligibility (I1).

create table app.candidates (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default app_private.random_code('IM-', 7),
  created_by       uuid not null references app.users (id),
  owner_user_id    uuid unique references app.users (id),
  status           app.candidate_status not null default 'DRAFT',
  visibility       app.visibility not null default 'HIDDEN',
  photo_visibility app.photo_visibility not null default 'GRANT_ONLY',
  suspended_at     timestamptz,
  suspended_reason text,
  verified_at      timestamptz,
  published_at     timestamptz,
  paused_at        timestamptz,
  withdrawn_at     timestamptz,
  version          int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index candidates_discovery_idx on app.candidates (published_at desc, id desc)
  where status = 'ACTIVE' and suspended_at is null;
create trigger candidates_touch before update on app.candidates
  for each row execute function app_private.touch_updated_at();

alter table app.invitations
  add constraint invitations_candidate_fk foreign key (candidate_id) references app.candidates (id) on delete cascade;

create table app.family_candidates (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references app.families (id) on delete cascade,
  candidate_id uuid not null references app.candidates (id) on delete cascade,
  relationship text not null check (relationship in ('SON','DAUGHTER','SELF','SIBLING','WARD','RELATIVE')),
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create unique index family_candidates_active_uq on app.family_candidates (candidate_id) where revoked_at is null;
create index family_candidates_family_idx on app.family_candidates (family_id) where revoked_at is null;

create table app.candidate_details (
  candidate_id   uuid primary key references app.candidates (id) on delete cascade,
  first_name     text not null check (char_length(first_name) between 1 and 40),
  gender         text not null check (gender in ('MALE','FEMALE')),
  dob            date not null,                       -- private; only age is shown
  height_cm      int check (height_cm between 120 and 230),
  marital_status text not null default 'NEVER_MARRIED'
                   check (marital_status in ('NEVER_MARRIED','DIVORCED','WIDOWED','AWAITING_DIVORCE')),
  education      text check (char_length(education) <= 120),
  profession     text check (char_length(profession) <= 120),
  city           text check (char_length(city) <= 60),
  district       text check (char_length(district) <= 60),
  state          text check (char_length(state) <= 60),
  country        text not null default 'IN',
  bio            text check (char_length(bio) <= 1000),
  family_summary text check (char_length(family_summary) <= 600),
  customs        jsonb not null default '{}',         -- traditional details; shown only with consent
  photo_path     text,
  photo_approved boolean not null default false,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references app.users (id)
);
create index candidate_details_filter_idx on app.candidate_details (gender, district);

-- Contact data. Only readable through scoped contact grants (I3).
create table app.candidate_private (
  candidate_id uuid primary key references app.candidates (id) on delete cascade,
  full_name    text check (char_length(full_name) <= 120),
  phone        text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email        text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at   timestamptz not null default now()
);

create table app.candidate_preferences (
  candidate_id       uuid primary key references app.candidates (id) on delete cascade,
  age_min            int check (age_min between 18 and 80),
  age_max            int check (age_max between 18 and 80),
  districts          text[] not null default '{}',
  open_to_relocation boolean,
  education          text check (char_length(education) <= 120),
  notes              text check (char_length(notes) <= 500),
  updated_at         timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);

-- Field-level change history for staff review (A04).
create table app.candidate_detail_history (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references app.candidates (id) on delete cascade,
  changed_by   uuid,
  changed_at   timestamptz not null default now(),
  changes      jsonb not null
);
create index candidate_detail_history_idx on app.candidate_detail_history (candidate_id, changed_at desc);

create table app.consents (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references app.candidates (id) on delete cascade,
  actor_user_id uuid not null references app.users (id),
  consent_type  app.consent_type not null,
  policy_version text not null,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  evidence      jsonb not null default '{}'
);
create unique index consents_active_uq on app.consents (candidate_id, consent_type) where revoked_at is null;

create table app.family_permissions (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid not null references app.candidates (id) on delete cascade,
  delegate_user_id uuid not null references app.users (id) on delete cascade,
  capability       app.family_capability not null,
  granted_by       uuid not null references app.users (id),
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz
);
create unique index family_permissions_active_uq
  on app.family_permissions (candidate_id, delegate_user_id, capability) where revoked_at is null;
create index family_permissions_delegate_idx on app.family_permissions (delegate_user_id) where revoked_at is null;

-- Family-level blocks: hide candidates across the two families in both directions.
create table app.blocks (
  id                   uuid primary key default gen_random_uuid(),
  blocker_family_id    uuid not null references app.families (id) on delete cascade,
  blocked_candidate_id uuid not null references app.candidates (id) on delete cascade,
  created_by           uuid not null references app.users (id),
  created_at           timestamptz not null default now(),
  unique (blocker_family_id, blocked_candidate_id)
);

alter table app.candidates               enable row level security;
alter table app.family_candidates        enable row level security;
alter table app.candidate_details        enable row level security;
alter table app.candidate_private        enable row level security;
alter table app.candidate_preferences    enable row level security;
alter table app.candidate_detail_history enable row level security;
alter table app.consents                 enable row level security;
alter table app.family_permissions       enable row level security;
alter table app.blocks                   enable row level security;

create function app_private.log_detail_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb;
begin
  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value and n.key not in ('updated_at','updated_by');
  if v_changes is not null then
    insert into app.candidate_detail_history (candidate_id, changed_by, changes)
    values (new.candidate_id, auth.uid(), v_changes);
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger candidate_details_history before update on app.candidate_details
  for each row execute function app_private.log_detail_changes();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app_private.age_years(p_dob date) returns int
language sql stable as $$ select extract(year from age(current_date, p_dob))::int $$;

create function app_private.min_age(p_gender text) returns int
language sql stable security definer set search_path = '' as $$
  select case when p_gender = 'MALE' then app_private.cfg_int('min_age_male')
              else app_private.cfg_int('min_age_female') end
$$;

create function app_private.candidate_family(p_candidate uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select family_id from app.family_candidates where candidate_id = p_candidate and revoked_at is null
$$;

create function app_private.has_consent(p_candidate uuid, p_type app.consent_type) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.consents
                 where candidate_id = p_candidate and consent_type = p_type and revoked_at is null)
$$;

-- Can the caller act for a candidate with a given capability?
--   * the candidate themself (owner) — always
--   * an unclaimed draft — any active member of the candidate's family may edit biodata
--   * otherwise — an unrevoked, explicit delegation from the candidate, and the delegate
--     must still be an active member of the candidate's family (I4: no resurrection).
create function app_private.can_act_for(p_candidate uuid, p_cap app.family_capability, p_uid uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select coalesce(p_uid, (select auth.uid())) as uid),
       c as (select id, owner_user_id from app.candidates where id = p_candidate)
  select coalesce((
    select case
      when c.owner_user_id = me.uid then true
      when not exists (select 1 from app.family_members fm
                       where fm.user_id = me.uid and fm.active
                         and fm.family_id = app_private.candidate_family(c.id)) then false
      when c.owner_user_id is null then p_cap = 'EDIT_BIODATA'
      else exists (select 1 from app.family_permissions fp
                   where fp.candidate_id = c.id and fp.delegate_user_id = me.uid
                     and fp.capability = p_cap and fp.revoked_at is null)
    end
    from c, me), false)
$$;

create function app_private.is_candidate_owner(p_candidate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.candidates where id = p_candidate and owner_user_id = (select auth.uid()))
$$;

-- Invariant I1 — discovery eligibility. p_audience: 'MEMBERS' or 'BROKER'.
create function app_private.is_discoverable(p_candidate uuid, p_audience text default 'MEMBERS')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from app.candidates c
    join app.family_candidates fc on fc.candidate_id = c.id and fc.revoked_at is null
    join app.families f on f.id = fc.family_id
    join app.candidate_details d on d.candidate_id = c.id
    join app.users ou on ou.id = c.owner_user_id
    where c.id = p_candidate
      and c.status = 'ACTIVE'
      and c.suspended_at is null
      and c.verified_at is not null
      and f.status = 'APPROVED'
      and ou.status = 'ACTIVE'
      and (c.visibility = 'MEMBERS' or (p_audience = 'BROKER' and c.visibility = 'BROKER_ONLY'))
      and app_private.age_years(d.dob) >= app_private.min_age(d.gender)
      and app_private.has_consent(c.id, 'PARTICIPATE')
      and app_private.has_consent(c.id, 'PUBLISH')
  )
$$;

create function app_private.is_blocked_between(p_family uuid, p_candidate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.blocks b
    where (b.blocker_family_id = p_family and b.blocked_candidate_id = p_candidate)
       or (b.blocker_family_id = app_private.candidate_family(p_candidate)
           and app_private.candidate_family(b.blocked_candidate_id) = p_family)
  )
$$;

-- Discoverable *for this viewer's family* (adds own-family exclusion and blocks).
create function app_private.visible_to_family(p_candidate uuid, p_family uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_discoverable(p_candidate, 'MEMBERS')
     and app_private.candidate_family(p_candidate) is distinct from p_family
     and not app_private.is_blocked_between(p_family, p_candidate)
$$;

-- Safe public projection used by discovery, shortlist, interests (never contact/ID data).
create function app_private.public_card(p_candidate uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', c.code,
    'age', app_private.age_years(d.dob),
    'gender', d.gender,
    'height_cm', d.height_cm,
    'marital_status', d.marital_status,
    'education', d.education,
    'profession', d.profession,
    'city', d.city,
    'district', d.district,
    'verified', c.verified_at is not null,
    'has_photo', d.photo_path is not null and d.photo_approved and c.photo_visibility = 'MEMBERS')
  from app.candidates c join app.candidate_details d on d.candidate_id = c.id
  where c.id = p_candidate
$$;

-- ---------------------------------------------------------------------------
-- RPC: invitations (accept for both family-member and candidate kinds) — M09
-- ---------------------------------------------------------------------------
create function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_inv app.invitations;
  v_phone text;
  v_existing_family uuid;
begin
  select * into v_inv from app.invitations where token_hash = app_private.sha256(p_token) for update;
  if v_inv.id is null then perform app_private.fail('NOT_FOUND', 'Invitation not found.'); end if;
  if v_inv.revoked_at is not null or v_inv.accepted_at is not null then
    perform app_private.fail('INVALID_STATE', 'This invitation has already been used.');
  end if;
  if v_inv.expires_at < now() then perform app_private.fail('INVITATION_EXPIRED'); end if;

  select phone into v_phone from app.users where id = v_uid;
  -- The invitee must authenticate on their own phone; the inviter can never accept.
  if v_phone is distinct from v_inv.phone or v_uid = v_inv.invited_by then
    return app_private.denied('INVITATION_PHONE_MISMATCH', 'invitation.accept', 'invitation', v_inv.id,
      jsonb_build_object('reason', 'phone_mismatch_or_inviter'),
      'Sign in with the phone number this invitation was sent to.');
  end if;

  v_existing_family := app_private.my_family_id(v_uid);
  if v_existing_family is not null and v_existing_family <> v_inv.family_id then
    perform app_private.fail('INVALID_STATE', 'You already belong to another family account.');
  end if;

  if v_existing_family is null then
    insert into app.family_members (family_id, user_id, relation)
    values (v_inv.family_id, v_uid, case when v_inv.kind = 'CANDIDATE' then 'CANDIDATE' else v_inv.relation end);
  end if;

  if v_inv.kind = 'CANDIDATE' then
    if exists (select 1 from app.candidates where owner_user_id = v_uid) then
      perform app_private.fail('INVALID_STATE', 'You already own a candidate profile.');
    end if;
    update app.candidates
      set owner_user_id = v_uid,
          status = case when status = 'DRAFT' then 'AWAITING_CONSENT'::app.candidate_status else status end
    where id = v_inv.candidate_id and owner_user_id is null;
    if not found then perform app_private.fail('INVALID_STATE', 'Profile already claimed.'); end if;
    insert into app.candidate_private (candidate_id, phone) values (v_inv.candidate_id, v_phone)
      on conflict (candidate_id) do update set phone = coalesce(app.candidate_private.phone, excluded.phone);
  end if;

  update app.invitations set accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform app_private.audit('invitation.accept', 'invitation', v_inv.id, jsonb_build_object('kind', v_inv.kind));
  perform app_private.notify(v_inv.invited_by, 'invitation.accepted', jsonb_build_object('invitation_id', v_inv.id));
  return jsonb_build_object('kind', v_inv.kind, 'candidate_id', v_inv.candidate_id);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: candidate drafts & biodata (M08)
-- ---------------------------------------------------------------------------
create function app_private.apply_detail_fields(p_candidate uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.candidate_details set
    first_name     = coalesce(nullif(trim(p ->> 'first_name'), ''), first_name),
    gender         = coalesce(p ->> 'gender', gender),
    dob            = coalesce((p ->> 'dob')::date, dob),
    height_cm      = case when p ? 'height_cm' then (p ->> 'height_cm')::int else height_cm end,
    marital_status = coalesce(p ->> 'marital_status', marital_status),
    education      = case when p ? 'education' then nullif(trim(p ->> 'education'), '') else education end,
    profession     = case when p ? 'profession' then nullif(trim(p ->> 'profession'), '') else profession end,
    city           = case when p ? 'city' then nullif(trim(p ->> 'city'), '') else city end,
    district       = case when p ? 'district' then nullif(trim(p ->> 'district'), '') else district end,
    state          = case when p ? 'state' then nullif(trim(p ->> 'state'), '') else state end,
    bio            = case when p ? 'bio' then nullif(trim(p ->> 'bio'), '') else bio end,
    family_summary = case when p ? 'family_summary' then nullif(trim(p ->> 'family_summary'), '') else family_summary end,
    customs        = case when p ? 'customs' then coalesce(p -> 'customs', '{}') else customs end,
    updated_by     = auth.uid()
  where candidate_id = p_candidate;
end $$;

create function public.create_candidate_draft(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
  v_rel text := p ->> 'relationship';
  v_self boolean := (p ->> 'relationship') = 'SELF';
  v_id uuid;
begin
  if v_rel is null or v_rel not in ('SON','DAUGHTER','SELF','SIBLING','WARD','RELATIVE') then
    perform app_private.fail('VALIDATION', 'Relationship is required.', '{"field":"relationship"}');
  end if;
  if (p ->> 'dob') is null or (p ->> 'gender') is null or coalesce(trim(p ->> 'first_name'), '') = '' then
    perform app_private.fail('VALIDATION', 'First name, gender and date of birth are required.');
  end if;
  if v_self and exists (select 1 from app.candidates where owner_user_id = v_uid) then
    perform app_private.fail('INVALID_STATE', 'You already have a candidate profile.');
  end if;

  insert into app.candidates (created_by, owner_user_id, status)
  values (v_uid, case when v_self then v_uid end,
          case when v_self then 'AWAITING_CONSENT' else 'DRAFT' end::app.candidate_status)
  returning id into v_id;
  insert into app.family_candidates (family_id, candidate_id, relationship) values (v_family, v_id, v_rel);
  insert into app.candidate_details (candidate_id, first_name, gender, dob, updated_by)
  values (v_id, trim(p ->> 'first_name'), p ->> 'gender', (p ->> 'dob')::date, v_uid);
  perform app_private.apply_detail_fields(v_id, p);
  insert into app.candidate_preferences (candidate_id) values (v_id);
  insert into app.candidate_private (candidate_id, phone)
  values (v_id, case when v_self then (select phone from app.users where id = v_uid) end);

  perform app_private.audit('candidate.create_draft', 'candidate', v_id, jsonb_build_object('relationship', v_rel));
  return jsonb_build_object('candidate_id', v_id);
end $$;

create function public.update_candidate_details(p_candidate uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_status app.candidate_status;
  v_material boolean;
begin
  if not app_private.can_act_for(p_candidate, 'EDIT_BIODATA') then
    return app_private.denied('FORBIDDEN', 'candidate.update_details', 'candidate', p_candidate, '{}', 'You do not have permission to edit this profile.');
  end if;
  select status into v_status from app.candidates where id = p_candidate for update;
  if v_status in ('WITHDRAWN','ARCHIVED') then perform app_private.fail('INVALID_STATE'); end if;

  -- Identity-relevant facts on a live profile send it back to staff review.
  select exists (select 1 from app.candidate_details d where d.candidate_id = p_candidate and (
      (p ? 'dob' and (p ->> 'dob')::date is distinct from d.dob)
   or (p ? 'gender' and p ->> 'gender' is distinct from d.gender)
   or (p ? 'marital_status' and p ->> 'marital_status' is distinct from d.marital_status)))
  into v_material;

  perform app_private.apply_detail_fields(p_candidate, p);
  update app.candidates set version = version + 1,
    status = case when v_material and status in ('ACTIVE','PAUSED') then 'UNDER_REVIEW'::app.candidate_status else status end
  where id = p_candidate;
  if v_material and v_status in ('ACTIVE','PAUSED') then
    insert into app.verification_cases (type, subject_id) values ('CANDIDATE', p_candidate)
      on conflict do nothing;
  end if;

  perform app_private.audit('candidate.update_details', 'candidate', p_candidate,
    jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p) k), 'material', v_material));
  return public.get_candidate_for_edit(p_candidate);
end $$;

create function public.update_candidate_preferences(p_candidate uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.can_act_for(p_candidate, 'EDIT_BIODATA') then
    perform app_private.fail('FORBIDDEN');
  end if;
  update app.candidate_preferences set
    age_min = (p ->> 'age_min')::int,
    age_max = (p ->> 'age_max')::int,
    districts = coalesce((select array_agg(x) from jsonb_array_elements_text(p -> 'districts') x), '{}'),
    open_to_relocation = (p ->> 'open_to_relocation')::boolean,
    education = nullif(trim(p ->> 'education'), ''),
    notes = nullif(trim(p ->> 'notes'), ''),
    updated_at = now()
  where candidate_id = p_candidate;
  perform app_private.audit('candidate.update_preferences', 'candidate', p_candidate);
end $$;

-- Contact details are candidate-only.
create function public.update_candidate_contact(p_candidate uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.is_candidate_owner(p_candidate) then
    perform app_private.fail('FORBIDDEN', 'Only the candidate can change contact details.');
  end if;
  update app.candidate_private set
    full_name = case when p ? 'full_name' then nullif(trim(p ->> 'full_name'), '') else full_name end,
    phone = case when p ? 'phone' then nullif(trim(p ->> 'phone'), '') else phone end,
    email = case when p ? 'email' then nullif(lower(trim(p ->> 'email')), '') else email end,
    updated_at = now()
  where candidate_id = p_candidate;
  perform app_private.audit('candidate.update_contact', 'candidate', p_candidate);
end $$;

-- Photo stored at photos/<candidate_id>/<uuid>.<ext>; staff approves during review.
create function public.set_candidate_photo(p_candidate uuid, p_storage_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.can_act_for(p_candidate, 'EDIT_BIODATA') then perform app_private.fail('FORBIDDEN'); end if;
  if p_storage_path is not null and split_part(p_storage_path, '/', 1) <> p_candidate::text then
    perform app_private.fail('VALIDATION', 'Invalid storage path.');
  end if;
  update app.candidate_details set photo_path = p_storage_path, photo_approved = false
  where candidate_id = p_candidate;
  perform app_private.audit('candidate.set_photo', 'candidate', p_candidate);
end $$;

-- Full edit view — own family / owner only.
create function public.get_candidate_for_edit(p_candidate uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_is_owner boolean;
  v_out jsonb;
begin
  select owner_user_id = v_uid into v_is_owner from app.candidates where id = p_candidate;
  if not coalesce(v_is_owner, false)
     and app_private.candidate_family(p_candidate) is distinct from app_private.my_family_id(v_uid) then
    perform app_private.fail('PROFILE_PRIVATE');
  end if;

  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'status', c.status, 'visibility', c.visibility,
    'photo_visibility', c.photo_visibility, 'version', c.version,
    'is_owner', coalesce(v_is_owner, false), 'claimed', c.owner_user_id is not null,
    'suspended', c.suspended_at is not null, 'verified', c.verified_at is not null,
    'relationship', fc.relationship,
    'age', app_private.age_years(d.dob),
    'details', to_jsonb(d) - 'updated_by',
    'preferences', to_jsonb(p) - 'candidate_id',
    'contact', case when coalesce(v_is_owner, false) then to_jsonb(cp) - 'candidate_id' end,
    'consents', (select coalesce(jsonb_object_agg(cs.consent_type::text, true), '{}')
                 from app.consents cs where cs.candidate_id = c.id and cs.revoked_at is null),
    'my_capabilities', (select coalesce(jsonb_agg(cap), '[]') from unnest(enum_range(null::app.family_capability)) cap
                        where app_private.can_act_for(c.id, cap)),
    'family_permissions', case when coalesce(v_is_owner, false) then
        (select coalesce(jsonb_agg(jsonb_build_object('user_id', fm.user_id, 'name', u.display_name,
                   'relation', fm.relation,
                   'capabilities', (select coalesce(jsonb_agg(fp.capability), '[]') from app.family_permissions fp
                                    where fp.candidate_id = c.id and fp.delegate_user_id = fm.user_id
                                      and fp.revoked_at is null))), '[]')
         from app.family_members fm join app.users u on u.id = fm.user_id
         where fm.family_id = fc.family_id and fm.active and fm.user_id <> v_uid) end,
    'pending_invitation', (select jsonb_build_object('phone_last4', right(i.phone, 4), 'expires_at', i.expires_at)
                           from app.invitations i where i.candidate_id = c.id and i.accepted_at is null
                             and i.revoked_at is null and i.expires_at > now()
                           order by i.created_at desc limit 1),
    'review_message', (select vc.reasons from app.verification_cases vc
                       where vc.type = 'CANDIDATE' and vc.subject_id = c.id and vc.status in ('MORE_INFO','FAILED')
                       order by vc.updated_at desc limit 1),
    'discoverable', app_private.is_discoverable(c.id, 'MEMBERS'))
  into v_out
  from app.candidates c
  join app.family_candidates fc on fc.candidate_id = c.id and fc.revoked_at is null
  join app.candidate_details d on d.candidate_id = c.id
  left join app.candidate_preferences p on p.candidate_id = c.id
  left join app.candidate_private cp on cp.candidate_id = c.id
  where c.id = p_candidate;
  return v_out;
end $$;

create function public.list_family_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.my_family_id(v_uid);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'first_name', d.first_name, 'status', c.status,
      'relationship', fc.relationship, 'age', app_private.age_years(d.dob),
      'claimed', c.owner_user_id is not null, 'is_owner', c.owner_user_id = v_uid,
      'discoverable', app_private.is_discoverable(c.id, 'MEMBERS'),
      'suspended', c.suspended_at is not null,
      'my_capabilities', (select coalesce(jsonb_agg(cap), '[]') from unnest(enum_range(null::app.family_capability)) cap
                          where app_private.can_act_for(c.id, cap)))
      order by c.created_at), '[]')
    from app.family_candidates fc
    join app.candidates c on c.id = fc.candidate_id
    join app.candidate_details d on d.candidate_id = c.id
    where fc.family_id = v_family and fc.revoked_at is null);
end $$;

create function public.create_candidate_invitation(p_candidate uuid, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
  v_token text := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  v_id uuid;
begin
  if app_private.candidate_family(p_candidate) is distinct from v_family then
    perform app_private.fail('FORBIDDEN');
  end if;
  if exists (select 1 from app.candidates where id = p_candidate and owner_user_id is not null) then
    perform app_private.fail('INVALID_STATE', 'The candidate has already joined.');
  end if;
  if p_phone = (select phone from app.users where id = v_uid) then
    perform app_private.fail('VALIDATION', 'The candidate must use their own phone number.', '{"field":"phone"}');
  end if;
  perform app_private.rate_limit('invite', app_private.cfg_int('rate_invite_per_day'), interval '1 day');

  update app.invitations set revoked_at = now()
  where candidate_id = p_candidate and accepted_at is null and revoked_at is null;
  insert into app.invitations (kind, family_id, candidate_id, phone, token_hash, invited_by, expires_at)
  values ('CANDIDATE', v_family, p_candidate, p_phone, app_private.sha256(v_token), v_uid,
          now() + make_interval(hours => app_private.cfg_int('invitation_ttl_hours')))
  returning id into v_id;
  perform app_private.audit('invitation.create', 'invitation', v_id, jsonb_build_object('kind', 'CANDIDATE'));
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: candidate review & consent (M10) — candidate account only, fresh auth.
-- p_consents: {"PARTICIPATE":true,"PUBLISH":true,"TRADITIONAL_DETAILS":false}
-- p_permissions: [{"user_id":"…","capabilities":["EDIT_BIODATA",…]}]
-- ---------------------------------------------------------------------------
create function public.record_candidate_consents(p_candidate uuid, p_consents jsonb,
                                                 p_permissions jsonb default null,
                                                 p_reviewed_version int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_c app.candidates;
  v_d app.candidate_details;
  v_type app.consent_type;
  v_want boolean;
  v_evidence jsonb;
begin
  select * into v_c from app.candidates where id = p_candidate for update;
  if v_c.owner_user_id is distinct from v_uid then
    return app_private.denied('FORBIDDEN', 'consent.record', 'candidate', p_candidate, '{}', 'Only the candidate can give consent.');
  end if;
  perform app_private.require_recent_auth();
  if p_reviewed_version is not null and p_reviewed_version <> v_c.version then
    perform app_private.fail('STALE_VERSION', 'The profile changed while you were reviewing it. Please review again.');
  end if;
  if v_c.status in ('WITHDRAWN','ARCHIVED') then perform app_private.fail('INVALID_STATE'); end if;

  select * into v_d from app.candidate_details where candidate_id = p_candidate;
  v_evidence := jsonb_build_object(
    'request_id', app_private.request_id(),
    'aal', app_private.jwt() ->> 'aal',
    'session_id', app_private.jwt() ->> 'session_id',
    'reviewed_version', v_c.version,
    'user_agent', nullif(current_setting('request.headers', true), '')::json ->> 'user-agent');

  for v_type in select unnest(enum_range(null::app.consent_type)) loop
    if not (p_consents ? v_type::text) then continue; end if;
    v_want := (p_consents ->> v_type::text)::boolean;
    if v_want and not app_private.has_consent(p_candidate, v_type) then
      if v_type in ('PARTICIPATE','PUBLISH')
         and app_private.age_years(v_d.dob) < app_private.min_age(v_d.gender) then
        perform app_private.fail('AGE_INELIGIBLE', 'The candidate does not meet the legal minimum age.');
      end if;
      insert into app.consents (candidate_id, actor_user_id, consent_type, policy_version, evidence)
      values (p_candidate, v_uid, v_type, app_private.cfg('policy_version') #>> '{}', v_evidence);
      perform app_private.audit('consent.grant', 'candidate', p_candidate, jsonb_build_object('type', v_type));
    elsif not v_want and app_private.has_consent(p_candidate, v_type) then
      update app.consents set revoked_at = now()
      where candidate_id = p_candidate and consent_type = v_type and revoked_at is null;
      perform app_private.audit('consent.revoke', 'candidate', p_candidate, jsonb_build_object('type', v_type));
    end if;
  end loop;

  if p_permissions is not null then
    perform public.set_family_permissions(p_candidate, p_permissions);
  end if;

  -- Without participation consent the profile is hidden and returns to awaiting consent.
  if not app_private.has_consent(p_candidate, 'PARTICIPATE') or not app_private.has_consent(p_candidate, 'PUBLISH') then
    if v_c.status in ('ACTIVE','UNDER_REVIEW','PAUSED') then
      update app.candidates set status = 'AWAITING_CONSENT', visibility = 'HIDDEN' where id = p_candidate;
      perform app_private.close_open_matches(p_candidate);
    end if;
  elsif v_c.status in ('DRAFT','AWAITING_CONSENT') then
    update app.candidates set status = 'UNDER_REVIEW' where id = p_candidate;
    insert into app.verification_cases (type, subject_id) values ('CANDIDATE', p_candidate) on conflict do nothing;
    perform app_private.notify_staff(array['verifier','admin']::app.staff_role[], 'staff.candidate_queued',
      jsonb_build_object('candidate_id', p_candidate));
  end if;

  return public.get_candidate_for_edit(p_candidate);
end $$;

-- Candidate grants/revokes family delegation (M10/M11/M21). Replaces the full set.
create function public.set_family_permissions(p_candidate uuid, p_permissions jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.candidate_family(p_candidate);
  v_entry jsonb;
  v_delegate uuid;
  v_caps app.family_capability[];
begin
  if not app_private.is_candidate_owner(p_candidate) then
    perform app_private.fail('FORBIDDEN', 'Only the candidate can delegate permissions.');
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(p_permissions, '[]')) loop
    v_delegate := (v_entry ->> 'user_id')::uuid;
    if v_delegate = v_uid or not exists (select 1 from app.family_members
                    where user_id = v_delegate and family_id = v_family and active) then
      perform app_private.fail('VALIDATION', 'Permissions can only be given to active family members.');
    end if;
    select coalesce(array_agg(x::app.family_capability), '{}') into v_caps
    from jsonb_array_elements_text(coalesce(v_entry -> 'capabilities', '[]')) x;

    update app.family_permissions set revoked_at = now()
    where candidate_id = p_candidate and delegate_user_id = v_delegate and revoked_at is null
      and capability <> all (v_caps);
    insert into app.family_permissions (candidate_id, delegate_user_id, capability, granted_by)
    select p_candidate, v_delegate, cap, v_uid from unnest(v_caps) cap
    on conflict do nothing;
    perform app_private.audit('family_permissions.set', 'candidate', p_candidate,
      jsonb_build_object('delegate', v_delegate, 'capabilities', to_jsonb(v_caps)));
  end loop;
end $$;

-- Privacy settings (M11) — candidate-only since they control publication.
create function public.update_privacy(p_candidate uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.is_candidate_owner(p_candidate) then
    return app_private.denied('FORBIDDEN', 'privacy.update', 'candidate', p_candidate, '{}', 'Only the candidate can change privacy settings.');
  end if;
  update app.candidates set
    visibility = coalesce((p ->> 'visibility')::app.visibility, visibility),
    photo_visibility = coalesce((p ->> 'photo_visibility')::app.photo_visibility, photo_visibility)
  where id = p_candidate;
  perform app_private.audit('privacy.update', 'candidate', p_candidate, p);
  return public.get_candidate_for_edit(p_candidate);
end $$;

create function public.pause_candidate(p_candidate uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.is_candidate_owner(p_candidate) then perform app_private.fail('FORBIDDEN'); end if;
  update app.candidates set status = 'PAUSED', paused_at = now()
  where id = p_candidate and status in ('ACTIVE','UNDER_REVIEW');
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  perform app_private.audit('candidate.pause', 'candidate', p_candidate);
  return public.get_candidate_for_edit(p_candidate);
end $$;

create function public.resume_candidate(p_candidate uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_user();
  if not app_private.is_candidate_owner(p_candidate) then perform app_private.fail('FORBIDDEN'); end if;
  update app.candidates
    set status = case when verified_at is not null then 'ACTIVE' else 'UNDER_REVIEW' end::app.candidate_status,
        paused_at = null
  where id = p_candidate and status = 'PAUSED';
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  perform app_private.audit('candidate.resume', 'candidate', p_candidate);
  return public.get_candidate_for_edit(p_candidate);
end $$;
