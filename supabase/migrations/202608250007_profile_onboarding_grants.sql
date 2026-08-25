-- Let patients finish onboarding without granting profile-wide UPDATE access.

revoke update on table public.profiles from authenticated;
grant update (display_name, onboarding_version, onboarding_completed_at, updated_at)
on table public.profiles to authenticated;

