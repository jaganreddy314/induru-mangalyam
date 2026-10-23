-- DEVELOPMENT SEED — all people, numbers and families are FICTITIOUS.
-- Phones use the +91 90000 0xxxx range, mapped to test OTP 123456 in supabase/config.toml.
-- Never run against production.

do $$
declare
  r record;
begin
  for r in select * from (values
    ('00000000-0000-4000-8000-000000000001'::uuid, '919000000001', 'Demo Super Admin'),
    ('00000000-0000-4000-8000-000000000002'::uuid, '919000000002', 'Demo Verifier'),
    ('00000000-0000-4000-8000-000000000003'::uuid, '919000000003', 'Demo Broker'),
    ('00000000-0000-4000-8000-000000000004'::uuid, '919000000004', 'Demo Moderator'),
    ('00000000-0000-4000-8000-000000000011'::uuid, '919000000011', 'Demo Father Kotha'),
    ('00000000-0000-4000-8000-000000000012'::uuid, '919000000012', 'Demo Arjun Kotha'),
    ('00000000-0000-4000-8000-000000000021'::uuid, '919000000021', 'Demo Mother Pasula'),
    ('00000000-0000-4000-8000-000000000022'::uuid, '919000000022', 'Demo Lakshmi Pasula'),
    ('00000000-0000-4000-8000-000000000031'::uuid, '919000000031', 'Demo Father Gaddam'),
    ('00000000-0000-4000-8000-000000000032'::uuid, '919000000032', 'Demo Sravani Gaddam'),
    ('00000000-0000-4000-8000-000000000041'::uuid, '919000000041', 'Demo Applicant Bheemana')
  ) as t(id, phone, name) loop
    insert into auth.users (id, phone) values (r.id, r.phone) on conflict (id) do nothing;
    insert into app.users (id, phone, display_name, locale) values (r.id, '+' || r.phone, r.name, 'te') on conflict (id) do nothing;
  end loop;

  -- Real Supabase auth.users needs these for phone sign-in; the local test shim does not have them.
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
    execute $q$ update auth.users set aud = 'authenticated', role = 'authenticated',
      instance_id = '00000000-0000-0000-0000-000000000000', phone_confirmed_at = now(),
      raw_app_meta_data = '{"provider":"phone","providers":["phone"]}', raw_user_meta_data = '{}',
      created_at = coalesce(created_at, now()), updated_at = now(),
      confirmation_token = '', recovery_token = '', email_change = '', email_change_token_new = '',
      email_change_token_current = '', phone_change = '', phone_change_token = '', reauthentication_token = ''
      where id::text like '00000000-0000-4000-8000-%' $q$;
    execute $q$ insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true), 'phone', now(), now(), now()
      from auth.users u where u.id::text like '00000000-0000-4000-8000-%'
      on conflict do nothing $q$;
  end if;
end $$;

insert into app.role_assignments (user_id, role) values
  ('00000000-0000-4000-8000-000000000001', 'super_admin'),
  ('00000000-0000-4000-8000-000000000002', 'verifier'),
  ('00000000-0000-4000-8000-000000000003', 'broker'),
  ('00000000-0000-4000-8000-000000000004', 'moderator')
on conflict do nothing;

-- Families: three approved, one pending application.
insert into app.families (id, code, name, district, hometown, status, eligibility_declared_at, created_by, decided_by, decided_at) values
  ('10000000-0000-4000-8000-000000000001', 'F-DEMO01', 'Kotha family (demo)',   'Nizamabad', 'Armoor',     'APPROVED', now(), '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', now()),
  ('10000000-0000-4000-8000-000000000002', 'F-DEMO02', 'Pasula family (demo)',  'Nizamabad', 'Bodhan',     'APPROVED', now(), '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000002', now()),
  ('10000000-0000-4000-8000-000000000003', 'F-DEMO03', 'Gaddam family (demo)',  'Kamareddy', 'Yellareddy', 'APPROVED', now(), '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000002', now()),
  ('10000000-0000-4000-8000-000000000004', 'F-DEMO04', 'Bheemana family (demo)','Nizamabad', 'Dichpally',  'APPLIED',  now(), '00000000-0000-4000-8000-000000000041', null, null)
on conflict do nothing;

insert into app.family_members (family_id, user_id, relation, is_primary, can_invite) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'FATHER',    true,  true),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000012', 'CANDIDATE', false, false),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000021', 'MOTHER',    true,  true),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000022', 'CANDIDATE', false, false),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000031', 'FATHER',    true,  true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000032', 'CANDIDATE', false, false),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000041', 'FATHER',    true,  true)
on conflict do nothing;

