-- Staff RPCs for the admin web app (A01–A10). Every function: staff role + MFA gate,
-- purpose-scoped projections, audit of sensitive reads and every decision.

-- ---------------------------------------------------------------------------
-- A01 Overview
-- ---------------------------------------------------------------------------
create function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['verifier','broker','moderator','admin']::app.staff_role[]);
begin
  return jsonb_build_object(
    'membership_pending', (select count(*) from app.families where status in ('APPLIED','UNDER_REVIEW')),
    'membership_needs_info', (select count(*) from app.families where status = 'NEEDS_INFO'),
    'candidates_in_review', (select count(*) from app.candidates where status = 'UNDER_REVIEW'),
    'my_open_cases', (select count(*) from app.verification_cases where reviewer_id = v_uid and status in ('PENDING','IN_REVIEW')),
    'active_candidates', (select count(*) from app.candidates where status = 'ACTIVE' and suspended_at is null),
    'introductions_open', (select count(*) from app.introductions where stage not in ('CLOSED','MATCH_CONFIRMED')),
    'introductions_unassigned', (select count(*) from app.introductions where assigned_broker_id is null and stage not in ('CLOSED','MATCH_CONFIRMED')),
    'matches_confirmed', (select count(*) from app.introductions where stage = 'MATCH_CONFIRMED'),
    'reports_open', (select count(*) from app.support_cases where status not in ('RESOLVED','CLOSED')),
    'reports_urgent', (select count(*) from app.support_cases where severity = 'URGENT' and status not in ('RESOLVED','CLOSED')),
    'data_requests_open', (select count(*) from app.deletion_requests where status in ('REQUESTED','IN_PROGRESS')),
    'evidence_expired_pending_deletion', (select count(*) from app.verification_evidence where deleted_at is null and expires_at < now()));
end $$;

create function public.admin_list_staff_users(p_role text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['admin','broker','verifier','moderator']::app.staff_role[]);
  return (select coalesce(jsonb_agg(distinct jsonb_build_object('user_id', u.id, 'name', u.display_name)), '[]')
    from app.role_assignments ra join app.users u on u.id = ra.user_id
    where ra.revoked_at is null and (p_role is null or ra.role::text = p_role or ra.role = 'super_admin'));
end $$;

-- ---------------------------------------------------------------------------
-- A02 Membership queue / A03 Family detail
-- ---------------------------------------------------------------------------
create function public.admin_list_membership_queue(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['verifier','admin']::app.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'family_id', f.id, 'family_code', f.code, 'family_name', f.name, 'district', f.district,
      'hometown', f.hometown, 'status', f.status, 'submitted_at', f.created_at,
      'applicant', (select jsonb_build_object('name', u.display_name, 'relation', fm.relation)
                    from app.family_members fm join app.users u on u.id = fm.user_id
                    where fm.family_id = f.id and fm.is_primary and fm.active),
      'case_id', vc.id, 'case_status', vc.status,
      'reviewer', (select u.display_name from app.users u where u.id = vc.reviewer_id),
      'referrals', (select count(*) from app.referrals r where r.applicant_family_id = f.id),
      'evidence', (select count(*) from app.verification_evidence ve where ve.case_id = vc.id and ve.deleted_at is null))
      order by f.created_at), '[]')
    from app.families f
    left join lateral (select * from app.verification_cases v where v.type = 'MEMBERSHIP' and v.subject_id = f.id
                       order by v.created_at desc limit 1) vc on true
    where (p_status is null and f.status in ('APPLIED','UNDER_REVIEW','NEEDS_INFO'))
       or f.status::text = p_status);
end $$;

create function public.admin_get_family(p_family uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  perform app_private.require_staff(array['verifier','admin','moderator']::app.staff_role[]);
  select jsonb_build_object(
    'family', to_jsonb(f),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.display_name,
                   'relation', fm.relation, 'is_primary', fm.is_primary, 'active', fm.active,
                   'user_status', u.status, 'joined_at', fm.joined_at, 'phone_last4', right(u.phone, 4))), '[]')
                from app.family_members fm join app.users u on u.id = fm.user_id where fm.family_id = f.id),
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'status', c.status,
                      'first_name', d.first_name, 'relationship', fc.relationship, 'claimed', c.owner_user_id is not null,
                      'suspended', c.suspended_at is not null)), '[]')
                   from app.family_candidates fc join app.candidates c on c.id = fc.candidate_id
                   join app.candidate_details d on d.candidate_id = c.id
                   where fc.family_id = f.id and fc.revoked_at is null),
    'referrals', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]') from app.referrals r where r.applicant_family_id = f.id),
    'cases', (select coalesce(jsonb_agg(jsonb_build_object('id', vc.id, 'status', vc.status, 'decision', vc.decision,
                 'reasons', vc.reasons, 'reviewer_id', vc.reviewer_id, 'created_at', vc.created_at,
                 'evidence', (select coalesce(jsonb_agg(jsonb_build_object('id', ve.id, 'type', ve.type,
                                 'uploaded_at', ve.uploaded_at, 'expires_at', ve.expires_at,
                                 'deleted', ve.deleted_at is not null, 'review_status', ve.review_status)), '[]')
                              from app.verification_evidence ve where ve.case_id = vc.id))
                 order by vc.created_at desc), '[]')
              from app.verification_cases vc where vc.type = 'MEMBERSHIP' and vc.subject_id = f.id),
    'permission_history', (select coalesce(jsonb_agg(jsonb_build_object('candidate_code', c.code, 'delegate', u.display_name,
                              'capability', fp.capability, 'granted_at', fp.granted_at, 'revoked_at', fp.revoked_at)
                              order by fp.granted_at desc), '[]')
                           from app.family_permissions fp join app.candidates c on c.id = fp.candidate_id
                           join app.users u on u.id = fp.delegate_user_id
                           where app_private.candidate_family(c.id) = f.id),
    'reports', (select count(*) from app.support_cases s where s.related_candidate_id in
                  (select candidate_id from app.family_candidates where family_id = f.id)))
  into v_out
  from app.families f where f.id = p_family;
  if v_out is null then perform app_private.fail('NOT_FOUND'); end if;
  perform app_private.audit('admin.family.view', 'family', p_family);
  return v_out;
