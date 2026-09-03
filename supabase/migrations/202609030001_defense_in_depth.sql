-- Defense-in-depth defaults and immediate session revocation.
-- Existing table grants stay intentionally narrow; future objects default to private.

revoke create on schema public from public, anon, authenticated;
revoke usage on schema public from public;
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from public, anon;
revoke execute on all functions in schema public from public, anon;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke usage on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and exists (
      select 1
      from auth.sessions s
      where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
        and s.user_id = p.id
        and (s.not_after is null or s.not_after > now())
    );
$$;

grant execute on function private.current_app_role() to authenticated;

grant execute on function private.create_care_invitation(text) to authenticated;
grant execute on function private.claim_care_invitation(text) to authenticated;
grant execute on function private.approve_patient_connection(uuid, uuid) to authenticated;
grant execute on function private.publish_patient_plan(uuid, text, text, text, text, text[], integer, integer, integer) to authenticated;
grant execute on function private.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function private.publish_patient_plan_v3(uuid, text, text, text, text, jsonb, integer, integer, boolean) to authenticated;

grant execute on function public.create_care_invitation(text) to authenticated;
grant execute on function public.claim_care_invitation(text) to authenticated;
grant execute on function public.approve_patient_connection(uuid, uuid) to authenticated;
grant execute on function public.publish_patient_plan(uuid, text, text, text, text, text[], integer, integer, integer) to authenticated;
grant execute on function public.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.publish_patient_plan_v3(uuid, text, text, text, text, jsonb, integer, integer, boolean) to authenticated;
