-- Clinical evaluation results are append-only browser submissions performed by
-- an authenticated therapist for an actively connected patient. Raw video,
-- images and pose landmarks do not belong in this table; result contains only
-- derived assessment outcomes / kinematic summaries.

create table if not exists public.clinical_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  therapist_id uuid not null references public.profiles(id) on delete restrict,
  evaluation_type text not null check (evaluation_type in (
    'tug',
    'chair_stand_30s',
    'four_stage_balance',
    'single_leg_stance',
    'single_leg_squat'
  )),
  protocol_version smallint not null default 1 check (protocol_version > 0),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  capture_context jsonb not null default '{}'::jsonb check (jsonb_typeof(capture_context) = 'object'),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists clinical_evaluation_results_patient_time_idx
  on public.clinical_evaluation_results(patient_id, completed_at desc);
create index if not exists clinical_evaluation_results_patient_type_time_idx
  on public.clinical_evaluation_results(patient_id, evaluation_type, completed_at desc);
create index if not exists clinical_evaluation_results_therapist_idx
  on public.clinical_evaluation_results(therapist_id, completed_at desc);

alter table public.clinical_evaluation_results enable row level security;

revoke all on table public.clinical_evaluation_results from anon, authenticated;
grant select, insert on table public.clinical_evaluation_results to authenticated;

drop policy if exists clinical_evaluation_results_read_authorized
  on public.clinical_evaluation_results;
create policy clinical_evaluation_results_read_authorized
on public.clinical_evaluation_results
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
        and tp.patient_id = clinical_evaluation_results.patient_id
        and tp.status = 'active'
    )
  )
);

drop policy if exists clinical_evaluation_results_insert_therapist
  on public.clinical_evaluation_results;
create policy clinical_evaluation_results_insert_therapist
on public.clinical_evaluation_results
for insert
to authenticated
with check (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::app_role
  and exists (
    select 1
    from public.therapist_patients tp
    where tp.therapist_id = (select auth.uid())
      and tp.patient_id = clinical_evaluation_results.patient_id
      and tp.status = 'active'
  )
);