end $$;

-- Verifiers self-assign; admins assign anyone holding the verifier role.
create function public.admin_assign_case(p_case uuid, p_reviewer uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_staff(array['verifier','admin']::app.staff_role[]);
  v_reviewer uuid := coalesce(p_reviewer, v_uid);
begin
  if v_reviewer <> v_uid and not app_private.has_role(array['admin']::app.staff_role[]) then
    perform app_private.fail('FORBIDDEN', 'Only admins can assign cases to others.');
  end if;
  if not app_private.has_role(array['verifier','admin']::app.staff_role[], v_reviewer) then
    perform app_private.fail('VALIDATION', 'Assignee is not a verifier.');
  end if;
  update app.verification_cases set reviewer_id = v_reviewer,
         status = case when status = 'PENDING' then 'IN_REVIEW'::app.verification_status else status end
  where id = p_case and status in ('PENDING','IN_REVIEW','MORE_INFO');
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  update app.families f set status = 'UNDER_REVIEW'
  from app.verification_cases vc
  where vc.id = p_case and vc.type = 'MEMBERSHIP' and f.id = vc.subject_id and f.status = 'APPLIED';
  perform app_private.audit('admin.case.assign', 'verification_case', p_case, jsonb_build_object('reviewer', v_reviewer));
end $$;

create function app_private.require_case_reviewer(p_case uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['verifier','admin']::app.staff_role[]);
begin
  if not exists (select 1 from app.verification_cases where id = p_case and reviewer_id = v_uid) then
    perform app_private.fail('FORBIDDEN', 'Assign this case to yourself first.');
  end if;
  return v_uid;
end $$;

create function public.admin_decide_membership(p_family uuid, p_decision text, p_applicant_message text default null,
                                               p_internal_notes text default null, p_checklist jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_case uuid;
  v_uid uuid;
  v_status app.membership_status;
begin
  select id into v_case from app.verification_cases
  where type = 'MEMBERSHIP' and subject_id = p_family and status in ('PENDING','IN_REVIEW','MORE_INFO');
  if v_case is null then perform app_private.fail('INVALID_STATE', 'No open case for this family.'); end if;
  v_uid := app_private.require_case_reviewer(v_case);
  if p_decision not in ('APPROVE','NEEDS_INFO','DECLINE') then perform app_private.fail('VALIDATION'); end if;
  if p_decision <> 'APPROVE' and coalesce(trim(p_applicant_message), '') = '' then
    perform app_private.fail('VALIDATION', 'A message to the applicant is required.');
  end if;

  v_status := case p_decision when 'APPROVE' then 'APPROVED' when 'NEEDS_INFO' then 'NEEDS_INFO' else 'DECLINED' end;
  update app.families set status = v_status, applicant_message = nullif(trim(p_applicant_message), ''),
         internal_notes = coalesce(nullif(trim(p_internal_notes), ''), internal_notes),
         decided_by = v_uid, decided_at = now()
  where id = p_family and status in ('APPLIED','UNDER_REVIEW','NEEDS_INFO');
  if not found then perform app_private.fail('INVALID_STATE'); end if;

  update app.verification_cases set
    status = case p_decision when 'APPROVE' then 'VERIFIED' when 'NEEDS_INFO' then 'MORE_INFO' else 'FAILED' end::app.verification_status,
    decision = p_decision, reasons = coalesce(nullif(trim(p_internal_notes), ''), p_applicant_message),
    checklist = coalesce(p_checklist, checklist),
    decided_at = case when p_decision <> 'NEEDS_INFO' then now() end
  where id = v_case;

  perform app_private.audit('admin.membership.decide', 'family', p_family,
    jsonb_build_object('decision', p_decision, 'case_id', v_case));
  perform app_private.notify(fm.user_id,
    case p_decision when 'APPROVE' then 'membership.approved' when 'NEEDS_INFO' then 'membership.action_needed' else 'membership.declined' end,
    jsonb_build_object('family_id', p_family))
  from app.family_members fm where fm.family_id = p_family and fm.active;
end $$;

create function public.admin_mark_referral(p_referral uuid, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['verifier','admin']::app.staff_role[]);
begin
  if p_status not in ('CONFIRMED','UNCONFIRMED','PENDING') then perform app_private.fail('VALIDATION'); end if;
  update app.referrals set check_status = p_status, notes = p_notes, checked_by = v_uid, checked_at = now()
  where id = p_referral;
  perform app_private.audit('admin.referral.check', 'referral', p_referral, jsonb_build_object('status', p_status));
end $$;

-- A05 — evidence opens only for the assigned reviewer; denials are audited.
create function public.admin_open_evidence(p_evidence uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_staff(array['verifier','admin']::app.staff_role[]);
  v_ev app.verification_evidence;
begin
  select ve.* into v_ev from app.verification_evidence ve where ve.id = p_evidence;
  if v_ev.id is null or not exists (
       select 1 from app.verification_cases vc where vc.id = v_ev.case_id and vc.reviewer_id = v_uid
         and vc.status in ('PENDING','IN_REVIEW','MORE_INFO')) then
    return app_private.denied('FORBIDDEN', 'admin.evidence.open', 'verification_evidence', p_evidence, '{}',
      'Only the assigned reviewer of an open case can open this document.');
  end if;
  if v_ev.deleted_at is not null or v_ev.expires_at < now() then
    return jsonb_build_object('error', 'EVIDENCE_EXPIRED');
  end if;
  perform app_private.audit('admin.evidence.open', 'verification_evidence', p_evidence);
  return jsonb_build_object('storage_path', v_ev.storage_path, 'type', v_ev.type);
end $$;

create function public.admin_review_evidence(p_evidence uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_case uuid;
begin
  select case_id into v_case from app.verification_evidence where id = p_evidence;
  perform app_private.require_case_reviewer(v_case);
  update app.verification_evidence set review_status = p_status where id = p_evidence;
  perform app_private.audit('admin.evidence.review', 'verification_evidence', p_evidence, jsonb_build_object('status', p_status));
end $$;

-- Marks expired evidence deleted (the storage object is removed by the cleanup job).
create function public.admin_purge_expired_evidence()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_paths jsonb;
begin
  perform app_private.require_staff(array['admin']::app.staff_role[]);
  with purged as (
    update app.verification_evidence set deleted_at = now()
    where deleted_at is null and expires_at < now() returning id, storage_path)
  select coalesce(jsonb_agg(storage_path), '[]') into v_paths from purged;
  perform app_private.audit('admin.evidence.purge', 'verification_evidence', null, jsonb_build_object('count', jsonb_array_length(v_paths)));
  return v_paths;
end $$;

-- ---------------------------------------------------------------------------
-- A04 Candidate review
-- ---------------------------------------------------------------------------
create function public.admin_list_candidate_queue(p_status text default 'UNDER_REVIEW')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['verifier','admin','moderator']::app.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'candidate_id', c.id, 'code', c.code, 'first_name', d.first_name, 'status', c.status,
      'age', app_private.age_years(d.dob), 'gender', d.gender, 'district', d.district,
      'family_name', f.name, 'family_status', f.status, 'updated_at', c.updated_at,
      'suspended', c.suspended_at is not null,
      'case_id', vc.id, 'case_status', vc.status,
      'reviewer', (select u.display_name from app.users u where u.id = vc.reviewer_id))
      order by c.updated_at), '[]')
    from app.candidates c
    join app.candidate_details d on d.candidate_id = c.id
    join app.family_candidates fc on fc.candidate_id = c.id and fc.revoked_at is null
    join app.families f on f.id = fc.family_id
    left join lateral (select * from app.verification_cases v where v.type = 'CANDIDATE' and v.subject_id = c.id
                       order by v.created_at desc limit 1) vc on true
    where c.status::text = p_status or (p_status = 'SUSPENDED' and c.suspended_at is not null));
