-- Axion RC1 application/schema compatibility contract.
-- Non-sensitive capability metadata only; no migration SQL or patient data is exposed.

create or replace function public.axion_application_schema_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'axion-rc1-2026-09-11'::text;
$$;

create or replace function public.axion_application_schema_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'revision', 'axion-rc1-2026-09-11',
    'contract_version', 1,
    'verified_session_identity', true,
    'roadmap_identity_required', true,
    'session_context_snapshot', true
  );
$$;

revoke all on function public.axion_application_schema_version() from public;
revoke all on function public.axion_application_schema_capabilities() from public;
grant execute on function public.axion_application_schema_version() to anon, authenticated;
grant execute on function public.axion_application_schema_capabilities() to anon, authenticated;

comment on function public.axion_application_schema_version() is
  'Non-sensitive semantic application/schema compatibility revision expected by Axion RC1 clients.';
comment on function public.axion_application_schema_capabilities() is
  'Non-sensitive RC1 capability flags for fail-closed client initialization.';
