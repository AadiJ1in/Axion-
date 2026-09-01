-- Append-only patient safety reporting with therapist-scoped alerts.

create table public.patient_safety_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  assignment_id uuid not null references public.exercise_assignments(id) on delete restrict,
  session_id uuid references public.exercise_sessions(id) on delete set null,
  client_session_id uuid not null,
  exercise_key text not null check (char_length(exercise_key) between 1 and 120),
  set_number smallint check (set_number between 1 and 20),
  rep_number integer check (rep_number >= 0 and rep_number <= 1000),
  event_type text not null check (event_type in ('pain', 'felt_wrong', 'felt_different')),
  pain_score smallint check (pain_score between 0 and 10),
  comment text check (char_length(comment) <= 1000),
  paused_session boolean not null default true,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint patient_safety_events_pain_score_required
    check (event_type <> 'pain' or pain_score is not null)
);

create index patient_safety_events_patient_created_idx
  on public.patient_safety_events (patient_id, created_at desc);
create index patient_safety_events_client_session_idx
  on public.patient_safety_events (patient_id, client_session_id);
create index patient_safety_events_assignment_idx
  on public.patient_safety_events (assignment_id, created_at desc);

create table if not exists public.therapist_alerts (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  alert_type text not null check (alert_type in ('adherence_change', 'movement_change', 'patient_report')),
  title text not null check (char_length(title) between 1 and 160),
  explanation text not null check (char_length(explanation) between 1 and 800),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists alerts_therapist_status_created_idx
  on public.therapist_alerts (therapist_id, status, created_at desc);

alter table public.patient_safety_events enable row level security;
alter table public.therapist_alerts enable row level security;

create policy patient_safety_events_read_participant
on public.patient_safety_events for select to authenticated
using (
  patient_id = (select auth.uid())
  or exists (
    select 1 from public.therapist_patients tp
    where tp.patient_id = patient_safety_events.patient_id
      and tp.therapist_id = (select auth.uid())
      and tp.status = 'active'
      and (select private.current_app_role()) = 'therapist'::public.app_role
  )
);

create policy patient_safety_events_insert_own_assignment
on public.patient_safety_events for insert to authenticated
with check (
  patient_id = (select auth.uid())
  and (select private.current_app_role()) = 'patient'::public.app_role
  and paused_session = true
  and session_id is null
  and exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = patient_safety_events.assignment_id
      and ea.exercise_key = patient_safety_events.exercise_key
      and ea.status = 'active'
      and ep.patient_id = patient_safety_events.patient_id
      and ep.status = 'active'
  )
);

create policy therapist_alerts_read_own_active_patient
on public.therapist_alerts for select to authenticated
using (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = therapist_alerts.therapist_id
      and tp.patient_id = therapist_alerts.patient_id
      and tp.status = 'active'
  )
);

create policy therapist_alerts_update_own_active_patient
on public.therapist_alerts for update to authenticated
using (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = therapist_alerts.therapist_id
      and tp.patient_id = therapist_alerts.patient_id
      and tp.status = 'active'
  )
)
with check (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and status in ('open', 'reviewed', 'dismissed')
);

create or replace function private.notify_therapists_of_safety_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_therapist_id uuid;
  v_label text;
begin
  v_label := case new.event_type
    when 'pain' then 'Pain reported'
    when 'felt_wrong' then 'Movement felt wrong'
    else 'Movement felt different'
  end;

  for v_therapist_id in
    select tp.therapist_id
    from public.therapist_patients tp
    where tp.patient_id = new.patient_id and tp.status = 'active'
  loop
    insert into public.therapist_alerts (
      therapist_id, patient_id, alert_type, title, explanation
    ) values (
      v_therapist_id,
      new.patient_id,
      'patient_report',
      v_label,
      v_label || ' during ' || replace(new.exercise_key, '_', ' ')
        || coalesce(' at rep ' || new.rep_number::text, '') || '. Review the patient report before changing the plan.'
    );
  end loop;

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    new.patient_id,
    'patient_safety_event_recorded',
    'patient_safety_event',
    new.id::text,
    jsonb_build_object(
      'event_type', new.event_type,
      'pain_score', new.pain_score,
      'set_number', new.set_number,
      'rep_number', new.rep_number,
      'client_session_id', new.client_session_id
    )
  );
  return new;
end;
$$;

revoke all on function private.notify_therapists_of_safety_event() from public, anon, authenticated;

create trigger patient_safety_event_notify_therapist
after insert on public.patient_safety_events
for each row execute function private.notify_therapists_of_safety_event();

revoke all on table public.patient_safety_events from public, anon, authenticated;
grant select, insert on table public.patient_safety_events to authenticated;

revoke all on table public.therapist_alerts from public, anon, authenticated;
grant select on table public.therapist_alerts to authenticated;
grant update (status, reviewed_at) on table public.therapist_alerts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'patient_safety_events'
  ) then
    alter publication supabase_realtime add table public.patient_safety_events;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'therapist_alerts'
  ) then
    alter publication supabase_realtime add table public.therapist_alerts;
  end if;
end;
$$;