end $$;

create function public.admin_get_candidate(p_candidate uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  perform app_private.require_staff(array['verifier','admin','moderator','broker']::app.staff_role[]);
  select jsonb_build_object(
    'candidate', to_jsonb(c),
    'details', to_jsonb(d) - 'dob' || jsonb_build_object('age', app_private.age_years(d.dob),
                 'meets_min_age', app_private.age_years(d.dob) >= app_private.min_age(d.gender)),
    'preferences', to_jsonb(p),
    'family', jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status, 'relationship', fc.relationship),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('type', cs.consent_type, 'policy_version', cs.policy_version,
                    'granted_at', cs.granted_at, 'revoked_at', cs.revoked_at, 'by_candidate', cs.actor_user_id = c.owner_user_id)
                    order by cs.granted_at desc), '[]') from app.consents cs where cs.candidate_id = c.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('at', h.changed_at, 'changes', h.changes - 'dob',
                   'by', (select display_name from app.users where id = h.changed_by)) order by h.changed_at desc), '[]')
                from (select * from app.candidate_detail_history where candidate_id = c.id order by changed_at desc limit 50) h),
    'cases', (select coalesce(jsonb_agg(jsonb_build_object('id', vc.id, 'status', vc.status, 'decision', vc.decision,
                 'reasons', vc.reasons, 'reviewer_id', vc.reviewer_id, 'checklist', vc.checklist, 'created_at', vc.created_at)
                 order by vc.created_at desc), '[]')
              from app.verification_cases vc where vc.type = 'CANDIDATE' and vc.subject_id = c.id),
    'gates', jsonb_build_object(
       'membership_approved', f.status = 'APPROVED',
       'claimed_by_candidate', c.owner_user_id is not null,
       'participate_consent', app_private.has_consent(c.id, 'PARTICIPATE'),
       'publish_consent', app_private.has_consent(c.id, 'PUBLISH'),
       'meets_min_age', app_private.age_years(d.dob) >= app_private.min_age(d.gender),
       'visibility', c.visibility,
       'not_suspended', c.suspended_at is null,
       'discoverable', app_private.is_discoverable(c.id, 'MEMBERS')))
  into v_out
  from app.candidates c
  join app.candidate_details d on d.candidate_id = c.id
  join app.family_candidates fc on fc.candidate_id = c.id and fc.revoked_at is null
  join app.families f on f.id = fc.family_id
  left join app.candidate_preferences p on p.candidate_id = c.id
  where c.id = p_candidate;
  if v_out is null then perform app_private.fail('NOT_FOUND'); end if;
  perform app_private.audit('admin.candidate.view', 'candidate', p_candidate);
  return v_out;
end $$;

