-- Durable clinician review receipts for Needs Attention.
-- A review receipt records that the treating therapist reviewed the current
-- patient context. It does not change prescriptions, roadmap state, rep counts,
-- or any patient-generated clinical/movement data.

create table if not exists public.therapist_patient_reviews (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  note text,
  snapshot jsonb not null default '{}'::jsonb,
  constraint therapist_patient_reviews_note_length
    check (note is null or char_length(note) <= 1000),
  constraint therapist_patient_reviews_snapshot_size
    check (octet_length(snapshot::text) <= 4096),
  constraint therapist_patient_reviews_not_self
    check (therapist_id <> patient_id)
);

create index if not exists therapist_patient_reviews_patient_time_idx
  on public.therapist_patient_reviews (therapist_id, patient_id, reviewed_at desc);

alter table public.therapist_patient_reviews enable row level security;

revoke all on public.therapist_patient_reviews from anon;
revoke all on public.therapist_patient_reviews from authenticated;
grant select, insert on public.therapist_patient_reviews to authenticated;

drop policy if exists therapist_patient_reviews_read_own on public.therapist_patient_reviews;
create policy therapist_patient_reviews_read_own
on public.therapist_patient_reviews
for select
to authenticated
using (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1
    from public.therapist_patients tp
    where tp.therapist_id = therapist_patient_reviews.therapist_id
      and tp.patient_id = therapist_patient_reviews.patient_id
      and tp.status = 'active'
  )
);

drop policy if exists therapist_patient_reviews_insert_own on public.therapist_patient_reviews;
create policy therapist_patient_reviews_insert_own
on public.therapist_patient_reviews
for insert
to authenticated
with check (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1
    from public.therapist_patients tp
    where tp.therapist_id = therapist_patient_reviews.therapist_id
      and tp.patient_id = therapist_patient_reviews.patient_id
      and tp.status = 'active'
  )
);

comment on table public.therapist_patient_reviews is
  'Append-only treating-therapist review receipts for patient attention/review workflow.';
comment on column public.therapist_patient_reviews.snapshot is
  'Small descriptive counts captured at review time; never a diagnosis or treatment decision.';
