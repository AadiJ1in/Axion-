-- Require a live AAL2 Supabase Auth session for therapist authorization.
-- Patients retain AAL1 access; therapist self-profile reads remain available so
-- the client can route password-authenticated therapists into MFA enrollment.

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
    )
    and (
      p.role <> 'therapist'::public.app_role
      or (select auth.jwt()) ->> 'aal' = 'aal2'
    );
$$;

revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;