-- Verify & publish only when every gate passes (I1).
create function public.admin_decide_candidate(p_candidate uuid, p_decision text, p_message text default null,
                                              p_photo_approved boolean default null, p_checklist jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_case uuid;
  v_uid uuid;
  v_c app.candidates;
  v_d app.candidate_details;
begin
  select id into v_case from app.verification_cases
  where type = 'CANDIDATE' and subject_id = p_candidate and status in ('PENDING','IN_REVIEW','MORE_INFO');
  if v_case is null then perform app_private.fail('INVALID_STATE', 'No open review for this candidate.'); end if;
  v_uid := app_private.require_case_reviewer(v_case);
  if p_decision not in ('VERIFY','MORE_INFO','FAIL') then perform app_private.fail('VALIDATION'); end if;
  select * into v_c from app.candidates where id = p_candidate for update;
  select * into v_d from app.candidate_details where candidate_id = p_candidate;

  if p_photo_approved is not null then
    update app.candidate_details set photo_approved = p_photo_approved where candidate_id = p_candidate;
  end if;

  if p_decision = 'VERIFY' then
    if (select status from app.families where id = app_private.candidate_family(p_candidate)) <> 'APPROVED' then
      perform app_private.fail('MEMBERSHIP_PENDING');
    end if;
    if v_c.owner_user_id is null or not app_private.has_consent(p_candidate, 'PARTICIPATE')
       or not app_private.has_consent(p_candidate, 'PUBLISH') then
      perform app_private.fail('CONSENT_REQUIRED', 'The candidate has not given consent.');
    end if;
    if app_private.age_years(v_d.dob) < app_private.min_age(v_d.gender) then
      perform app_private.fail('AGE_INELIGIBLE');
    end if;
    update app.candidates set status = 'ACTIVE', verified_at = coalesce(verified_at, now()),
           published_at = coalesce(published_at, now())
    where id = p_candidate;
  elsif p_decision = 'MORE_INFO' then
    if coalesce(trim(p_message), '') = '' then perform app_private.fail('VALIDATION', 'A message is required.'); end if;
    update app.candidates set status = 'AWAITING_CONSENT' where id = p_candidate;
  else
    if coalesce(trim(p_message), '') = '' then perform app_private.fail('VALIDATION', 'A reason is required.'); end if;
    update app.candidates set status = 'AWAITING_CONSENT', visibility = 'HIDDEN' where id = p_candidate;
  end if;

  update app.verification_cases set
    status = case p_decision when 'VERIFY' then 'VERIFIED' when 'MORE_INFO' then 'MORE_INFO' else 'FAILED' end::app.verification_status,
    decision = p_decision, reasons = p_message, checklist = coalesce(p_checklist, checklist),
    decided_at = case when p_decision <> 'MORE_INFO' then now() end
  where id = v_case;

  perform app_private.audit('admin.candidate.decide', 'candidate', p_candidate, jsonb_build_object('decision', p_decision));
  perform app_private.notify(v_c.owner_user_id,
    case p_decision when 'VERIFY' then 'candidate.verified' else 'candidate.action_needed' end,
    jsonb_build_object('candidate_id', p_candidate));
  return public.admin_get_candidate(p_candidate);
end $$;

-- Moderation: suspend / unsuspend a candidate (A04, A08).
create function public.admin_set_candidate_suspension(p_candidate uuid, p_suspend boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['moderator','admin']::app.staff_role[]);
  if coalesce(trim(p_reason), '') = '' then perform app_private.fail('VALIDATION', 'A reason is required.'); end if;
  update app.candidates set suspended_at = case when p_suspend then now() end,
         suspended_reason = case when p_suspend then p_reason end
  where id = p_candidate;
  if p_suspend then perform app_private.close_open_matches(p_candidate); end if;
  perform app_private.audit(case when p_suspend then 'admin.candidate.suspend' else 'admin.candidate.unsuspend' end,
    'candidate', p_candidate, jsonb_build_object('reason', p_reason));
end $$;

create function public.admin_set_user_restriction(p_user uuid, p_restrict boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['moderator','admin']::app.staff_role[]);
  if coalesce(trim(p_reason), '') = '' then perform app_private.fail('VALIDATION', 'A reason is required.'); end if;
  update app.users set status = case when p_restrict then 'RESTRICTED' else 'ACTIVE' end where id = p_user;
  perform app_private.audit(case when p_restrict then 'admin.user.restrict' else 'admin.user.unrestrict' end,
    'user', p_user, jsonb_build_object('reason', p_reason));
end $$;

create function public.admin_set_family_suspension(p_family uuid, p_suspend boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['moderator','admin']::app.staff_role[]);
  if coalesce(trim(p_reason), '') = '' then perform app_private.fail('VALIDATION', 'A reason is required.'); end if;
  update app.families set status = case when p_suspend then 'SUSPENDED' else 'APPROVED' end::app.membership_status,
         internal_notes = concat_ws(E'\n', internal_notes, now()::date || ': ' || p_reason)
  where id = p_family and status in ('APPROVED','SUSPENDED');
  if not found then perform app_private.fail('INVALID_STATE'); end if;
  perform app_private.audit(case when p_suspend then 'admin.family.suspend' else 'admin.family.unsuspend' end,
    'family', p_family, jsonb_build_object('reason', p_reason));
end $$;

-- ---------------------------------------------------------------------------
-- A06 Matchmaking (broker)
-- ---------------------------------------------------------------------------
create function public.admin_matchmaking_search(p_filters jsonb default '{}', p_for_candidate uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_f jsonb := coalesce(p_filters, '{}');
  v_for app.candidate_details;
  v_for_pref app.candidate_preferences;
begin
  perform app_private.require_staff(array['broker','admin']::app.staff_role[]);
  if p_for_candidate is not null then
    select * into v_for from app.candidate_details where candidate_id = p_for_candidate;
    select * into v_for_pref from app.candidate_preferences where candidate_id = p_for_candidate;
  end if;
  perform app_private.audit('admin.matchmaking.search', 'candidate', p_for_candidate, v_f);

  return (select coalesce(jsonb_agg(row order by (row ->> 'score')::int desc, row ->> 'code'), '[]') from (
    select app_private.public_card(c.id) || jsonb_build_object(
        'candidate_id', c.id, 'visibility', c.visibility,
        -- Explainable, rules-based reasons (no AI scoring).
        'reasons', case when v_for.candidate_id is null then '[]'::jsonb else to_jsonb(array_remove(array[
            case when v_for_pref.age_min is null or app_private.age_years(d.dob) between v_for_pref.age_min and coalesce(v_for_pref.age_max, 99)
                 then 'AGE_IN_PREFERRED_RANGE' end,
            case when d.district = any (v_for_pref.districts) then 'PREFERRED_DISTRICT' end,
            case when d.district = v_for.district then 'SAME_DISTRICT' end,
            case when p.age_min is null or app_private.age_years(v_for.dob) between p.age_min and coalesce(p.age_max, 99)
                 then 'MUTUAL_AGE_PREFERENCE' end,
            case when v_for_pref.open_to_relocation or p.open_to_relocation then 'OPEN_TO_RELOCATION' end
          ], null)) end,
        'score', case when v_for.candidate_id is null then 0 else
            (case when v_for_pref.age_min is null or app_private.age_years(d.dob) between v_for_pref.age_min and coalesce(v_for_pref.age_max, 99) then 2 else 0 end)
          + (case when d.district = any (v_for_pref.districts) then 2 else 0 end)
          + (case when d.district = v_for.district then 1 else 0 end)
          + (case when p.age_min is null or app_private.age_years(v_for.dob) between p.age_min and coalesce(p.age_max, 99) then 2 else 0 end) end,
        'open_match', exists (select 1 from app.match_requests m
                              where p_for_candidate is not null
                                and least(m.source_candidate_id, m.target_candidate_id) = least(c.id, p_for_candidate)
                                and greatest(m.source_candidate_id, m.target_candidate_id) = greatest(c.id, p_for_candidate))) as row
    from app.candidates c
    join app.candidate_details d on d.candidate_id = c.id
    left join app.candidate_preferences p on p.candidate_id = c.id
    where c.status = 'ACTIVE' and c.suspended_at is null
      and app_private.is_discoverable(c.id, 'BROKER')
      and (p_for_candidate is null or (c.id <> p_for_candidate
           and app_private.candidate_family(c.id) <> app_private.candidate_family(p_for_candidate)
           and d.gender <> v_for.gender
           and not app_private.is_blocked_between(app_private.candidate_family(p_for_candidate), c.id)))
      and (v_f ->> 'gender' is null or d.gender = v_f ->> 'gender')
      and (v_f ->> 'district' is null or d.district ilike v_f ->> 'district')
      and (v_f ->> 'profession' is null or d.profession ilike '%' || (v_f ->> 'profession') || '%')
      and (v_f ->> 'code' is null or c.code = upper(v_f ->> 'code'))
      and (v_f ->> 'age_min' is null or app_private.age_years(d.dob) >= (v_f ->> 'age_min')::int)
      and (v_f ->> 'age_max' is null or app_private.age_years(d.dob) <= (v_f ->> 'age_max')::int)
    limit 100) t);
end $$;

create function public.admin_suggest_match(p_source uuid, p_target uuid, p_rationale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_staff(array['broker','admin']::app.staff_role[]);
  v_id uuid;
begin
  if coalesce(trim(p_rationale), '') = '' then perform app_private.fail('VALIDATION', 'Explain why this is suggested.'); end if;
  if not app_private.is_discoverable(p_source, 'BROKER') or not app_private.is_discoverable(p_target, 'BROKER') then
    return app_private.denied('PROFILE_PRIVATE', 'admin.match.suggest', 'candidate', p_source,
      jsonb_build_object('target', p_target), 'Both profiles must currently be eligible.');
  end if;
  if app_private.candidate_family(p_source) = app_private.candidate_family(p_target)
     or app_private.is_blocked_between(app_private.candidate_family(p_source), p_target) then
    perform app_private.fail('INVALID_STATE');
  end if;
  perform app_private.expire_stale_matches();
  select id into v_id from app.match_requests
  where least(source_candidate_id, target_candidate_id) = least(p_source, p_target)
    and greatest(source_candidate_id, target_candidate_id) = greatest(p_source, p_target)
    and status in ('SUGGESTED','INTEREST_PENDING','AWAITING_CANDIDATE','MUTUALLY_ACCEPTED');
  if v_id is not null then return jsonb_build_object('match_id', v_id, 'duplicate', true); end if;

  insert into app.match_requests (source_candidate_id, target_candidate_id, initiated_by, initiated_via, status,
                                  broker_rationale, presented_to_target_at, expires_at)
  values (p_source, p_target, v_uid, 'BROKER', 'SUGGESTED', p_rationale, now(),
          now() + make_interval(days => app_private.cfg_int('interest_ttl_days')))
  returning id into v_id;
  perform app_private.notify_side(p_source, 'broker.recommendation', jsonb_build_object('match_id', v_id));
  perform app_private.notify_side(p_target, 'broker.recommendation', jsonb_build_object('match_id', v_id));
  perform app_private.audit('admin.match.suggest', 'match_request', v_id);
  return jsonb_build_object('match_id', v_id, 'duplicate', false);
end $$;

-- ---------------------------------------------------------------------------
-- A07 Introduction CRM
-- ---------------------------------------------------------------------------
create function public.admin_list_introductions(p_stage text default null, p_mine boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['broker','admin']::app.staff_role[]);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id, 'stage', i.stage, 'opened_at', i.opened_at, 'updated_at', i.updated_at,
      'source_code', (select code from app.candidates where id = m.source_candidate_id),
      'target_code', (select code from app.candidates where id = m.target_candidate_id),
      'via', m.initiated_via,
      'broker', (select display_name from app.users where id = i.assigned_broker_id),
      'assigned_to_me', i.assigned_broker_id = v_uid) order by i.updated_at desc), '[]')
    from app.introductions i join app.match_requests m on m.id = i.match_id
    where (p_stage is null or i.stage::text = p_stage)
      and (not p_mine or i.assigned_broker_id = v_uid));
