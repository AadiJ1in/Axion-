-- Axion patient personalization and two-sided care-team verification.
-- Every public table is protected with RLS and explicitly exposed to authenticated users only.

alter table public.profiles
  add column if not exists onboarding_version integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists recovery_xp integer not null default 0 check (recovery_xp >= 0),
  add column if not exists level integer not null default 1 check (level between 1 and 100),
  add column if not exists streak_days integer not null default 0 check (streak_days >= 0),
  add column if not exists updated_at timestamptz not null default now();

alter table public.therapist_patients
  drop constraint if exists therapist_patients_status_check;

alter table public.therapist_patients
  add constraint therapist_patients_status_check
    check (status in ('invited', 'pending_verification', 'active', 'rejected', 'inactive')),
  add column if not exists patient_confirmed_at timestamptz,
  add column if not exists therapist_verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.care_invitations (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_email text not null check (patient_email = lower(trim(patient_email)) and char_length(patient_email) between 3 and 254),
  invite_code text not null unique check (invite_code = upper(trim(invite_code)) and char_length(invite_code) between 8 and 24),
  status text not null default 'sent' check (status in ('sent', 'claimed', 'approved', 'revoked', 'expired')),
  patient_id uuid references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  claimed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sent' and patient_id is null) or status <> 'sent')
);

alter table public.therapist_patients
  add column if not exists invitation_id uuid unique references public.care_invitations(id) on delete set null;

alter table public.exercise_plans
  add column if not exists program_label text not null default 'Personal recovery plan',
  add column if not exists phase_label text not null default 'Getting started',
  add column if not exists status text not null default 'active' check (status in ('draft', 'active', 'completed', 'archived')),
  add column if not exists updated_at timestamptz not null default now();

alter table public.exercise_assignments
  add column if not exists display_name text not null default 'Assigned exercise',
  add column if not exists sequence integer not null default 1 check (sequence between 1 and 100),
  add column if not exists tracking_mode text not null default 'pose_reps' check (tracking_mode in ('pose_reps', 'timed_hold', 'guided_reps')),
  add column if not exists duration_seconds integer check (duration_seconds between 5 and 3600),
  add column if not exists status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.roadmap_stages (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.exercise_plans(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 20),
  title text not null check (char_length(title) between 1 and 80),
  detail text,
  status text not null default 'locked' check (status in ('complete', 'current', 'locked')),
  unlock_after_sessions integer not null default 0 check (unlock_after_sessions >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, stage_number)
);

create unique index if not exists one_active_plan_per_patient
  on public.exercise_plans (patient_id)
  where status = 'active';
create index if not exists care_invitations_therapist_idx on public.care_invitations (therapist_id, status);
create index if not exists care_invitations_patient_idx on public.care_invitations (patient_id, status);
create index if not exists care_invitations_email_idx on public.care_invitations (patient_email, status);
create index if not exists therapist_patients_patient_status_idx on public.therapist_patients (patient_id, status);
create index if not exists exercise_plans_patient_status_idx on public.exercise_plans (patient_id, status);
create index if not exists exercise_assignments_plan_sequence_idx on public.exercise_assignments (plan_id, sequence);
create index if not exists roadmap_stages_plan_sequence_idx on public.roadmap_stages (plan_id, stage_number);
create index if not exists exercise_sessions_patient_created_idx on public.exercise_sessions (patient_id, created_at desc);

alter table public.care_invitations enable row level security;
alter table public.roadmap_stages enable row level security;

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id and role = 'patient')
  with check ((select auth.uid()) = id and role = 'patient');

drop policy if exists therapists_read_assigned_patients on public.profiles;
create policy therapists_read_assigned_patients on public.profiles for select to authenticated
  using (
    public.current_app_role() = 'therapist'
    and exists (
      select 1 from public.therapist_patients tp
      where tp.therapist_id = (select auth.uid())
        and tp.patient_id = profiles.id
        and tp.status in ('pending_verification', 'active')
    )
  );

drop policy if exists patients_read_connected_therapist on public.profiles;
create policy patients_read_connected_therapist on public.profiles for select to authenticated
  using (
    role = 'therapist'
    and exists (
      select 1 from public.therapist_patients tp
      where tp.patient_id = (select auth.uid())
        and tp.therapist_id = profiles.id
        and tp.status in ('pending_verification', 'active')
    )
  );

