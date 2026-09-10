-- Therapist-defined review targets are deliberately separate from Axion's
-- calibration-relative rep detector. They support clinician review only and
-- never create, reject, or remove a clinical repetition.

create table if not exists public.assignment_clinical_review_targets (
  assignment_id uuid primary key references public.exercise_assignments(id) on delete cascade,
  range_unit text check (range_unit is null or range_unit in ('deg','percent')),
  target_range_min numeric,
  target_range_max numeric,
  target_tempo_min_seconds numeric,
  target_tempo_max_seconds numeric,
  target_difficulty_max smallint,
  pain_review_threshold smallint,
  notes text,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint assignment_review_target_range_values check (
    (target_range_min is null or target_range_min >= 0)
    and (target_range_max is null or target_range_max >= 0)
    and (target_range_min is null or target_range_max is null or target_range_min <= target_range_max)
    and (range_unit <> 'percent' or coalesce(target_range_max, target_range_min, 0) <= 100)
    and (range_unit <> 'deg' or coalesce(target_range_max, target_range_min, 0) <= 180)
  ),
  constraint assignment_review_target_tempo_values check (
    (target_tempo_min_seconds is null or target_tempo_min_seconds between 0.2 and 120)
    and (target_tempo_max_seconds is null or target_tempo_max_seconds between 0.2 and 120)
    and (target_tempo_min_seconds is null or target_tempo_max_seconds is null or target_tempo_min_seconds <= target_tempo_max_seconds)
  ),
  constraint assignment_review_target_difficulty check (
    target_difficulty_max is null or target_difficulty_max between 1 and 5
  ),
  constraint assignment_review_target_pain check (
    pain_review_threshold is null or pain_review_threshold between 0 and 10
  ),
  constraint assignment_review_target_notes check (
    notes is null or char_length(notes) <= 1000
  )
);

create index if not exists assignment_clinical_review_targets_updated_idx
  on public.assignment_clinical_review_targets (updated_at desc);

alter table public.assignment_clinical_review_targets enable row level security;

revoke all on table public.assignment_clinical_review_targets from public, anon, authenticated;
grant select, insert, update, delete on table public.assignment_clinical_review_targets to authenticated;

create policy assignment_review_targets_read_participant
on public.assignment_clinical_review_targets
for select
to authenticated
using (
  exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = assignment_clinical_review_targets.assignment_id
      and (ep.patient_id = (select auth.uid()) or ep.therapist_id = (select auth.uid()))
  )
);

create policy assignment_review_targets_insert_therapist
on public.assignment_clinical_review_targets
for insert
to authenticated
with check (
  updated_by = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = assignment_clinical_review_targets.assignment_id
      and ep.therapist_id = (select auth.uid())
  )
);

create policy assignment_review_targets_update_therapist
on public.assignment_clinical_review_targets
for update
to authenticated
using (
  (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = assignment_clinical_review_targets.assignment_id
      and ep.therapist_id = (select auth.uid())
  )
)
with check (
  updated_by = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = assignment_clinical_review_targets.assignment_id
      and ep.therapist_id = (select auth.uid())
  )
);

create policy assignment_review_targets_delete_therapist
on public.assignment_clinical_review_targets
for delete
to authenticated
using (
  (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = assignment_clinical_review_targets.assignment_id
      and ep.therapist_id = (select auth.uid())
  )
);