end $$;

create function app_private.can_see_intro_as_staff(p_intro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.has_role(array['admin']::app.staff_role[])
      or exists (select 1 from app.introductions where id = p_intro and assigned_broker_id = (select auth.uid()))
$$;

create function public.admin_get_introduction(p_intro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_staff(array['broker','admin']::app.staff_role[]);
  v_key text := (select value from app_private.secrets where key = 'broker_notes_key');
  v_i app.introductions;
  v_m app.match_requests;
  v_assigned boolean;
begin
  select * into v_i from app.introductions where id = p_intro;
  if v_i.id is null then perform app_private.fail('NOT_FOUND'); end if;
  select * into v_m from app.match_requests where id = v_i.match_id;
  v_assigned := app_private.can_see_intro_as_staff(p_intro);
  perform app_private.audit('admin.introduction.view', 'introduction', p_intro, jsonb_build_object('with_notes', v_assigned));
  return jsonb_build_object(
    'introduction', to_jsonb(v_i),
    'match', jsonb_build_object('id', v_m.id, 'via', v_m.initiated_via, 'created_at', v_m.created_at,
                                'rationale', v_m.broker_rationale),
    'source', app_private.counterpart_card(v_m.source_candidate_id) || jsonb_build_object('candidate_id', v_m.source_candidate_id),
    'target', app_private.counterpart_card(v_m.target_candidate_id) || jsonb_build_object('candidate_id', v_m.target_candidate_id),
    'decisions', (select coalesce(jsonb_agg(jsonb_build_object('side', case when d.candidate_id = v_m.source_candidate_id then 'SOURCE' else 'TARGET' end,
                     'decision', d.decision, 'at', d.decided_at, 'by_candidate',
                     d.actor_user_id = (select owner_user_id from app.candidates where id = d.candidate_id)) order by d.decided_at), '[]')
                  from app.match_decisions d where d.match_id = v_m.id and d.superseded_at is null),
    -- Metadata only: staff never see contact values here.
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('side', case when g.grantor_candidate_id = v_m.source_candidate_id then 'SOURCE' else 'TARGET' end,
                  'fields', g.fields, 'granted_at', g.granted_at, 'revoked_at', g.revoked_at, 'expires_at', g.expires_at)), '[]')
               from app.contact_grants g where g.introduction_id = p_intro),
    'meetings', (select coalesce(jsonb_agg(to_jsonb(mt) - 'idempotency_key' order by mt.start_at desc), '[]')
                 from app.meetings mt where mt.introduction_id = p_intro),
    'timeline', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at), '[]') from app.introduction_events e where e.introduction_id = p_intro),
    'notes', case when v_assigned then
        (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'author', u.display_name, 'at', n.created_at,
                  'scope', n.visibility_scope,
                  'body', extensions.pgp_sym_decrypt(n.body_enc, v_key)) order by n.created_at), '[]')
         from app.broker_notes n join app.users u on u.id = n.author_id
         where n.introduction_id = p_intro
           and (n.visibility_scope = 'BROKERS' or app_private.has_role(array['admin']::app.staff_role[]))) end,
    'can_manage', v_assigned);
