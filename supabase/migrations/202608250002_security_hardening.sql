-- Keep trigger/helper functions out of the exposed API schema.
create schema if not exists private;
revoke all on schema private from public, anon;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.current_app_role() from public, anon, authenticated;

alter function public.handle_new_user() set schema private;
alter function public.rls_auto_enable() set schema private;
alter function public.current_app_role() set schema private;

grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;

create index if not exists exercise_plans_therapist_idx on public.exercise_plans (therapist_id);
create index if not exists exercise_sessions_assignment_idx on public.exercise_sessions (assignment_id);
create index if not exists rep_metrics_session_idx on public.rep_metrics (session_id);
create index if not exists therapist_notes_therapist_idx on public.therapist_notes (therapist_id);
create index if not exists therapist_notes_patient_idx on public.therapist_notes (patient_id);
create index if not exists therapist_notes_session_idx on public.therapist_notes (session_id);

