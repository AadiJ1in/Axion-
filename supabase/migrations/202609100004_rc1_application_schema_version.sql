-- RC1 P0: one safe compatibility identifier for browser/database coordination.
-- This does not expose migration SQL, table contents, or privileged metadata.

create or replace function public.axion_application_schema_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select '202609100004'::text;
$$;

revoke all on function public.axion_application_schema_version() from public;
grant execute on function public.axion_application_schema_version() to anon, authenticated;

comment on function public.axion_application_schema_version() is
  'Non-sensitive application/schema compatibility revision expected by the Axion RC1 client.';