end $$;

create function public.admin_assign_broker(p_intro uuid, p_broker uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['broker','admin']::app.staff_role[]);
begin
  if p_broker <> v_uid and not app_private.has_role(array['admin']::app.staff_role[]) then
    perform app_private.fail('FORBIDDEN', 'Only admins can assign other brokers.');
  end if;
  if not app_private.has_role(array['broker']::app.staff_role[], p_broker) then
    perform app_private.fail('VALIDATION', 'Assignee is not a broker.');
  end if;
  update app.introductions set assigned_broker_id = p_broker where id = p_intro;
  perform app_private.intro_event(p_intro, 'BROKER_ASSIGNED', 'BROKER');
  perform app_private.audit('admin.introduction.assign', 'introduction', p_intro, jsonb_build_object('broker', p_broker));
end $$;

-- Broker stage updates. Stages that represent a candidate decision or contact consent
-- can never be set by staff — attempts are blocked and audited.
create function public.admin_set_intro_stage(p_intro uuid, p_stage text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_staff(array['broker','admin']::app.staff_role[]);
  v_stage app.intro_stage;
begin
  select stage into v_stage from app.introductions where id = p_intro for update;
  if not app_private.can_see_intro_as_staff(p_intro) then
    return app_private.denied('FORBIDDEN', 'admin.introduction.stage', 'introduction', p_intro,
      jsonb_build_object('requested', p_stage), 'Only the assigned broker can update this introduction.');
  end if;
  if p_stage in ('INTRODUCED','MATCH_CONFIRMED') or v_stage in ('PENDING_CONTACT','CLOSED','MATCH_CONFIRMED') and p_stage <> 'CLOSED' then
    return app_private.denied('CONSENT_REQUIRED', 'admin.introduction.stage', 'introduction', p_intro,
      jsonb_build_object('from', v_stage, 'requested', p_stage, 'reason', 'bypass_attempt'),
      'This stage requires the candidates'' own consent.');
  end if;
  if p_stage not in ('DISCUSSING','MEETING_PLANNED','CLOSED') then perform app_private.fail('VALIDATION'); end if;

  update app.introductions set stage = p_stage::app.intro_stage,
         closed_at = case when p_stage = 'CLOSED' then now() end,
         closed_by = case when p_stage = 'CLOSED' then v_uid end,
         close_reason = case when p_stage = 'CLOSED' then p_reason end
  where id = p_intro;
  if p_stage = 'CLOSED' then
    update app.contact_grants set revoked_at = now() where introduction_id = p_intro and revoked_at is null;
  end if;
  perform app_private.intro_event(p_intro, p_stage, 'BROKER');
  perform app_private.audit('admin.introduction.stage', 'introduction', p_intro, jsonb_build_object('from', v_stage, 'to', p_stage));
  return jsonb_build_object('stage', p_stage);
end $$;

create function public.admin_add_broker_note(p_intro uuid, p_body text, p_scope text default 'BROKERS')
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['broker','admin']::app.staff_role[]);
begin
  if not app_private.can_see_intro_as_staff(p_intro) then perform app_private.fail('FORBIDDEN'); end if;
  if coalesce(trim(p_body), '') = '' then perform app_private.fail('VALIDATION'); end if;
  insert into app.broker_notes (introduction_id, author_id, visibility_scope, body_enc)
  values (p_intro, v_uid, p_scope,
          extensions.pgp_sym_encrypt(p_body, (select value from app_private.secrets where key = 'broker_notes_key')));
  perform app_private.audit('admin.broker_note.add', 'introduction', p_intro);
