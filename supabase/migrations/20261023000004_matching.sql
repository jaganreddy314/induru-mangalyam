-- Discovery, shortlists, interests & decisions, introductions, contact grants, meetings.

create table app.shortlists (
  id                uuid primary key default gen_random_uuid(),
  context_family_id uuid not null references app.families (id) on delete cascade,
  candidate_id      uuid not null references app.candidates (id) on delete cascade,
  created_by        uuid not null references app.users (id),
  private_note      text check (char_length(private_note) <= 500),
  created_at        timestamptz not null default now(),
  unique (context_family_id, candidate_id)
);

create table app.match_requests (
  id                   uuid primary key default gen_random_uuid(),
  source_candidate_id  uuid not null references app.candidates (id) on delete cascade,
  target_candidate_id  uuid not null references app.candidates (id) on delete cascade,
  initiated_by         uuid not null references app.users (id),
  initiated_via        text not null check (initiated_via in ('FAMILY','CANDIDATE','BROKER')),
  status               app.match_status not null,
  message              text check (char_length(message) <= 500),
  broker_rationale     text check (char_length(broker_rationale) <= 1000),  -- staff only
  presented_to_target_at timestamptz,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  closed_at            timestamptz,
  check (source_candidate_id <> target_candidate_id)
);
-- At most one open match per unordered pair (duplicate-retry safety).
create unique index match_requests_open_pair_uq
  on app.match_requests (least(source_candidate_id, target_candidate_id), greatest(source_candidate_id, target_candidate_id))
  where status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE');
create index match_requests_source_idx on app.match_requests (source_candidate_id, status);
create index match_requests_target_idx on app.match_requests (target_candidate_id, status);
create trigger match_requests_touch before update on app.match_requests
  for each row execute function app_private.touch_updated_at();

create table app.match_decisions (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references app.match_requests (id) on delete cascade,
  candidate_id  uuid not null references app.candidates (id) on delete cascade,
  decision      text not null check (decision in ('ACCEPT','DECLINE')),
  actor_user_id uuid not null references app.users (id),
  decided_at    timestamptz not null default now(),
  superseded_at timestamptz
);
create unique index match_decisions_one_active on app.match_decisions (match_id, candidate_id) where superseded_at is null;

create table app.introductions (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null unique references app.match_requests (id) on delete cascade,
  assigned_broker_id  uuid references app.users (id),
  stage               app.intro_stage not null default 'PENDING_CONTACT',
  source_confirmed_at timestamptz,
  target_confirmed_at timestamptz,
  opened_at           timestamptz not null default now(),
  introduced_at       timestamptz,
  closed_at           timestamptz,
  closed_by           uuid references app.users (id),
  close_reason        text,   -- never shown to the other side
  updated_at          timestamptz not null default now()
);
create index introductions_stage_idx on app.introductions (stage, opened_at desc);
create index introductions_broker_idx on app.introductions (assigned_broker_id) where assigned_broker_id is not null;
create trigger introductions_touch before update on app.introductions
  for each row execute function app_private.touch_updated_at();

-- Participant-visible timeline (no private states).
create table app.introduction_events (
  id              uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references app.introductions (id) on delete cascade,
  kind            text not null,
  actor_side      text not null check (actor_side in ('SOURCE','TARGET','BROKER','SYSTEM')),
  payload         jsonb not null default '{}',
  at              timestamptz not null default now()
);
create index introduction_events_idx on app.introduction_events (introduction_id, at);

create table app.contact_grants (
  id                   uuid primary key default gen_random_uuid(),
  introduction_id      uuid not null references app.introductions (id) on delete cascade,
  grantor_candidate_id uuid not null references app.candidates (id) on delete cascade,
  grantor_user_id      uuid not null references app.users (id),
  recipient_user_id    uuid not null references app.users (id) on delete cascade,
  fields               app.contact_field[] not null check (cardinality(fields) > 0),
  expires_at           timestamptz not null,
  granted_at           timestamptz not null default now(),
  revoked_at           timestamptz
);
create unique index contact_grants_active_uq
  on app.contact_grants (introduction_id, grantor_candidate_id, recipient_user_id) where revoked_at is null;
create index contact_grants_recipient_idx on app.contact_grants (recipient_user_id) where revoked_at is null;

create table app.meetings (
  id                  uuid primary key default gen_random_uuid(),
  introduction_id     uuid not null references app.introductions (id) on delete cascade,
  proposer_user_id    uuid not null references app.users (id),
  proposer_side       text not null check (proposer_side in ('SOURCE','TARGET','BROKER')),
  start_at            timestamptz not null,
  timezone            text not null default 'Asia/Kolkata',
  format              text not null check (format in ('IN_PERSON','PHONE_CALL','VIDEO_EXTERNAL')),
  location_hint       text check (char_length(location_hint) <= 120),
  status              text not null default 'PROPOSED' check (status in ('PROPOSED','ACCEPTED','DECLINED','CANCELLED','RESCHEDULED')),
  responded_by        uuid references app.users (id),
  responded_at        timestamptz,
  replaces_meeting_id uuid references app.meetings (id),
  idempotency_key     text not null,
  created_at          timestamptz not null default now(),
  unique (introduction_id, idempotency_key)
);
create index meetings_intro_idx on app.meetings (introduction_id, start_at);

create table app.broker_notes (
  id               uuid primary key default gen_random_uuid(),
  introduction_id  uuid not null references app.introductions (id) on delete cascade,
  author_id        uuid not null references app.users (id),
  visibility_scope text not null default 'BROKERS' check (visibility_scope in ('BROKERS','ADMINS')),
  body_enc         bytea not null,
  created_at       timestamptz not null default now()
);
create index broker_notes_intro_idx on app.broker_notes (introduction_id, created_at);

