-- Persist patient-reported before/after context and attempted-rep coverage for new sessions.
-- This table is deliberately separate from measured movement data so patient reports
-- never become camera-derived clinical conclusions.

create table if not exists public.session_capture_context (
  session_id uuid primary key references public.exercise_sessions(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid not null references public.exercise_assignments(id) on delete restrict,
  pain_before smallint check (pain_before is null or pain_before between 0 and 10),
  pain_after smallint check (pain_after is null or pain_after between 0 and 10),
  confidence_before smallint check (confidence_before is null or confidence_before between 1 and 5),
  confidence_after smallint check (confidence_after is null or confidence_after between 1 and 5),
  attempted_reps integer not null default 0 check (attempted_reps between 0 and 1000),
  rejected_reps integer not null default 0 check (rejected_reps between 0 and attempted_reps),
  rejected_reasons jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rejected_reasons) = 'object' and octet_length(rejected_reasons::text) <= 4096),
  created_at timestamptz not null default now()
);

create index if not exists session_capture_context_patient_idx
  on public.session_capture_context (patient_id, created_at desc);
create index if not exists session_capture_context_assignment_idx
  on public.session_capture_context (assignment_id, created_at desc);

-- A validated repetition has one durable metric row. This also makes retrying a
-- client-side persistence request idempotent without duplicating rep history.
create unique index if not exists rep_metrics_session_rep_unique
  on public.rep_metrics (session_id, rep_number);

alter table public.session_capture_context enable row level security;

revoke all on table public.session_capture_context from public, anon, authenticated;
grant select, insert on table public.session_capture_context to authenticated;

create policy session_capture_context_read_authorized
on public.session_capture_context
for select
to authenticated
using (
  patient_id = (select auth.uid())
  or (
    (select private.current_app_role()) = 'therapist'::public.app_role
    and exists (
      select 1
      from public.therapist_patients tp
      where tp.therapist_id = (select auth.uid())
        and tp.patient_id = session_capture_context.patient_id
        and tp.status = 'active'
    )
  )
);

create policy session_capture_context_insert_patient
on public.session_capture_context
for insert
to authenticated
with check (
  patient_id = (select auth.uid())
  and (select private.current_app_role()) = 'patient'::public.app_role
  and exists (
    select 1
    from public.exercise_sessions es
    where es.id = session_capture_context.session_id
      and es.patient_id = (select auth.uid())
      and es.assignment_id = session_capture_context.assignment_id
  )
);