end $$;

-- ---------------------------------------------------------------------------
-- A08 Support & grievances
-- ---------------------------------------------------------------------------
create function public.admin_list_support(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['moderator','admin']::app.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'category', s.category, 'severity', s.severity, 'status', s.status,
      'created_at', s.created_at, 'updated_at', s.updated_at,
      'reporter', (select display_name from app.users where id = s.reporter_id),
      'related_code', (select code from app.candidates where id = s.related_candidate_id),
      'assignee', (select display_name from app.users where id = s.assignee_id))
      order by (s.severity = 'URGENT') desc, s.created_at), '[]')
    from app.support_cases s
    where (p_status is null and s.status not in ('RESOLVED','CLOSED')) or s.status::text = p_status);
end $$;

create function public.admin_get_support_case(p_case uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  perform app_private.require_staff(array['moderator','admin']::app.staff_role[]);
  select to_jsonb(s) || jsonb_build_object(
      'reporter', jsonb_build_object('user_id', s.reporter_id, 'name', u.display_name,
                                     'family_id', app_private.my_family_id(s.reporter_id)),
      'related_candidate', case when s.related_candidate_id is not null then
          jsonb_build_object('candidate_id', s.related_candidate_id, 'code', c.code, 'status', c.status,
                             'suspended', c.suspended_at is not null, 'owner_user_id', c.owner_user_id,
                             'family_id', app_private.candidate_family(c.id)) end,
      'history', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'at', a.occurred_at,
                     'actor', (select display_name from app.users where id = a.actor_id), 'metadata', a.metadata)
                     order by a.occurred_at), '[]')
                  from app.audit_events a where a.object_type = 'support_case' and a.object_id = s.id))
  into v_out
  from app.support_cases s join app.users u on u.id = s.reporter_id
  left join app.candidates c on c.id = s.related_candidate_id
  where s.id = p_case;
  if v_out is null then perform app_private.fail('NOT_FOUND'); end if;
  perform app_private.audit('admin.support.view', 'support_case', p_case);
  return v_out;
end $$;

create function public.admin_update_support(p_case uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['moderator','admin']::app.staff_role[]);
begin
  update app.support_cases set
    status = coalesce((p ->> 'status')::app.support_status, status),
    severity = coalesce(p ->> 'severity', severity),
    assignee_id = case when p ? 'assignee_id' then (p ->> 'assignee_id')::uuid else assignee_id end,
    resolution = coalesce(p ->> 'resolution', resolution)
  where id = p_case;
  if not found then perform app_private.fail('NOT_FOUND'); end if;
  perform app_private.audit('admin.support.update', 'support_case', p_case, p);
  if p ? 'status' then
    perform app_private.notify(reporter_id, 'support.updated', jsonb_build_object('case_id', p_case))
    from app.support_cases where id = p_case;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A09 Audit & security
-- ---------------------------------------------------------------------------
create function public.admin_list_audit(p_filters jsonb default '{}', p_before timestamptz default null, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_f jsonb := coalesce(p_filters, '{}');
begin
  perform app_private.require_staff(array['admin']::app.staff_role[]);
  perform app_private.audit('admin.audit.view', 'audit_events', null, v_f);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'at', a.occurred_at, 'action', a.action,
             'object_type', a.object_type, 'object_id', a.object_id, 'outcome', a.outcome,
             'actor', (select display_name from app.users where id = a.actor_id), 'actor_id', a.actor_id,
             'request_id', a.request_id, 'metadata', a.metadata) order by a.occurred_at desc), '[]')
    from (select * from app.audit_events a
          where (p_before is null or a.occurred_at < p_before)
            and (v_f ->> 'action' is null or a.action ilike (v_f ->> 'action') || '%')
            and (v_f ->> 'outcome' is null or a.outcome = v_f ->> 'outcome')
            and (v_f ->> 'actor_id' is null or a.actor_id = (v_f ->> 'actor_id')::uuid)
            and (v_f ->> 'object_id' is null or a.object_id = (v_f ->> 'object_id')::uuid)
          order by a.occurred_at desc limit least(coalesce(p_limit, 100), 500)) a);