insert into app.verification_cases (type, subject_id, reviewer_id, status, decision, decided_at) values
  ('MEMBERSHIP', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'VERIFIED', 'APPROVE', now()),
  ('MEMBERSHIP', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'VERIFIED', 'APPROVE', now()),
  ('MEMBERSHIP', '10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'VERIFIED', 'APPROVE', now()),
  ('MEMBERSHIP', '10000000-0000-4000-8000-000000000004', null, 'PENDING', null, null);

insert into app.referrals (applicant_family_id, referee_family_code, referee_name, relation_to_applicant) values
  ('10000000-0000-4000-8000-000000000004', 'F-DEMO01', 'Demo Father Kotha', 'Same village');

-- Candidates: claimed by their own accounts, consented, verified, published.
insert into app.candidates (id, code, created_by, owner_user_id, status, visibility, verified_at, published_at) values
  ('20000000-0000-4000-8000-000000000001', 'IM-DEMOAK1', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000012', 'ACTIVE', 'MEMBERS', now(), now() - interval '3 days'),
  ('20000000-0000-4000-8000-000000000002', 'IM-DEMOLP2', '00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000022', 'ACTIVE', 'MEMBERS', now(), now() - interval '2 days'),
  ('20000000-0000-4000-8000-000000000003', 'IM-DEMOSG3', '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000032', 'ACTIVE', 'MEMBERS', now(), now() - interval '1 day')
on conflict do nothing;

insert into app.family_candidates (family_id, candidate_id, relationship) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'SON'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'DAUGHTER'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'DAUGHTER');

insert into app.candidate_details (candidate_id, first_name, gender, dob, height_cm, education, profession, city, district, state, bio, family_summary, customs) values
  ('20000000-0000-4000-8000-000000000001', 'Arjun', 'MALE', '1996-03-14', 175, 'B.Tech, JNTU Hyderabad', 'Software engineer', 'Hyderabad', 'Nizamabad', 'Telangana',
   'Demo profile. Enjoys cricket and Telugu literature. Works in Hyderabad, visits home most weekends.', 'Demo family. Father is a retired teacher; mother runs a small tailoring unit.', '{"gotram":"Demo-gotram"}'),
  ('20000000-0000-4000-8000-000000000002', 'Lakshmi', 'FEMALE', '1998-08-02', 160, 'M.Sc Chemistry', 'Research associate', 'Hyderabad', 'Nizamabad', 'Telangana',
   'Demo profile. Researcher who loves classical music and cooking for family festivals.', 'Demo family. Parents farm in Bodhan; one younger brother.', '{}'),
  ('20000000-0000-4000-8000-000000000003', 'Sravani', 'FEMALE', '1997-11-20', 163, 'MBBS', 'Doctor', 'Kamareddy', 'Kamareddy', 'Telangana',
   'Demo profile. Practising doctor in Kamareddy, values family time and community service.', 'Demo family. Father runs a pharmacy; mother is a homemaker.', '{}')
on conflict do nothing;

insert into app.candidate_preferences (candidate_id, age_min, age_max, districts, open_to_relocation) values
  ('20000000-0000-4000-8000-000000000001', 24, 30, '{Nizamabad,Kamareddy,Hyderabad}', true),
  ('20000000-0000-4000-8000-000000000002', 26, 32, '{Nizamabad,Hyderabad}', true),
  ('20000000-0000-4000-8000-000000000003', 27, 33, '{Kamareddy,Nizamabad}', false)
on conflict do nothing;

insert into app.candidate_private (candidate_id, full_name, phone, email) values
  ('20000000-0000-4000-8000-000000000001', 'Arjun Kotha (demo)',   '+919000000012', 'arjun.demo@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'Lakshmi Pasula (demo)', '+919000000022', 'lakshmi.demo@example.test'),
  ('20000000-0000-4000-8000-000000000003', 'Sravani Gaddam (demo)', '+919000000032', 'sravani.demo@example.test')
on conflict do nothing;

insert into app.consents (candidate_id, actor_user_id, consent_type, policy_version, evidence)
select c.id, c.owner_user_id, t.ct::app.consent_type, '2026-10-v1', '{"seed":true}'
from app.candidates c cross join (values ('PARTICIPATE'), ('PUBLISH')) t(ct)
where c.code like 'IM-DEMO%'
on conflict do nothing;

insert into app.family_permissions (candidate_id, delegate_user_id, capability, granted_by)
select c.id, c.created_by, cap::app.family_capability, c.owner_user_id
from app.candidates c cross join unnest(array['EDIT_BIODATA','SUGGEST_INTEREST','VIEW_INTERESTS','COORDINATE_MEETINGS']) cap
where c.code like 'IM-DEMO%'
on conflict do nothing;

insert into app.verification_cases (type, subject_id, reviewer_id, status, decision, decided_at)
select 'CANDIDATE', id, '00000000-0000-4000-8000-000000000002', 'VERIFIED', 'VERIFY', now()
from app.candidates where code like 'IM-DEMO%';
