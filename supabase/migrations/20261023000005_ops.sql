-- Support & grievances, deletion/export requests, notifications, session state.

create table app.support_cases (
  id                      uuid primary key default gen_random_uuid(),
  reporter_id             uuid not null references app.users (id),
  category                text not null check (category in ('IMPERSONATION','PRESSURE','HARASSMENT','DATA_MISUSE','FALSE_CLAIMS','OTHER')),
  related_candidate_id    uuid references app.candidates (id) on delete set null,
  related_introduction_id uuid references app.introductions (id) on delete set null,
  description             text not null check (char_length(description) between 10 and 4000),
  severity                text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH','URGENT')),
  status                  app.support_status not null default 'OPEN',
  assignee_id             uuid references app.users (id),
  resolution              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index support_cases_queue_idx on app.support_cases (status, severity, created_at);
create index support_cases_reporter_idx on app.support_cases (reporter_id, created_at desc);
create trigger support_cases_touch before update on app.support_cases
  for each row execute function app_private.touch_updated_at();

create table app.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references app.users (id),
  scope        text not null check (scope in ('ACCOUNT','CANDIDATE','EXPORT')),
  candidate_id uuid references app.candidates (id) on delete set null,
  status       text not null default 'REQUESTED' check (status in ('REQUESTED','IN_PROGRESS','COMPLETED','REJECTED')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  handled_by   uuid references app.users (id),
  exceptions   text
);
create unique index deletion_requests_open_uq on app.deletion_requests (requester_id, scope, coalesce(candidate_id, '00000000-0000-0000-0000-000000000000'))
  where status in ('REQUESTED','IN_PROGRESS');

alter table app.support_cases     enable row level security;
alter table app.deletion_requests enable row level security;

-- ---------------------------------------------------------------------------
-- RPC: session state (drives navigation: no tabs before approval)
-- ---------------------------------------------------------------------------
create function public.get_session_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_user app.users;
begin
  if v_uid is null then perform app_private.fail('UNAUTHENTICATED'); end if;
  select * into v_user from app.users where id = v_uid;
  return jsonb_build_object(
    'user', jsonb_build_object('id', v_user.id, 'display_name', v_user.display_name, 'phone', v_user.phone,
                               'locale', v_user.locale, 'status', v_user.status,
                               'notification_prefs', v_user.notification_prefs),
    'membership', (select jsonb_build_object('family_id', f.id, 'family_name', f.name, 'status', f.status,
                                             'relation', fm.relation, 'can_invite', fm.can_invite)
                   from app.family_members fm join app.families f on f.id = fm.family_id
                   where fm.user_id = v_uid and fm.active),
    'own_candidate', (select jsonb_build_object('id', c.id, 'code', c.code, 'status', c.status)
                      from app.candidates c where c.owner_user_id = v_uid),
    'staff_roles', (select coalesce(jsonb_agg(distinct ra.role), '[]') from app.role_assignments ra
                    where ra.user_id = v_uid and ra.revoked_at is null),
    'unread_notifications', (select count(*) from app.notifications n where n.recipient_id = v_uid and n.status = 'UNREAD'));
end $$;

-- ---------------------------------------------------------------------------
-- RPC: notifications (M20)
-- ---------------------------------------------------------------------------
create function public.list_notifications(p_before timestamptz default null, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_user();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'template_key', n.template_key,
             'payload', n.payload, 'status', n.status, 'created_at', n.created_at) order by n.created_at desc), '[]')
    from (select * from app.notifications
          where recipient_id = v_uid and (p_before is null or created_at < p_before)
          order by created_at desc limit least(coalesce(p_limit, 30), 100)) n);
end $$;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_user();
begin
  update app.notifications set status = 'READ', read_at = now()
  where recipient_id = v_uid and status = 'UNREAD' and (p_ids is null or id = any (p_ids));
end $$;

-- ---------------------------------------------------------------------------
-- RPC: help / report (M22)
-- ---------------------------------------------------------------------------
create function public.file_report(p_category text, p_description text, p_related_code text default null,
                                   p_introduction uuid default null, p_urgent boolean default false,
                                   p_pause_my_profile boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_related uuid;
  v_id uuid;
begin
  perform app_private.rate_limit('report', app_private.cfg_int('rate_report_per_day'), interval '1 day');
  if p_related_code is not null then
    v_related := app_private.candidate_by_code(p_related_code);
  end if;
  if p_introduction is not null and app_private.intro_side(p_introduction, 'VIEW_INTERESTS') is null then
    p_introduction := null;  -- never let a report reveal or attach to an unrelated introduction
  end if;

  insert into app.support_cases (reporter_id, category, related_candidate_id, related_introduction_id, description, severity)
  values (v_uid, p_category, v_related, p_introduction, p_description,
          case when p_urgent or p_category in ('PRESSURE','IMPERSONATION') then 'URGENT' else 'MEDIUM' end)
  returning id into v_id;

  -- Urgent self-protection: pause the reporter's own profile immediately.
  if p_pause_my_profile then
    update app.candidates set status = 'PAUSED', paused_at = now()
    where owner_user_id = v_uid and status in ('ACTIVE','UNDER_REVIEW');
  end if;

  perform app_private.audit('support.report', 'support_case', v_id,
    jsonb_build_object('category', p_category, 'urgent', p_urgent, 'paused_self', p_pause_my_profile));
  perform app_private.notify_staff(array['moderator','admin']::app.staff_role[],
    case when p_urgent then 'staff.report_urgent' else 'staff.report_new' end, jsonb_build_object('case_id', v_id));
  return v_id;
end $$;

create function public.list_my_reports()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_user();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'category', s.category, 'status', s.status,
             'created_at', s.created_at, 'updated_at', s.updated_at) order by s.created_at desc), '[]')
    from app.support_cases s where s.reporter_id = v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- RPC: data rights (M21)
-- ---------------------------------------------------------------------------
create function public.request_data_action(p_scope text, p_candidate uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_user();
  v_id uuid;
begin
  if p_scope not in ('ACCOUNT','CANDIDATE','EXPORT') then perform app_private.fail('VALIDATION'); end if;
  if p_scope = 'CANDIDATE' and not app_private.is_candidate_owner(p_candidate) then
    perform app_private.fail('FORBIDDEN');
  end if;
  insert into app.deletion_requests (requester_id, scope, candidate_id) values (v_uid, p_scope, p_candidate)
  on conflict do nothing returning id into v_id;
  perform app_private.audit('data_request.create', 'deletion_request', v_id, jsonb_build_object('scope', p_scope));
  return v_id;
end $$;

-- Family member leaves the family account; all delegations they hold lapse (I4).
create function public.leave_family()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_user();
begin
  if exists (select 1 from app.family_members where user_id = v_uid and active and is_primary)
     and (select count(*) from app.family_members fm where fm.family_id = app_private.my_family_id(v_uid) and fm.active) > 1 then
    perform app_private.fail('INVALID_STATE', 'Transfer the primary role before leaving.');
  end if;
  update app.family_permissions set revoked_at = now() where delegate_user_id = v_uid and revoked_at is null;
  update app.family_members set active = false, left_at = now() where user_id = v_uid and active;
  perform app_private.audit('family.leave', 'user', v_uid);
end $$;
