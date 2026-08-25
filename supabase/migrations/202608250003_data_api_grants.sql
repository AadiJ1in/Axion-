-- Explicit Data API privileges. RLS controls rows; these grants control available operations.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.therapist_patients from anon, authenticated;
revoke all on table public.care_invitations from anon, authenticated;
revoke all on table public.exercise_plans from anon, authenticated;
revoke all on table public.exercise_assignments from anon, authenticated;
revoke all on table public.exercise_sessions from anon, authenticated;
revoke all on table public.rep_metrics from anon, authenticated;
revoke all on table public.therapist_notes from anon, authenticated;
revoke all on table public.roadmap_stages from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, onboarding_version, onboarding_completed_at, updated_at) on table public.profiles to authenticated;

grant select, insert, update on table public.therapist_patients to authenticated;
grant select, insert, update on table public.care_invitations to authenticated;
grant select, insert, update on table public.exercise_plans to authenticated;
grant select, insert, update on table public.exercise_assignments to authenticated;
grant select, insert on table public.exercise_sessions to authenticated;
grant select, insert on table public.rep_metrics to authenticated;
grant select, insert on table public.therapist_notes to authenticated;
grant select, insert, update on table public.roadmap_stages to authenticated;
