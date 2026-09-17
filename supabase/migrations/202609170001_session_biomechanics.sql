begin;

create table if not exists public.session_biomechanics (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.exercise_sessions(id) on delete cascade,
  exercise_key text not null,
  occurred_at timestamptz not null,
  metric_key text not null,
  region text not null,
  side text not null default 'unspecified',
  value numeric not null,
  unit text,
  quality numeric not null default 1,
  source text not null default 'pose_session_aggregate',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint session_biomechanics_metric_key_check check (char_length(metric_key) between 1 and 80),
  constraint session_biomechanics_region_check check (char_length(region) between 1 and 40),
  constraint session_biomechanics_side_check check (side in ('left', 'right', 'midline', 'bilateral', 'unspecified')),
  constraint session_biomechanics_unit_check check (unit is null or char_length(unit) <= 24),
  constraint session_biomechanics_quality_check check (quality >= 0 and quality <= 1),
  constraint session_biomechanics_source_check check (char_length(source) between 1 and 64),
  constraint session_biomechanics_context_object_check check (jsonb_typeof(context) = 'object'),
  constraint session_biomechanics_context_size_check check (octet_length(context::text) <= 4096),
  constraint session_biomechanics_session_metric_unique unique (session_id, metric_key, region, side)
);

create index if not exists session_biomechanics_patient_time_idx
  on public.session_biomechanics (patient_id, occurred_at desc);

create index if not exists session_biomechanics_session_idx
  on public.session_biomechanics (session_id);

create index if not exists session_biomechanics_patient_metric_idx
  on public.session_biomechanics (patient_id, metric_key, region, side, occurred_at desc);

alter table public.session_biomechanics enable row level security;

revoke all on table public.session_biomechanics from anon;
revoke all on table public.session_biomechanics from authenticated;
grant select, insert on table public.session_biomechanics to authenticated;
grant select, insert, update, delete on table public.session_biomechanics to service_role;
grant usage, select on sequence public.session_biomechanics_id_seq to authenticated, service_role;

create policy session_biomechanics_read_authorized
  on public.session_biomechanics
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
          and tp.patient_id = session_biomechanics.patient_id
          and tp.status = 'active'
      )
    )
  );

create policy session_biomechanics_insert_session_owner
  on public.session_biomechanics
  for insert
  to authenticated
  with check (
    patient_id = (select auth.uid())
    and (select private.current_app_role()) = 'patient'::app_role
    and exists (
      select 1
      from public.exercise_sessions es
      where es.id = session_biomechanics.session_id
        and es.patient_id = (select auth.uid())
        and es.exercise_key = session_biomechanics.exercise_key
    )
  );

commit;