alter table app.shortlists          enable row level security;
alter table app.match_requests      enable row level security;
alter table app.match_decisions     enable row level security;
alter table app.introductions       enable row level security;
alter table app.introduction_events enable row level security;
alter table app.contact_grants      enable row level security;
alter table app.meetings            enable row level security;
alter table app.broker_notes        enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app_private.candidate_by_code(p_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from app.candidates where code = upper(trim(p_code))
$$;

-- Card for a counterpart that may have since left: hides everything when unavailable.
create function app_private.counterpart_card(p_candidate uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when c.status in ('WITHDRAWN','ARCHIVED') or c.suspended_at is not null
      then jsonb_build_object('code', c.code, 'unavailable', true)
    else app_private.public_card(c.id) end
  from app.candidates c where c.id = p_candidate
$$;

-- Which side of a match the caller acts for, for a given capability (null = none).
create function app_private.match_side(p_match uuid, p_cap app.family_capability, p_uid uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when app_private.can_act_for(m.source_candidate_id, p_cap, p_uid) then 'SOURCE'
    when app_private.can_act_for(m.target_candidate_id, p_cap, p_uid) then 'TARGET'
  end
  from app.match_requests m where m.id = p_match
$$;

create function app_private.intro_side(p_intro uuid, p_cap app.family_capability, p_uid uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  select app_private.match_side(i.match_id, p_cap, p_uid) from app.introductions i where i.id = p_intro
$$;

create function app_private.side_candidate(p_match uuid, p_side text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case p_side when 'SOURCE' then source_candidate_id when 'TARGET' then target_candidate_id end
  from app.match_requests where id = p_match
$$;

-- Users who receive updates for one side: the candidate and delegates with VIEW_INTERESTS.
create function app_private.side_watchers(p_candidate uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select owner_user_id from app.candidates where id = p_candidate and owner_user_id is not null
  union
  select fp.delegate_user_id from app.family_permissions fp
  join app.family_members fm on fm.user_id = fp.delegate_user_id and fm.active
    and fm.family_id = app_private.candidate_family(p_candidate)
  where fp.candidate_id = p_candidate and fp.capability = 'VIEW_INTERESTS' and fp.revoked_at is null
$$;

create function app_private.notify_side(p_candidate uuid, p_template text, p_payload jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into app.notifications (recipient_id, template_key, payload)
  select w, p_template, p_payload from app_private.side_watchers(p_candidate) w;
$$;

create function app_private.intro_event(p_intro uuid, p_kind text, p_side text, p_payload jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into app.introduction_events (introduction_id, kind, actor_side, payload)
  values (p_intro, p_kind, p_side, coalesce(p_payload, '{}'));
$$;

-- Lazy expiry; also safe to schedule with pg_cron.
create function app_private.expire_stale_matches() returns void
language sql security definer set search_path = '' as $$
  update app.match_requests set status = 'EXPIRED', closed_at = now()
  where status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE') and expires_at < now();
$$;

-- Used when a candidate withdraws or revokes consent.
create function app_private.close_open_matches(p_candidate uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.match_requests set status = 'EXPIRED', closed_at = now()
  where status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE')
    and (source_candidate_id = p_candidate or target_candidate_id = p_candidate);
  update app.introductions i set stage = 'CLOSED', closed_at = now(), close_reason = 'PARTICIPANT_UNAVAILABLE'
  from app.match_requests m
  where m.id = i.match_id and i.stage not in ('CLOSED','MATCH_CONFIRMED')
    and (m.source_candidate_id = p_candidate or m.target_candidate_id = p_candidate);
  update app.contact_grants g set revoked_at = now()
  from app.introductions i join app.match_requests m on m.id = i.match_id
  where g.introduction_id = i.id and g.revoked_at is null
    and (m.source_candidate_id = p_candidate or m.target_candidate_id = p_candidate);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: discovery (M12, M13)
-- p_filters: {gender, age_min, age_max, district, city, profession, education, marital_status}
-- ---------------------------------------------------------------------------
create function public.discover(p_filters jsonb default '{}', p_cursor text default null, p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := app_private.require_approved_family();
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cur_at timestamptz;
  v_cur_id uuid;
  v_rows jsonb;
  v_next text;
  v_f jsonb := coalesce(p_filters, '{}');
begin
  perform app_private.rate_limit('discover', app_private.cfg_int('rate_discover_per_hour'), interval '1 hour');
  if p_cursor is not null then
    begin
      v_cur_at := split_part(convert_from(decode(p_cursor, 'base64'), 'utf8'), '|', 1)::timestamptz;
      v_cur_id := split_part(convert_from(decode(p_cursor, 'base64'), 'utf8'), '|', 2)::uuid;
    exception when others then
      perform app_private.fail('VALIDATION', 'Invalid cursor.');
    end;
  end if;

  with page as (
    select c.id, c.published_at
    from app.candidates c
    join app.candidate_details d on d.candidate_id = c.id
    where c.status = 'ACTIVE' and c.suspended_at is null and c.visibility = 'MEMBERS'
      and (v_f ->> 'gender' is null or d.gender = v_f ->> 'gender')
      and (v_f ->> 'marital_status' is null or d.marital_status = v_f ->> 'marital_status')
      and (v_f ->> 'district' is null or d.district ilike v_f ->> 'district')
      and (v_f ->> 'city' is null or d.city ilike '%' || (v_f ->> 'city') || '%')
      and (v_f ->> 'profession' is null or d.profession ilike '%' || (v_f ->> 'profession') || '%')
      and (v_f ->> 'education' is null or d.education ilike '%' || (v_f ->> 'education') || '%')
      and (v_f ->> 'age_min' is null or d.dob <= (current_date - make_interval(years => (v_f ->> 'age_min')::int))::date)
      and (v_f ->> 'age_max' is null or d.dob > (current_date - make_interval(years => (v_f ->> 'age_max')::int + 1))::date)
      and (v_cur_at is null or (c.published_at, c.id) < (v_cur_at, v_cur_id))
      and app_private.visible_to_family(c.id, v_family)
    order by c.published_at desc, c.id desc
    limit v_limit + 1
  ), numbered as (
    select *, row_number() over (order by published_at desc, id desc) rn from page
  )
  select
    coalesce(jsonb_agg(app_private.public_card(n.id)
      || jsonb_build_object('shortlisted', exists (select 1 from app.shortlists s
                              where s.context_family_id = v_family and s.candidate_id = n.id))
      order by n.rn) filter (where n.rn <= v_limit), '[]'),
    max(case when n.rn = v_limit then encode(convert_to(n.published_at::text || '|' || n.id::text, 'utf8'), 'base64') end)
      filter (where (select count(*) from numbered) > v_limit)
  into v_rows, v_next
  from numbered n;

  return jsonb_build_object('items', v_rows, 'next_cursor', v_next);
end $$;

-- Profile details by public code. Visible when discoverable to this family, or when the
-- two sides share a match/introduction (so open conversations keep context).
create function public.get_profile(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid := app_private.require_approved_family();
  v_cid uuid := app_private.candidate_by_code(p_code);
  v_related boolean;
  v_out jsonb;
begin
  perform app_private.rate_limit('profile', app_private.cfg_int('rate_profile_per_hour'), interval '1 hour');
  select exists (
    select 1 from app.match_requests m
    where (m.source_candidate_id = v_cid and app_private.candidate_family(m.target_candidate_id) = v_family
           and (m.status <> 'INTEREST_PENDING'))
       or (m.target_candidate_id = v_cid and app_private.candidate_family(m.source_candidate_id) = v_family)
  ) into v_related;

  if v_cid is null or not (app_private.visible_to_family(v_cid, v_family) or v_related)
     or exists (select 1 from app.candidates where id = v_cid and (status in ('WITHDRAWN','ARCHIVED') or suspended_at is not null)) then
    -- Returned (not raised) so the rate-limit event above is kept: failed guesses count.
    return app_private.denied('PROFILE_PRIVATE', 'profile.view', 'candidate', v_cid, '{}', 'This profile is not available.');
  end if;

  select app_private.public_card(c.id) || jsonb_build_object(
      'state', d.state,
      'bio', d.bio,
      'family_summary', d.family_summary,
      'customs', case when app_private.has_consent(c.id, 'TRADITIONAL_DETAILS') then d.customs end,
      'preferences', jsonb_build_object('age_min', p.age_min, 'age_max', p.age_max,
                                        'districts', p.districts, 'open_to_relocation', p.open_to_relocation),
      'member_since', to_char(c.published_at, 'YYYY-MM'),
      -- Distinct trust checks, each derived from real state (Design guide §7: no generic badge).
      'checks', jsonb_build_object(
        'phone_verified', c.owner_user_id is not null,
        'family_verified', (select f.status = 'APPROVED' from app.families f where f.id = app_private.candidate_family(c.id)),
        'consent_confirmed', app_private.has_consent(c.id, 'PARTICIPATE') and app_private.has_consent(c.id, 'PUBLISH'),
        'profile_reviewed', c.verified_at is not null),
      'shortlisted', exists (select 1 from app.shortlists s where s.context_family_id = v_family and s.candidate_id = c.id),
      'shortlist_note', (select s.private_note from app.shortlists s where s.context_family_id = v_family and s.candidate_id = c.id),
      'open_match', (select jsonb_build_object('id', m.id, 'status', m.status) from app.match_requests m
                     where ((m.source_candidate_id = c.id and app_private.candidate_family(m.target_candidate_id) = v_family)
                         or (m.target_candidate_id = c.id and app_private.candidate_family(m.source_candidate_id) = v_family))
                       and m.status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE','MUTUALLY_ACCEPTED')
                       and not (m.target_candidate_id = c.id and m.status = 'DECLINED')
                     order by m.created_at desc limit 1))
    into v_out
  from app.candidates c
  join app.candidate_details d on d.candidate_id = c.id
  left join app.candidate_preferences p on p.candidate_id = c.id
  where c.id = v_cid;
  return v_out;
end $$;

-- Photo path, only when the viewer is allowed; client then requests a short-lived signed URL
-- (storage policy re-checks via app_private.can_view_photo_object).
create function app_private.can_view_photo(p_candidate uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.candidates c join app.candidate_details d on d.candidate_id = c.id
    where c.id = p_candidate and d.photo_path is not null and (
      -- own family / owner
      app_private.candidate_family(c.id) = app_private.my_family_id(p_uid)
      or c.owner_user_id = p_uid
      -- members, when the candidate chose MEMBERS and photo is approved
      or (c.photo_visibility = 'MEMBERS' and d.photo_approved
          and exists (select 1 from app.families f where f.id = app_private.my_family_id(p_uid) and f.status = 'APPROVED')
          and app_private.visible_to_family(c.id, app_private.my_family_id(p_uid)))
      -- explicit PHOTO grant within a live introduction
      or (d.photo_approved and exists (
            select 1 from app.contact_grants g join app.introductions i on i.id = g.introduction_id
            where g.grantor_candidate_id = c.id and g.recipient_user_id = p_uid and g.revoked_at is null
              and g.expires_at > now() and 'PHOTO' = any (g.fields)
              and i.stage not in ('CLOSED')))
      -- staff reviewing candidates
      or app_private.has_role(array['verifier','admin']::app.staff_role[], p_uid)
    ))
$$;

create function public.get_profile_photo_path(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_cid uuid := app_private.candidate_by_code(p_code);
begin
  if v_cid is null or not app_private.can_view_photo(v_cid, v_uid) then
    perform app_private.fail('PROFILE_PRIVATE');
  end if;
  return (select photo_path from app.candidate_details where candidate_id = v_cid);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: shortlist (M14) — private to the family, never notifies the target.
-- ---------------------------------------------------------------------------
create function public.save_shortlist(p_code text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
  v_cid uuid := app_private.candidate_by_code(p_code);
begin
  if v_cid is null or not app_private.visible_to_family(v_cid, v_family) then
    perform app_private.fail('PROFILE_PRIVATE');
  end if;
  insert into app.shortlists (context_family_id, candidate_id, created_by, private_note)
  values (v_family, v_cid, v_uid, nullif(trim(p_note), ''))
  on conflict (context_family_id, candidate_id) do update set private_note = excluded.private_note;
end $$;

create function public.remove_shortlist(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family uuid := app_private.require_approved_family();
begin
  delete from app.shortlists
  where context_family_id = v_family and candidate_id = app_private.candidate_by_code(p_code);
end $$;

create function public.list_shortlist()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_family uuid := app_private.require_approved_family();
begin
  return (select coalesce(jsonb_agg(
      case when app_private.visible_to_family(s.candidate_id, v_family)
           then app_private.public_card(s.candidate_id)
           else jsonb_build_object('code', c.code, 'unavailable', true) end
      || jsonb_build_object('note', s.private_note, 'saved_at', s.created_at)
      order by s.created_at desc), '[]')
    from app.shortlists s join app.candidates c on c.id = s.candidate_id
    where s.context_family_id = v_family);
end $$;

create function public.block_profile(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
  v_cid uuid := app_private.candidate_by_code(p_code);
begin
  if v_cid is null then perform app_private.fail('NOT_FOUND'); end if;
  insert into app.blocks (blocker_family_id, blocked_candidate_id, created_by)
  values (v_family, v_cid, v_uid) on conflict do nothing;
  delete from app.shortlists where context_family_id = v_family and candidate_id = v_cid;
  -- Close any open request between the two families' candidates.
  update app.match_requests m set status = 'DECLINED', closed_at = now()
  where m.status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE')
    and ((m.target_candidate_id = v_cid and app_private.candidate_family(m.source_candidate_id) = v_family)
      or (m.source_candidate_id = v_cid and app_private.candidate_family(m.target_candidate_id) = v_family));
  perform app_private.audit('profile.block', 'candidate', v_cid);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: interests (M15, M16)
-- ---------------------------------------------------------------------------
create function public.send_interest(p_source_candidate uuid, p_target_code text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
  v_target uuid := app_private.candidate_by_code(p_target_code);
  v_is_owner boolean;
  v_existing uuid;
  v_id uuid;
begin
  if not app_private.can_act_for(p_source_candidate, 'SUGGEST_INTEREST') then
    return app_private.denied('FORBIDDEN', 'interest.send', 'candidate', p_source_candidate, '{}', 'You cannot send interest on behalf of this candidate.');
  end if;
  -- No outbound interest in the name of a candidate who has not consented / is not live.
  if not app_private.is_discoverable(p_source_candidate, 'BROKER') then
    perform app_private.fail('CONSENT_REQUIRED', 'Your candidate profile must be verified and published first.');
  end if;
  if v_target is null or not app_private.visible_to_family(v_target, v_family) then
    perform app_private.fail('PROFILE_PRIVATE');
  end if;

  perform app_private.expire_stale_matches();
  select id into v_existing from app.match_requests
  where least(source_candidate_id, target_candidate_id) = least(p_source_candidate, v_target)
    and greatest(source_candidate_id, target_candidate_id) = greatest(p_source_candidate, v_target)
    and status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE','MUTUALLY_ACCEPTED');
  if v_existing is not null then
    return jsonb_build_object('match_id', v_existing, 'duplicate', true);
  end if;
  if exists (select 1 from app.match_requests
             where least(source_candidate_id, target_candidate_id) = least(p_source_candidate, v_target)
               and greatest(source_candidate_id, target_candidate_id) = greatest(p_source_candidate, v_target)
               and status = 'DECLINED'
               and closed_at > now() - make_interval(days => app_private.cfg_int('decline_cooldown_days'))) then
    perform app_private.fail('INVALID_STATE', 'A new request is not possible at this time.');
  end if;
  perform app_private.rate_limit('interest', app_private.cfg_int('rate_interest_per_day'), interval '1 day');

  v_is_owner := app_private.is_candidate_owner(p_source_candidate);
  insert into app.match_requests (source_candidate_id, target_candidate_id, initiated_by, initiated_via, status,
                                  message, presented_to_target_at, expires_at)
  values (p_source_candidate, v_target, v_uid, case when v_is_owner then 'CANDIDATE' else 'FAMILY' end,
          case when v_is_owner then 'AWAITING_CANDIDATE' else 'INTEREST_PENDING' end::app.match_status,
          nullif(trim(p_message), ''), case when v_is_owner then now() end,
          now() + make_interval(days => app_private.cfg_int('interest_ttl_days')))
  returning id into v_id;

  if v_is_owner then
    insert into app.match_decisions (match_id, candidate_id, decision, actor_user_id)
    values (v_id, p_source_candidate, 'ACCEPT', v_uid);
    perform app_private.notify_side(v_target, 'interest.received', jsonb_build_object('match_id', v_id));
  else
    perform app_private.notify((select owner_user_id from app.candidates where id = p_source_candidate),
      'interest.confirm_needed', jsonb_build_object('match_id', v_id));
  end if;
  perform app_private.audit('interest.send', 'match_request', v_id, jsonb_build_object('via', case when v_is_owner then 'CANDIDATE' else 'FAMILY' end));
  return jsonb_build_object('match_id', v_id, 'duplicate', false);
end $$;

-- Candidate decision (I2) — only the authenticated candidate account of that side.
create function public.decide_match(p_match uuid, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_m app.match_requests;
  v_side text;
  v_cid uuid;
  v_other uuid;
  v_other_decision text;
  v_intro uuid;
begin
  if p_decision not in ('ACCEPT','DECLINE') then perform app_private.fail('VALIDATION'); end if;
  perform app_private.expire_stale_matches();
  select * into v_m from app.match_requests where id = p_match for update;
  if v_m.id is null then perform app_private.fail('NOT_FOUND'); end if;

  if exists (select 1 from app.candidates where id = v_m.source_candidate_id and owner_user_id = v_uid) then
    v_side := 'SOURCE'; v_cid := v_m.source_candidate_id; v_other := v_m.target_candidate_id;
  elsif exists (select 1 from app.candidates where id = v_m.target_candidate_id and owner_user_id = v_uid) then
    v_side := 'TARGET'; v_cid := v_m.target_candidate_id; v_other := v_m.source_candidate_id;
  else
    return app_private.denied('FORBIDDEN', 'match.decide', 'match_request', p_match,
      jsonb_build_object('reason', 'not_candidate', 'is_staff', app_private.has_role(array['broker','admin']::app.staff_role[])), 'Only the candidate can make this decision.');
  end if;

  -- Idempotent retry of an identical decision.
  if exists (select 1 from app.match_decisions where match_id = p_match and candidate_id = v_cid
             and superseded_at is null and decision = p_decision) then
    return jsonb_build_object('status', v_m.status,
      'introduction_id', (select id from app.introductions where match_id = p_match));
  end if;

  if not ((v_m.status = 'SUGGESTED')
       or (v_m.status = 'INTEREST_PENDING' and v_side = 'SOURCE')
       or (v_m.status = 'AWAITING_CANDIDATE' and v_side = 'TARGET')) then
    perform app_private.fail('INVALID_STATE', 'This request is no longer awaiting your decision.');
  end if;
  if p_decision = 'ACCEPT' and not app_private.is_discoverable(v_cid, 'BROKER') then
    perform app_private.fail('CONSENT_REQUIRED', 'Your profile must be active to accept.');
  end if;

  update app.match_decisions set superseded_at = now()
  where match_id = p_match and candidate_id = v_cid and superseded_at is null;
  insert into app.match_decisions (match_id, candidate_id, decision, actor_user_id)
  values (p_match, v_cid, p_decision, v_uid);
  perform app_private.audit('match.decide', 'match_request', p_match, jsonb_build_object('side', v_side, 'decision', p_decision));

  if p_decision = 'DECLINE' then
    update app.match_requests set status = 'DECLINED', closed_at = now() where id = p_match;
    -- Only notify a side that has actually seen the request; never include a reason.
    if v_m.status <> 'INTEREST_PENDING' then
      perform app_private.notify_side(v_other, 'interest.closed', jsonb_build_object('match_id', p_match));
    end if;
    return jsonb_build_object('status', 'DECLINED');
  end if;

  select decision into v_other_decision from app.match_decisions
  where match_id = p_match and candidate_id = v_other and superseded_at is null;

  if v_m.status = 'INTEREST_PENDING' then
    update app.match_requests set status = 'AWAITING_CANDIDATE', presented_to_target_at = now() where id = p_match;
    perform app_private.notify_side(v_other, 'interest.received', jsonb_build_object('match_id', p_match));
    return jsonb_build_object('status', 'AWAITING_CANDIDATE');
  end if;

  if v_other_decision = 'ACCEPT' then
    if not app_private.is_discoverable(v_other, 'BROKER') then
      perform app_private.fail('PROFILE_PRIVATE', 'The other profile is no longer available.');
    end if;
    update app.match_requests set status = 'MUTUALLY_ACCEPTED', closed_at = now() where id = p_match;
    insert into app.introductions (match_id) values (p_match) returning id into v_intro;
    perform app_private.intro_event(v_intro, 'MUTUALLY_ACCEPTED', 'SYSTEM');
    perform app_private.notify_side(v_m.source_candidate_id, 'interest.accepted', jsonb_build_object('introduction_id', v_intro));
    perform app_private.notify_side(v_m.target_candidate_id, 'interest.accepted', jsonb_build_object('introduction_id', v_intro));
    perform app_private.notify_staff(array['broker']::app.staff_role[], 'staff.introduction_opened', jsonb_build_object('introduction_id', v_intro));
    perform app_private.audit('introduction.open', 'introduction', v_intro);
    return jsonb_build_object('status', 'MUTUALLY_ACCEPTED', 'introduction_id', v_intro);
  end if;

  return jsonb_build_object('status', v_m.status);
end $$;

-- Interests inbox. p_box: RECEIVED | SENT | CLOSED
create function public.list_interests(p_box text default 'RECEIVED')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_family uuid := app_private.require_approved_family();
begin
  perform app_private.expire_stale_matches();
  return (
    with mine as (
      select fc.candidate_id from app.family_candidates fc
      where fc.family_id = v_family and fc.revoked_at is null
        and app_private.can_act_for(fc.candidate_id, 'VIEW_INTERESTS', v_uid)
    ), rows as (
      select m.*,
             case when m.source_candidate_id in (select candidate_id from mine) then 'SOURCE' else 'TARGET' end as side
      from app.match_requests m
      where m.source_candidate_id in (select candidate_id from mine)
         or (m.target_candidate_id in (select candidate_id from mine)
             and (m.presented_to_target_at is not null or m.status = 'SUGGESTED'))
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'side', r.side, 'via', r.initiated_via,
        'message', r.message, 'created_at', r.created_at, 'expires_at', r.expires_at,
        'my_candidate', (select jsonb_build_object('id', c.id, 'code', c.code, 'first_name', d.first_name)
                         from app.candidates c join app.candidate_details d on d.candidate_id = c.id
                         where c.id = case r.side when 'SOURCE' then r.source_candidate_id else r.target_candidate_id end),
        'other', app_private.counterpart_card(case r.side when 'SOURCE' then r.target_candidate_id else r.source_candidate_id end),
        'my_decision', (select decision from app.match_decisions md where md.match_id = r.id and md.superseded_at is null
                          and md.candidate_id = case r.side when 'SOURCE' then r.source_candidate_id else r.target_candidate_id end),
        'can_decide', exists (select 1 from app.candidates c where c.owner_user_id = v_uid
                         and c.id = case r.side when 'SOURCE' then r.source_candidate_id else r.target_candidate_id end)
                       and not exists (select 1 from app.match_decisions md where md.match_id = r.id and md.superseded_at is null
                         and md.candidate_id = case r.side when 'SOURCE' then r.source_candidate_id else r.target_candidate_id end)
                       and ((r.status = 'SUGGESTED')
                         or (r.status = 'INTEREST_PENDING' and r.side = 'SOURCE')
                         or (r.status = 'AWAITING_CANDIDATE' and r.side = 'TARGET')),
        'introduction_id', (select i.id from app.introductions i where i.match_id = r.id))
        order by r.updated_at desc), '[]')
    from rows r
    where case upper(p_box)
      when 'RECEIVED' then r.status in ('SUGGESTED','AWAITING_CANDIDATE') and (r.side = 'TARGET' or r.status = 'SUGGESTED')
      when 'SENT'     then r.side = 'SOURCE' and r.status in ('INTEREST_PENDING','AWAITING_CANDIDATE')
      else r.status in ('MUTUALLY_ACCEPTED','DECLINED','EXPIRED')
    end
  );
end $$;

-- ---------------------------------------------------------------------------
-- RPC: introductions (M17, M18, M19)
-- ---------------------------------------------------------------------------
create function app_private.require_intro_participant(p_intro uuid, p_cap app.family_capability default 'VIEW_INTERESTS')
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_side text;
begin
  perform app_private.require_user();
  v_side := app_private.intro_side(p_intro, p_cap);
  if v_side is null then
    perform app_private.fail('FORBIDDEN', 'You are not a participant in this introduction.');
  end if;
  return v_side;
end $$;

create function public.list_introductions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
begin
  return (select coalesce(jsonb_agg(x order by (x ->> 'updated_at') desc), '[]') from (
    select jsonb_build_object(
      'id', i.id, 'stage', i.stage, 'opened_at', i.opened_at, 'updated_at', i.updated_at,
      'side', s.side,
      'my_candidate', (select jsonb_build_object('id', c.id, 'code', c.code, 'first_name', d.first_name)
                       from app.candidates c join app.candidate_details d on d.candidate_id = c.id
                       where c.id = app_private.side_candidate(m.id, s.side)),
      'other', app_private.counterpart_card(app_private.side_candidate(m.id, case s.side when 'SOURCE' then 'TARGET' else 'SOURCE' end)),
      'has_broker', i.assigned_broker_id is not null) x
    from app.introductions i
    join app.match_requests m on m.id = i.match_id
    cross join lateral (select app_private.match_side(m.id, 'VIEW_INTERESTS', v_uid) as side) s
    where s.side is not null) t);
end $$;

create function public.get_introduction(p_intro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_side text := app_private.require_intro_participant(p_intro);
  v_other_side text := case v_side when 'SOURCE' then 'TARGET' else 'SOURCE' end;
  v_i app.introductions;
  v_my_cid uuid;
  v_other_cid uuid;
begin
  select * into v_i from app.introductions where id = p_intro;
  v_my_cid := app_private.side_candidate(v_i.match_id, v_side);
  v_other_cid := app_private.side_candidate(v_i.match_id, v_other_side);

  return jsonb_build_object(
    'id', v_i.id, 'stage', v_i.stage, 'side', v_side, 'opened_at', v_i.opened_at,
    'introduced_at', v_i.introduced_at, 'closed_at', v_i.closed_at,
    'is_candidate', app_private.is_candidate_owner(v_my_cid),
    'my_candidate', (select jsonb_build_object('id', c.id, 'code', c.code, 'first_name', d.first_name)
                     from app.candidates c join app.candidate_details d on d.candidate_id = c.id where c.id = v_my_cid),
    'other', app_private.counterpart_card(v_other_cid),
    'broker', (select jsonb_build_object('name', u.display_name) from app.users u where u.id = v_i.assigned_broker_id),
    'my_confirmed', case v_side when 'SOURCE' then v_i.source_confirmed_at else v_i.target_confirmed_at end is not null,
    'can_coordinate', app_private.can_act_for(v_my_cid, 'COORDINATE_MEETINGS'),
    -- Grants my candidate has given (only the grantor's own side sees these).
    'my_grants', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', g.id, 'recipient_user_id', g.recipient_user_id, 'fields', g.fields,
                     'expires_at', g.expires_at, 'granted_at', g.granted_at,
                     'recipient_label', coalesce((select case when fm.relation = 'CANDIDATE' then 'CANDIDATE' else fm.relation end
                                                  from app.family_members fm where fm.user_id = g.recipient_user_id and fm.active), 'MEMBER'))
                     order by g.granted_at), '[]')
                  from app.contact_grants g
                  where g.introduction_id = p_intro and g.grantor_candidate_id = v_my_cid and g.revoked_at is null),
    -- What has been shared with the current user (field names only; values via get_introduction_contacts).
    'shared_with_me', (select coalesce(jsonb_agg(jsonb_build_object('fields', g.fields, 'expires_at', g.expires_at)), '[]')
                       from app.contact_grants g
                       where g.introduction_id = p_intro and g.recipient_user_id = v_uid and g.revoked_at is null
                         and g.expires_at > now()),
    -- Who on the other side can receive a grant (relation labels, no names or numbers).
    'possible_recipients', case when app_private.is_candidate_owner(v_my_cid) then
        (select coalesce(jsonb_agg(jsonb_build_object('user_id', fm.user_id, 'relation', fm.relation)
                  order by fm.relation = 'CANDIDATE' desc), '[]')
         from app.family_members fm
         where fm.family_id = app_private.candidate_family(v_other_cid) and fm.active
           and (fm.relation <> 'CANDIDATE' or fm.user_id = (select owner_user_id from app.candidates where id = v_other_cid))) end,
    'meetings', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', mt.id, 'start_at', mt.start_at, 'timezone', mt.timezone, 'format', mt.format,
                    'location_hint', mt.location_hint, 'status', mt.status,
                    'proposed_by_me', mt.proposer_side = v_side, 'proposer_side', mt.proposer_side)
                    order by mt.start_at desc), '[]')
                 from app.meetings mt where mt.introduction_id = p_intro),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind,
                    'by', case when e.actor_side = v_side then 'ME' when e.actor_side = v_other_side then 'OTHER' else e.actor_side end,
                    'at', e.at) order by e.at), '[]')
                 from app.introduction_events e where e.introduction_id = p_intro));
end $$;

-- Candidate grants a scoped contact disclosure to ONE recipient (I3). Fresh auth required.
create function public.grant_contact(p_intro uuid, p_recipient uuid, p_fields text[], p_expires_in_days int default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_i app.introductions;
  v_side text;
  v_my_cid uuid;
  v_other_cid uuid;
  v_fields app.contact_field[];
  v_id uuid;
begin
  select * into v_i from app.introductions where id = p_intro for update;
  if v_i.id is null then perform app_private.fail('NOT_FOUND'); end if;
  v_side := app_private.match_side(v_i.match_id, 'VIEW_INTERESTS');
  v_my_cid := app_private.side_candidate(v_i.match_id, v_side);
  if v_side is null or not app_private.is_candidate_owner(v_my_cid) then
    return app_private.denied('FORBIDDEN', 'contact.grant', 'introduction', p_intro, '{}', 'Only the candidate can share contact details.');
  end if;
  perform app_private.require_recent_auth();
  if v_i.stage in ('CLOSED') then perform app_private.fail('INVALID_STATE'); end if;

  v_other_cid := app_private.side_candidate(v_i.match_id, case v_side when 'SOURCE' then 'TARGET' else 'SOURCE' end);
  if not exists (
      select 1 from app.family_members fm
      where fm.user_id = p_recipient and fm.active
        and fm.family_id = app_private.candidate_family(v_other_cid)
        and (fm.relation <> 'CANDIDATE' or fm.user_id = (select owner_user_id from app.candidates where id = v_other_cid))) then
    return app_private.denied('UNAUTHORISED_RECIPIENT', 'contact.grant', 'introduction', p_intro, jsonb_build_object('reason', 'bad_recipient'));
  end if;

  begin
    v_fields := p_fields::app.contact_field[];
  exception when others then
    perform app_private.fail('VALIDATION', 'Unknown contact field.');
  end;
  if coalesce(cardinality(v_fields), 0) = 0 then perform app_private.fail('VALIDATION', 'Choose at least one detail.'); end if;
  if p_expires_in_days not between 1 and app_private.cfg_int('contact_grant_max_days') then
    perform app_private.fail('VALIDATION', 'Invalid expiry.');
  end if;

  update app.contact_grants set revoked_at = now()
  where introduction_id = p_intro and grantor_candidate_id = v_my_cid and recipient_user_id = p_recipient and revoked_at is null;
  insert into app.contact_grants (introduction_id, grantor_candidate_id, grantor_user_id, recipient_user_id, fields, expires_at)
  values (p_intro, v_my_cid, v_uid, p_recipient, v_fields, now() + make_interval(days => p_expires_in_days))
  returning id into v_id;

  perform app_private.audit('contact.grant', 'contact_grant', v_id,
    jsonb_build_object('introduction_id', p_intro, 'fields', to_jsonb(v_fields), 'recipient', p_recipient));
  perform app_private.intro_event(p_intro, 'CONTACT_SHARED', v_side);
  perform app_private.notify(p_recipient, 'introduction.contact_shared', jsonb_build_object('introduction_id', p_intro));

  -- Both candidates have shared something with each other → INTRODUCED.
  if v_i.stage = 'PENDING_CONTACT' and exists (
       select 1 from app.contact_grants g join app.candidates c on c.id = v_other_cid
       where g.introduction_id = p_intro and g.grantor_candidate_id = v_other_cid and g.revoked_at is null
         and g.recipient_user_id = (select owner_user_id from app.candidates where id = v_my_cid))
     and exists (
       select 1 from app.contact_grants g
       where g.introduction_id = p_intro and g.grantor_candidate_id = v_my_cid and g.revoked_at is null
         and g.recipient_user_id = (select owner_user_id from app.candidates where id = v_other_cid)) then
    update app.introductions set stage = 'INTRODUCED', introduced_at = now() where id = p_intro;
    perform app_private.intro_event(p_intro, 'INTRODUCED', 'SYSTEM');
  end if;
  return jsonb_build_object('grant_id', v_id);
end $$;

create function public.revoke_contact_grant(p_grant uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_g app.contact_grants;
begin
  perform app_private.require_user();
  select * into v_g from app.contact_grants where id = p_grant for update;
  if v_g.id is null or not app_private.is_candidate_owner(v_g.grantor_candidate_id) then
    perform app_private.fail('FORBIDDEN');
  end if;
  update app.contact_grants set revoked_at = now() where id = p_grant and revoked_at is null;
  perform app_private.audit('contact.revoke', 'contact_grant', p_grant);
end $$;

-- Recipient reads exactly the fields granted to them. Every read is audited.
create function public.get_introduction_contacts(p_intro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_stage app.intro_stage;
  v_out jsonb;
begin
  select stage into v_stage from app.introductions where id = p_intro;
  if v_stage is null or app_private.intro_side(p_intro, 'VIEW_INTERESTS') is null then
    return app_private.denied('FORBIDDEN', 'contact.read', 'introduction', p_intro);
  end if;
  if v_stage = 'CLOSED' then perform app_private.fail('INVALID_STATE', 'This introduction is closed.'); end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'grant_id', g.id,
      'candidate_code', c.code,
      'full_name', case when 'FULL_NAME' = any (g.fields) then cp.full_name end,
      'phone', case when 'PHONE' = any (g.fields) then cp.phone end,
      'email', case when 'EMAIL' = any (g.fields) then cp.email end,
      'photo', 'PHOTO' = any (g.fields),
      'expires_at', g.expires_at))), '[]')
  into v_out
  from app.contact_grants g
  join app.candidates c on c.id = g.grantor_candidate_id
  join app.candidate_private cp on cp.candidate_id = g.grantor_candidate_id
  where g.introduction_id = p_intro and g.recipient_user_id = v_uid
    and g.revoked_at is null and g.expires_at > now()
    and c.status not in ('WITHDRAWN','ARCHIVED') and c.suspended_at is null;

  perform app_private.audit('contact.read', 'introduction', p_intro,
    jsonb_build_object('grants', (select jsonb_agg(x -> 'grant_id') from jsonb_array_elements(v_out) x)));
  return v_out;
end $$;

-- Participants move INTRODUCED → DISCUSSING. Other stages have dedicated actions.
create function public.mark_discussing(p_intro uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text := app_private.require_intro_participant(p_intro, 'COORDINATE_MEETINGS');
begin
  update app.introductions set stage = 'DISCUSSING' where id = p_intro and stage = 'INTRODUCED';
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  perform app_private.intro_event(p_intro, 'DISCUSSING', v_side);
  perform app_private.audit('introduction.stage', 'introduction', p_intro, '{"stage":"DISCUSSING"}');
end $$;

create function public.close_introduction(p_intro uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_side text := app_private.intro_side(p_intro, 'VIEW_INTERESTS');
  v_m uuid;
begin
  select match_id into v_m from app.introductions where id = p_intro;
  if v_side is null or not app_private.is_candidate_owner(app_private.side_candidate(v_m, v_side)) then
    perform app_private.fail('FORBIDDEN', 'Only a candidate can close an introduction.');
  end if;
  update app.introductions set stage = 'CLOSED', closed_at = now(), closed_by = v_uid,
         close_reason = left(p_reason, 200)
  where id = p_intro and stage not in ('CLOSED','MATCH_CONFIRMED');
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  update app.contact_grants set revoked_at = now() where introduction_id = p_intro and revoked_at is null;
  update app.meetings set status = 'CANCELLED' where introduction_id = p_intro and status = 'PROPOSED';
  perform app_private.intro_event(p_intro, 'CLOSED', v_side);
  perform app_private.audit('introduction.close', 'introduction', p_intro);
  perform app_private.notify_side(app_private.side_candidate(v_m, case v_side when 'SOURCE' then 'TARGET' else 'SOURCE' end),
    'introduction.update', jsonb_build_object('introduction_id', p_intro));
end $$;

-- Each candidate confirms; when both have, the introduction becomes MATCH_CONFIRMED.
create function public.confirm_match(p_intro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_side text := app_private.intro_side(p_intro, 'VIEW_INTERESTS');
  v_i app.introductions;
begin
  perform app_private.require_user();
  select * into v_i from app.introductions where id = p_intro for update;
  if v_side is null or not app_private.is_candidate_owner(app_private.side_candidate(v_i.match_id, v_side)) then
    perform app_private.fail('FORBIDDEN', 'Only a candidate can confirm.');
  end if;
  if v_i.stage not in ('INTRODUCED','DISCUSSING','MEETING_PLANNED') then perform app_private.fail('INVALID_STATE'); end if;
  if v_side = 'SOURCE' then
    update app.introductions set source_confirmed_at = coalesce(source_confirmed_at, now()) where id = p_intro returning * into v_i;
  else
    update app.introductions set target_confirmed_at = coalesce(target_confirmed_at, now()) where id = p_intro returning * into v_i;
  end if;
  if v_i.source_confirmed_at is not null and v_i.target_confirmed_at is not null then
    update app.introductions set stage = 'MATCH_CONFIRMED', closed_at = now() where id = p_intro;
    perform app_private.intro_event(p_intro, 'MATCH_CONFIRMED', 'SYSTEM');
    perform app_private.notify_side(app_private.side_candidate(v_i.match_id, 'SOURCE'), 'introduction.match_confirmed', jsonb_build_object('introduction_id', p_intro));
    perform app_private.notify_side(app_private.side_candidate(v_i.match_id, 'TARGET'), 'introduction.match_confirmed', jsonb_build_object('introduction_id', p_intro));
  end if;
  perform app_private.audit('introduction.confirm', 'introduction', p_intro, jsonb_build_object('side', v_side));
  return jsonb_build_object('stage', (select stage from app.introductions where id = p_intro));
end $$;

-- Meetings (M19). Participants with COORDINATE_MEETINGS (candidate included) or the assigned broker.
create function app_private.meeting_actor_side(p_intro uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.intro_side(p_intro, 'COORDINATE_MEETINGS'),
    case when exists (select 1 from app.introductions where id = p_intro and assigned_broker_id = (select auth.uid()))
              and app_private.has_role(array['broker']::app.staff_role[]) then 'BROKER' end)
$$;

create function public.propose_meeting(p_intro uuid, p_start_at timestamptz, p_timezone text, p_format text,
                                       p_location_hint text, p_idempotency_key text,
                                       p_replaces uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_side text := app_private.meeting_actor_side(p_intro);
  v_id uuid;
begin
  if v_side is null then
    perform app_private.fail('FORBIDDEN');
  end if;
  if not exists (select 1 from app.introductions where id = p_intro and stage in ('INTRODUCED','DISCUSSING','MEETING_PLANNED')) then
    perform app_private.fail('INVALID_STATE', 'Meetings can be planned once contact has been shared.');
  end if;
  if p_start_at < now() then perform app_private.fail('VALIDATION', 'Choose a future time.'); end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    perform app_private.fail('VALIDATION', 'Unknown time zone.');
  end if;

  select id into v_id from app.meetings where introduction_id = p_intro and idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  if p_replaces is not null then
    update app.meetings set status = 'RESCHEDULED', responded_by = v_uid, responded_at = now()
    where id = p_replaces and introduction_id = p_intro and status in ('PROPOSED','ACCEPTED');
    if not found then perform app_private.fail('INVALID_STATE'); end if;
  end if;

  insert into app.meetings (introduction_id, proposer_user_id, proposer_side, start_at, timezone, format,
                            location_hint, replaces_meeting_id, idempotency_key)
  values (p_intro, v_uid, v_side, p_start_at, p_timezone, p_format, nullif(trim(p_location_hint), ''),
          p_replaces, p_idempotency_key)
  returning id into v_id;
  perform app_private.intro_event(p_intro, case when p_replaces is null then 'MEETING_PROPOSED' else 'MEETING_RESCHEDULED' end, v_side);
  perform app_private.audit('meeting.propose', 'meeting', v_id);
  perform app_private.notify_side(app_private.side_candidate(i.match_id, s.other), 'meeting.proposed', jsonb_build_object('introduction_id', p_intro))
  from app.introductions i, (select unnest(case v_side when 'SOURCE' then array['TARGET'] when 'TARGET' then array['SOURCE']
                                                       else array['SOURCE','TARGET'] end) other) s
  where i.id = p_intro;
  return v_id;
end $$;

create function public.respond_meeting(p_meeting uuid, p_response text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_mt app.meetings;
  v_side text;
begin
  select * into v_mt from app.meetings where id = p_meeting for update;
  if v_mt.id is null then perform app_private.fail('NOT_FOUND'); end if;
  v_side := app_private.meeting_actor_side(v_mt.introduction_id);
  if v_side is null or v_side = v_mt.proposer_side or v_side = 'BROKER' then
    perform app_private.fail('FORBIDDEN', 'The other side responds to a meeting proposal.');
  end if;
  if p_response not in ('ACCEPT','DECLINE','CANCEL') then perform app_private.fail('VALIDATION'); end if;
  if v_mt.status <> 'PROPOSED' then perform app_private.fail('INVALID_STATE'); end if;

  update app.meetings set status = case p_response when 'ACCEPT' then 'ACCEPTED' when 'DECLINE' then 'DECLINED' else 'CANCELLED' end,
         responded_by = v_uid, responded_at = now()
  where id = p_meeting;
  if p_response = 'ACCEPT' then
    update app.introductions set stage = 'MEETING_PLANNED'
    where id = v_mt.introduction_id and stage in ('INTRODUCED','DISCUSSING');
  end if;
  perform app_private.intro_event(v_mt.introduction_id,
    case p_response when 'ACCEPT' then 'MEETING_ACCEPTED' when 'DECLINE' then 'MEETING_DECLINED' else 'MEETING_CANCELLED' end, v_side);
  perform app_private.audit('meeting.respond', 'meeting', p_meeting, jsonb_build_object('response', p_response));
end $$;

-- ---------------------------------------------------------------------------
-- RPC: withdrawal (M11) — hides immediately, blocks future access, queues deletion.
-- ---------------------------------------------------------------------------
create function public.withdraw_candidate(p_candidate uuid, p_request_deletion boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_user();
begin
  if not app_private.is_candidate_owner(p_candidate) then perform app_private.fail('FORBIDDEN'); end if;
  perform app_private.require_recent_auth();
  update app.candidates set status = 'WITHDRAWN', visibility = 'HIDDEN', withdrawn_at = now()
  where id = p_candidate and status not in ('WITHDRAWN','ARCHIVED');
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  update app.consents set revoked_at = now() where candidate_id = p_candidate and revoked_at is null;
  update app.family_permissions set revoked_at = now() where candidate_id = p_candidate and revoked_at is null;
  perform app_private.close_open_matches(p_candidate);
  delete from app.shortlists where candidate_id = p_candidate;
  if p_request_deletion then
    insert into app.deletion_requests (requester_id, scope, candidate_id) values (v_uid, 'CANDIDATE', p_candidate);
  end if;
  perform app_private.audit('candidate.withdraw', 'candidate', p_candidate, jsonb_build_object('deletion_requested', p_request_deletion));
end $$;