end $$;

-- ---------------------------------------------------------------------------
-- A10 Roles & settings (super admin)
-- ---------------------------------------------------------------------------
create function public.admin_list_role_assignments()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['super_admin']::app.staff_role[]);
  if not exists (select 1 from app.role_assignments where user_id = auth.uid() and role = 'super_admin' and revoked_at is null) then
    perform app_private.fail('FORBIDDEN');
  end if;
  perform app_private.audit('admin.roles.view', 'role_assignments', null);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', ra.id, 'user_id', ra.user_id, 'name', u.display_name,
             'phone_last4', right(u.phone, 4), 'role', ra.role, 'scope_type', ra.scope_type, 'scope_id', ra.scope_id,
             'granted_at', ra.granted_at, 'granted_by', (select display_name from app.users where id = ra.granted_by),
             'last_activity', (select max(occurred_at) from app.audit_events a where a.actor_id = ra.user_id))
             order by ra.granted_at), '[]')
    from app.role_assignments ra join app.users u on u.id = ra.user_id where ra.revoked_at is null);
end $$;

create function public.admin_grant_role(p_phone text, p_role text, p_scope_type text default 'GLOBAL', p_scope_id text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.require_staff(array['super_admin']::app.staff_role[]);
  v_target uuid;
  v_id uuid;
begin
  if not exists (select 1 from app.role_assignments where user_id = v_uid and role = 'super_admin' and revoked_at is null) then
    perform app_private.fail('FORBIDDEN');
  end if;
  select id into v_target from app.users where phone = p_phone;
  if v_target is null then perform app_private.fail('NOT_FOUND', 'The person must sign in once before a role can be granted.'); end if;
  insert into app.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_target, p_role::app.staff_role, p_scope_type, p_scope_id, v_uid)
  on conflict do nothing returning id into v_id;
  perform app_private.audit('admin.role.grant', 'user', v_target, jsonb_build_object('role', p_role, 'scope_type', p_scope_type, 'scope_id', p_scope_id));
  return v_id;
end $$;

create function public.admin_revoke_role(p_assignment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['super_admin']::app.staff_role[]);
begin
  if not exists (select 1 from app.role_assignments where user_id = v_uid and role = 'super_admin' and revoked_at is null) then
    perform app_private.fail('FORBIDDEN');
  end if;
  if exists (select 1 from app.role_assignments where id = p_assignment and user_id = v_uid and role = 'super_admin') then
    perform app_private.fail('INVALID_STATE', 'You cannot revoke your own super admin role.');
  end if;
  update app.role_assignments set revoked_at = now(), revoked_by = v_uid where id = p_assignment and revoked_at is null;
  perform app_private.audit('admin.role.revoke', 'role_assignment', p_assignment);
end $$;

create function public.admin_get_config()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['admin']::app.staff_role[]);
  return (select jsonb_object_agg(key, value) from app.config);
end $$;

create function public.admin_update_config(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['super_admin']::app.staff_role[]);
begin
  if not exists (select 1 from app.role_assignments where user_id = v_uid and role = 'super_admin' and revoked_at is null) then
    perform app_private.fail('FORBIDDEN');
  end if;
  update app.config set value = p_value, updated_at = now(), updated_by = v_uid where key = p_key;
  if not found then perform app_private.fail('NOT_FOUND'); end if;
  perform app_private.audit('admin.config.update', 'config', null, jsonb_build_object('key', p_key, 'value', p_value));
end $$;

-- Data requests (deletion / export)
create function public.admin_list_data_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_staff(array['admin']::app.staff_role[]);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'scope', r.scope, 'status', r.status,
             'requested_at', r.requested_at, 'completed_at', r.completed_at, 'exceptions', r.exceptions,
             'requester', u.display_name, 'candidate_code', (select code from app.candidates where id = r.candidate_id))
             order by r.requested_at), '[]')
    from app.deletion_requests r join app.users u on u.id = r.requester_id);
end $$;

create function public.admin_update_data_request(p_request uuid, p_status text, p_exceptions text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app_private.require_staff(array['admin']::app.staff_role[]);
begin
  update app.deletion_requests set status = p_status, exceptions = p_exceptions, handled_by = v_uid,
         completed_at = case when p_status in ('COMPLETED','REJECTED') then now() end
  where id = p_request;
  perform app_private.audit('admin.data_request.update', 'deletion_request', p_request, jsonb_build_object('status', p_status));
end $$;

-- One-time bootstrap, callable only from a privileged SQL session (not exposed via API).
create function app_private.bootstrap_super_admin(p_phone text, p_name text default 'Super Admin')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select id into v_uid from app.users where phone = p_phone;
  if v_uid is null then raise exception 'User % must sign in once first', p_phone; end if;
  update app.users set display_name = coalesce(display_name, p_name) where id = v_uid;
  insert into app.role_assignments (user_id, role) values (v_uid, 'super_admin') on conflict do nothing;
  insert into app.audit_events (actor_id, action, object_type, object_id, metadata)
  values (null, 'bootstrap.super_admin', 'user', v_uid, '{}');
  return v_uid;
end $$;