drop policy if exists therapists_read_own_invitations on public.care_invitations;
create policy therapists_read_own_invitations on public.care_invitations for select to authenticated
  using (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist');
drop policy if exists therapists_create_own_invitations on public.care_invitations;
create policy therapists_create_own_invitations on public.care_invitations for insert to authenticated
  with check (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist' and status = 'sent' and patient_id is null);
drop policy if exists therapists_update_own_invitations on public.care_invitations;
create policy therapists_update_own_invitations on public.care_invitations for update to authenticated
  using (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist')
  with check (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist');
drop policy if exists patients_read_email_invitations on public.care_invitations;
create policy patients_read_email_invitations on public.care_invitations for select to authenticated
  using (
    public.current_app_role() = 'patient'
    and (
      patient_id = (select auth.uid())
      or patient_email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    )
  );
drop policy if exists patients_claim_email_invitations on public.care_invitations;

drop policy if exists patients_read_own_relationship on public.therapist_patients;
create policy patients_read_own_relationship on public.therapist_patients for select to authenticated
  using (patient_id = (select auth.uid()) and public.current_app_role() = 'patient');
drop policy if exists patients_request_invited_relationship on public.therapist_patients;
create policy patients_request_invited_relationship on public.therapist_patients for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and public.current_app_role() = 'patient'
    and status = 'pending_verification'
    and patient_confirmed_at is not null
    and therapist_verified_at is null
    and exists (
      select 1 from public.care_invitations ci
      where ci.id = therapist_patients.invitation_id
        and ci.therapist_id = therapist_patients.therapist_id
        and ci.patient_email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
        and ci.status = 'sent'
        and ci.expires_at > now()
    )
  );
drop policy if exists therapists_update_own_relationships on public.therapist_patients;
create policy therapists_update_own_relationships on public.therapist_patients for update to authenticated
  using (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist')
  with check (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist');

drop policy if exists therapists_update_own_plans on public.exercise_plans;
create policy therapists_update_own_plans on public.exercise_plans for update to authenticated
  using (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist')
  with check (therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist');
drop policy if exists therapists_update_own_assignments on public.exercise_assignments;
create policy therapists_update_own_assignments on public.exercise_assignments for update to authenticated
  using (exists (select 1 from public.exercise_plans ep where ep.id = exercise_assignments.plan_id and ep.therapist_id = (select auth.uid())))
  with check (exists (select 1 from public.exercise_plans ep where ep.id = exercise_assignments.plan_id and ep.therapist_id = (select auth.uid())));

drop policy if exists patients_read_own_roadmap on public.roadmap_stages;
create policy patients_read_own_roadmap on public.roadmap_stages for select to authenticated
  using (exists (select 1 from public.exercise_plans ep where ep.id = roadmap_stages.plan_id and ep.patient_id = (select auth.uid())));
drop policy if exists therapists_read_own_roadmap on public.roadmap_stages;
create policy therapists_read_own_roadmap on public.roadmap_stages for select to authenticated
  using (exists (select 1 from public.exercise_plans ep where ep.id = roadmap_stages.plan_id and ep.therapist_id = (select auth.uid())));
drop policy if exists therapists_create_own_roadmap on public.roadmap_stages;
create policy therapists_create_own_roadmap on public.roadmap_stages for insert to authenticated
  with check (exists (select 1 from public.exercise_plans ep where ep.id = roadmap_stages.plan_id and ep.therapist_id = (select auth.uid()) and public.current_app_role() = 'therapist'));
drop policy if exists therapists_update_own_roadmap on public.roadmap_stages;
create policy therapists_update_own_roadmap on public.roadmap_stages for update to authenticated
  using (exists (select 1 from public.exercise_plans ep where ep.id = roadmap_stages.plan_id and ep.therapist_id = (select auth.uid())))
  with check (exists (select 1 from public.exercise_plans ep where ep.id = roadmap_stages.plan_id and ep.therapist_id = (select auth.uid())));

revoke all on table public.care_invitations from anon;
revoke all on table public.roadmap_stages from anon;
grant select, insert, update on table public.care_invitations to authenticated;
grant select, insert, update on table public.roadmap_stages to authenticated;
grant update (display_name, onboarding_version, onboarding_completed_at, updated_at) on table public.profiles to authenticated;
grant select, insert, update on table public.therapist_patients to authenticated;
grant select, insert, update on table public.exercise_plans to authenticated;
grant select, insert, update on table public.exercise_assignments to authenticated;
