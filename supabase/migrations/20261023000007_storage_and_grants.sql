-- Private storage buckets + policies, and final privilege lockdown.

-- Policy helpers live in a schema that is NOT exposed through the Data API, but that the
-- `authenticated` role can execute (storage policies run as the requesting user).
create schema if not exists app_policy;

create function app_policy.can_upload_evidence(p_object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.verification_cases vc
    where vc.id::text = split_part(p_object_name, '/', 1)
      and vc.status in ('PENDING','IN_REVIEW','MORE_INFO')
      and (
        (vc.type = 'MEMBERSHIP' and vc.subject_id = app_private.my_family_id((select auth.uid())))
        or (vc.type = 'CANDIDATE' and app_private.candidate_family(vc.subject_id) = app_private.my_family_id((select auth.uid())))
      ))
$$;

-- Only the assigned reviewer of an open case, and only for non-expired evidence.
create function app_policy.can_read_evidence(p_object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.verification_evidence ve
    join app.verification_cases vc on vc.id = ve.case_id
    where ve.storage_path = p_object_name and ve.deleted_at is null and ve.expires_at > now()
      and vc.reviewer_id = (select auth.uid())
      and vc.status in ('PENDING','IN_REVIEW','MORE_INFO')
      and app_private.has_role(array['verifier','admin']::app.staff_role[])
      and ((app_private.cfg('require_staff_mfa'))::boolean is false
           or coalesce(app_private.jwt() ->> 'aal', 'aal1') = 'aal2'))
$$;

-- Admins remove storage objects only after the evidence row has been purged.
create function app_policy.can_delete_evidence(p_object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.verification_evidence ve
                 where ve.storage_path = p_object_name and ve.deleted_at is not null)
     and app_private.has_role(array['admin']::app.staff_role[])
     and ((app_private.cfg('require_staff_mfa'))::boolean is false
          or coalesce(app_private.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

create function app_policy.can_write_photo(p_object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.can_act_for(nullif(split_part(p_object_name, '/', 1), '')::uuid, 'EDIT_BIODATA')
$$;

create function app_policy.can_read_photo(p_object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.candidate_details d
    where d.photo_path = p_object_name
      and app_private.can_view_photo(d.candidate_id, (select auth.uid())))
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('evidence', 'evidence', false, 5242880, array['image/jpeg','image/png','application/pdf']),
           ('photos',   'photos',   false, 3145728, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    execute $p$ create policy "evidence upload by applicant family" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'evidence' and app_policy.can_upload_evidence(name)) $p$;
    execute $p$ create policy "evidence read by assigned reviewer" on storage.objects
      for select to authenticated
      using (bucket_id = 'evidence' and app_policy.can_read_evidence(name)) $p$;
    execute $p$ create policy "evidence delete after purge" on storage.objects
      for delete to authenticated
      using (bucket_id = 'evidence' and app_policy.can_delete_evidence(name)) $p$;
    execute $p$ create policy "photo upload by editors" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'photos' and app_policy.can_write_photo(name)) $p$;
    execute $p$ create policy "photo delete by editors" on storage.objects
      for delete to authenticated
      using (bucket_id = 'photos' and app_policy.can_write_photo(name)) $p$;
    execute $p$ create policy "photo read when permitted" on storage.objects
      for select to authenticated
      using (bucket_id = 'photos' and (app_policy.can_write_photo(name) or app_policy.can_read_photo(name))) $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privilege lockdown
-- ---------------------------------------------------------------------------
revoke all on all tables in schema app from public;
revoke all on all sequences in schema app from public;
revoke all on all functions in schema app_private from public;
revoke all on all functions in schema app_policy from public;
revoke all on all functions in schema public from public;
revoke all on schema app_policy from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema app from anon, authenticated';
    execute 'revoke all on all functions in schema app_private from anon, authenticated';
    execute 'revoke all on all functions in schema public from anon';
    execute 'grant execute on all functions in schema public to authenticated';
    execute 'grant usage on schema app_policy to authenticated';
    execute 'grant execute on all functions in schema app_policy to authenticated';
    -- Supabase grants EXECUTE on new functions to anon by default; stop that for future objects.
    execute 'alter default privileges in schema public revoke execute on functions from anon, public';
  end if;
end $$;
