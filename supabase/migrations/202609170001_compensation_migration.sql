create table if not exists public.movement_biomechanics_sessions (
  session_id uuid primary key references public.exercise_sessions(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid not null references public.exercise_assignments(id),
  exercise_key text not null check (char_length(exercise_key) between 1 and 120),
  prescribed_side text not null default 'either' check (prescribed_side = any (array['either'::text, 'left'::text, 'right'::text])),
  feature_schema_version smallint not null default 1 check (feature_schema_version between 1 and 100),
  analysis_version smallint not null default 1 check (analysis_version between 1 and 100),
  sample_count integer not null default 0 check (sample_count between 0 and 100000),
  rep_count integer not null default 0 check (rep_count between 0 and 1000),
  tracking_quality numeric(5,4) null check (tracking_quality is null or (tracking_quality >= 0 and tracking_quality <= 1)),
  primary_movement_range numeric null check (primary_movement_range is null or (primary_movement_range >= -10000 and primary_movement_range <= 10000)),
  primary_symmetry_delta numeric null check (primary_symmetry_delta is null or (primary_symmetry_delta >= 0 and primary_symmetry_delta <= 10000)),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'::text and octet_length(features::text) <= 24576),
  compensation_analysis jsonb not null default '{}'::jsonb check (jsonb_typeof(compensation_analysis) = 'object'::text and octet_length(compensation_analysis::text) <= 16384),
  created_at timestamptz not null default now()
);

comment on table public.movement_biomechanics_sessions is
  'Privacy-minimized, pose-derived session summaries for longitudinal movement redistribution review. Stores numeric summaries only; no raw video or images.';
comment on column public.movement_biomechanics_sessions.compensation_analysis is
  'Descriptive rules-based movement redistribution analysis for clinician review; not a diagnosis or injury prediction.';

create index if not exists movement_biomechanics_patient_created_idx
  on public.movement_biomechanics_sessions(patient_id, created_at desc);
create index if not exists movement_biomechanics_patient_exercise_idx
  on public.movement_biomechanics_sessions(patient_id, exercise_key, created_at desc);

alter table public.movement_biomechanics_sessions enable row level security;

revoke all on table public.movement_biomechanics_sessions from anon;
revoke all on table public.movement_biomechanics_sessions from authenticated;
grant select, insert on table public.movement_biomechanics_sessions to authenticated;

drop policy if exists movement_biomechanics_insert_patient on public.movement_biomechanics_sessions;
create policy movement_biomechanics_insert_patient
on public.movement_biomechanics_sessions
for insert
to authenticated
with check (
  patient_id = (select auth.uid())
  and (select private.current_app_role()) = 'patient'::app_role
  and exists (
    select 1
    from public.exercise_sessions es
    where es.id = movement_biomechanics_sessions.session_id
      and es.patient_id = (select auth.uid())
      and es.assignment_id = movement_biomechanics_sessions.assignment_id
      and es.exercise_key = movement_biomechanics_sessions.exercise_key
  )
);

drop policy if exists movement_biomechanics_read_authorized on public.movement_biomechanics_sessions;
create policy movement_biomechanics_read_authorized
on public.movement_biomechanics_sessions
for select
to authenticated
using (
  patient_id = (select auth.uid())
  or (
    (select private.current_app_role()) = 'therapist'::app_role
    and exists (
      select 1
      from public.therapist_patients tp
      where tp.therapist_id = (select auth.uid())
        and tp.patient_id = movement_biomechanics_sessions.patient_id
        and tp.status = 'active'::text
    )
  )
);
