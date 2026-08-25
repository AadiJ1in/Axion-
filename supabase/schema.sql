-- AXION NONCLINICAL MVP
-- Canonical schema for a new Supabase project. Use synthetic/nonclinical data only.

create type public.app_role as enum ('patient', 'therapist');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role public.app_role not null default 'patient',
  created_at timestamptz not null default now()
);

create table public.therapist_patients (
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'discharged')),
  assigned_at timestamptz not null default now(),
  primary key (therapist_id, patient_id),
  check (therapist_id <> patient_id)
);

create table public.recovery_plans (
  id bigint generated always as identity primary key,
  therapist_id uuid not null references public.profiles(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  stage text not null default 'foundation' check (stage in ('foundation', 'control', 'strength', 'balance', 'return')),
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'archived')),
  target_sessions_per_week smallint not null default 3 check (target_sessions_per_week between 1 and 14),
  started_on date not null default current_date,
  updated_at timestamptz not null default now()
);

create table public.exercise_prescriptions (
  id bigint generated always as identity primary key,
  plan_id bigint references public.recovery_plans(id) on delete cascade,
  therapist_id uuid not null references public.profiles(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  exercise_key text not null check (exercise_key in ('bodyweight_squat_poc', 'wall_sit', 'heel_raise', 'single_leg_balance', 'step_down', 'shoulder_flexion')),
  sets smallint not null default 3 check (sets between 1 and 8),
  target_reps smallint check (target_reps between 1 and 50),
  hold_seconds smallint check (hold_seconds between 5 and 300),
  position smallint not null default 1 check (position between 1 and 50),
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'archived')),
  therapist_note text check (char_length(therapist_note) <= 500),
  prescribed_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (target_reps is not null or hold_seconds is not null)
);

create table public.exercise_sessions (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  prescription_id bigint references public.exercise_prescriptions(id) on delete set null,
  client_session_id uuid,
  exercise_key text not null check (exercise_key in ('bodyweight_squat_poc', 'wall_sit', 'heel_raise', 'single_leg_balance', 'step_down', 'shoulder_flexion')),
  repetitions integer not null check (repetitions between 0 and 500),
  source text check (source = 'mediapipe_browser_poc'),
  duration_seconds integer check (duration_seconds between 0 and 14400),
  quality_score smallint check (quality_score between 0 and 100),
  movement_summary jsonb not null default '{}'::jsonb,
  difficulty smallint check (difficulty between 1 and 5),
  discomfort text check (discomfort in ('none', 'mild', 'moderate', 'stop')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.patient_checkins (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  session_id bigint references public.exercise_sessions(id) on delete set null,
  difficulty smallint not null check (difficulty between 1 and 5),
  discomfort text not null check (discomfort in ('none', 'mild', 'moderate', 'stop')),
  confidence smallint check (confidence between 1 and 5),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create unique index exercise_sessions_patient_client_session_uidx
  on public.exercise_sessions (patient_id, client_session_id)
  where client_session_id is not null;

create table public.therapist_alerts (
  id bigint generated always as identity primary key,
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null check (alert_type in ('adherence_change', 'movement_change', 'patient_report')),
  title text not null check (char_length(title) between 1 and 160),
  explanation text not null check (char_length(explanation) between 1 and 800),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Axion Patient'), 'patient');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid(); $$;

create or replace function public.is_assigned_therapist(target_patient uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.therapist_patients
    where therapist_id = auth.uid() and patient_id = target_patient and status = 'active'
  );
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_assigned_therapist(uuid) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_assigned_therapist(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.therapist_patients enable row level security;
alter table public.recovery_plans enable row level security;
alter table public.exercise_prescriptions enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.patient_checkins enable row level security;
alter table public.therapist_alerts enable row level security;

create policy "profiles_read_self" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_read_assigned" on public.profiles for select to authenticated using (public.is_assigned_therapist(id));
create policy "assignments_read_participant" on public.therapist_patients for select to authenticated using (therapist_id = auth.uid() or patient_id = auth.uid());
create policy "assignments_manage_therapist" on public.therapist_patients for all to authenticated using (therapist_id = auth.uid() and public.current_app_role() = 'therapist') with check (therapist_id = auth.uid() and public.current_app_role() = 'therapist');
create policy "plans_read_patient" on public.recovery_plans for select to authenticated using (patient_id = auth.uid());
create policy "plans_manage_therapist" on public.recovery_plans for all to authenticated using (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id)) with check (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id));
create policy "prescriptions_read_patient" on public.exercise_prescriptions for select to authenticated using (patient_id = auth.uid());
create policy "prescriptions_manage_therapist" on public.exercise_prescriptions for all to authenticated using (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id)) with check (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id));
create policy "prescriptions_complete_patient" on public.exercise_prescriptions for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid() and status = 'completed');
create policy "sessions_insert_self" on public.exercise_sessions for insert to authenticated with check (patient_id = auth.uid() and public.current_app_role() = 'patient');
create policy "sessions_read_self" on public.exercise_sessions for select to authenticated using (patient_id = auth.uid());
create policy "sessions_read_assigned" on public.exercise_sessions for select to authenticated using (public.is_assigned_therapist(patient_id));
create policy "checkins_insert_self" on public.patient_checkins for insert to authenticated with check (patient_id = auth.uid());
create policy "checkins_read_self" on public.patient_checkins for select to authenticated using (patient_id = auth.uid());
create policy "checkins_read_assigned" on public.patient_checkins for select to authenticated using (public.is_assigned_therapist(patient_id));
create policy "alerts_read_assigned_therapist" on public.therapist_alerts for select to authenticated using (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id));
create policy "alerts_update_assigned_therapist" on public.therapist_alerts for update to authenticated using (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id)) with check (therapist_id = auth.uid() and public.is_assigned_therapist(patient_id));

revoke all on all tables in schema public from anon;
grant select on public.profiles, public.therapist_patients, public.recovery_plans, public.exercise_prescriptions, public.exercise_sessions, public.patient_checkins, public.therapist_alerts to authenticated;
grant insert on public.exercise_sessions, public.patient_checkins to authenticated;
grant insert, update on public.therapist_patients, public.recovery_plans, public.exercise_prescriptions, public.therapist_alerts to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Promote therapists only through a trusted administrative channel:
-- update public.profiles set role = 'therapist'
-- where id = (select id from auth.users where email = 'therapist@example.com');
