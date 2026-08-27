-- Stream only patient roadmap tables through Supabase Postgres Changes.
-- Existing RLS policies remain the authorization boundary for every event.

do $$
declare
  roadmap_table text;
begin
  foreach roadmap_table in array array[
    'therapist_patients',
    'exercise_plans',
    'exercise_assignments',
    'roadmap_stages',
    'exercise_sessions'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = roadmap_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', roadmap_table);
    end if;
  end loop;
end
$$;
