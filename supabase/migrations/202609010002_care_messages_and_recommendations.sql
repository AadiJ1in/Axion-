-- RLS-protected care-team messaging and therapist-reviewed recommendations.
-- Recommendations are descriptive review cues only and never mutate prescriptions.

create table public.care_messages (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid references public.exercise_plans(id) on delete set null,
  assignment_id uuid references public.exercise_assignments(id) on delete set null,
  session_id uuid references public.exercise_sessions(id) on delete set null,
  client_message_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint care_messages_sender_is_participant
    check (sender_id = therapist_id or sender_id = patient_id),
  constraint care_messages_client_id_unique
    unique (sender_id, client_message_id)
);

create index care_messages_therapist_created_idx
  on public.care_messages (therapist_id, created_at desc);
create index care_messages_patient_created_idx
  on public.care_messages (patient_id, created_at desc);
create index care_messages_plan_idx on public.care_messages (plan_id) where plan_id is not null;
create index care_messages_assignment_idx on public.care_messages (assignment_id) where assignment_id is not null;
create index care_messages_session_idx on public.care_messages (session_id) where session_id is not null;

create table public.clinician_recommendations (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  exercise_key text check (exercise_key is null or char_length(exercise_key) between 1 and 120),
  recommendation_type text not null check (recommendation_type in ('repeated_patient_report', 'adherence_review', 'movement_review')),
  title text not null check (char_length(title) between 1 and 160),
  summary text not null check (char_length(summary) between 1 and 1000),
  evidence jsonb not null default '{}'::jsonb,
  proposed_action jsonb not null default '{}'::jsonb,
  generated_by text not null default 'rules_v1' check (generated_by in ('rules_v1')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'modified', 'rejected')),
  clinician_response text check (clinician_response is null or char_length(clinician_response) <= 2000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index clinician_recommendations_therapist_status_idx
  on public.clinician_recommendations (therapist_id, status, created_at desc);
create index clinician_recommendations_patient_idx
  on public.clinician_recommendations (patient_id, created_at desc);
create unique index clinician_recommendations_pending_report_idx
  on public.clinician_recommendations (therapist_id, patient_id, exercise_key, recommendation_type)
  where status = 'pending';

alter table public.care_messages enable row level security;
alter table public.clinician_recommendations enable row level security;

create policy care_messages_read_active_participant
on public.care_messages for select to authenticated
using (
  ((select auth.uid()) = patient_id or (select auth.uid()) = therapist_id)
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = care_messages.therapist_id
      and tp.patient_id = care_messages.patient_id
      and tp.status = 'active'
  )
);

create policy care_messages_insert_active_participant
on public.care_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (sender_id = patient_id and (select private.current_app_role()) = 'patient'::public.app_role)
    or (sender_id = therapist_id and (select private.current_app_role()) = 'therapist'::public.app_role)
  )
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = care_messages.therapist_id
      and tp.patient_id = care_messages.patient_id
      and tp.status = 'active'
  )
  and (
    plan_id is null or exists (
      select 1 from public.exercise_plans ep
      where ep.id = care_messages.plan_id
        and ep.therapist_id = care_messages.therapist_id
        and ep.patient_id = care_messages.patient_id
    )
  )
  and (
    assignment_id is null or exists (
      select 1 from public.exercise_assignments ea
      join public.exercise_plans ep on ep.id = ea.plan_id
      where ea.id = care_messages.assignment_id
        and ep.therapist_id = care_messages.therapist_id
        and ep.patient_id = care_messages.patient_id
        and (care_messages.plan_id is null or ep.id = care_messages.plan_id)
    )
  )
  and (
    session_id is null or exists (
      select 1 from public.exercise_sessions es
      where es.id = care_messages.session_id
        and es.patient_id = care_messages.patient_id
        and (care_messages.assignment_id is null or es.assignment_id = care_messages.assignment_id)
    )
  )
);

create policy care_messages_recipient_marks_read
on public.care_messages for update to authenticated
using (
  (select auth.uid()) <> sender_id
  and ((select auth.uid()) = patient_id or (select auth.uid()) = therapist_id)
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = care_messages.therapist_id
      and tp.patient_id = care_messages.patient_id
      and tp.status = 'active'
  )
)
with check (
  (select auth.uid()) <> sender_id
  and ((select auth.uid()) = patient_id or (select auth.uid()) = therapist_id)
  and read_at is not null
);

create policy clinician_recommendations_therapist_read
on public.clinician_recommendations for select to authenticated
using (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = clinician_recommendations.therapist_id
      and tp.patient_id = clinician_recommendations.patient_id
      and tp.status = 'active'
  )
);

create policy clinician_recommendations_therapist_review
on public.clinician_recommendations for update to authenticated
using (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = clinician_recommendations.therapist_id
      and tp.patient_id = clinician_recommendations.patient_id
      and tp.status = 'active'
  )
)
with check (
  therapist_id = (select auth.uid())
  and status in ('accepted', 'modified', 'rejected')
  and reviewed_at is not null
);

create or replace function private.audit_care_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    new.sender_id,
    'care_message_sent',
    'care_message',
    new.id::text,
    jsonb_build_object(
      'therapist_id', new.therapist_id,
      'patient_id', new.patient_id,
      'plan_id', new.plan_id,
      'assignment_id', new.assignment_id,
      'session_id', new.session_id
    )
  );
  return new;
end;
$$;

create or replace function private.create_repeated_report_recommendation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_therapist_id uuid;
  v_report_count integer;
begin
  select count(*) into v_report_count
  from public.patient_safety_events pse
  where pse.patient_id = new.patient_id
    and pse.exercise_key = new.exercise_key
    and pse.occurred_at >= now() - interval '30 days';

  if v_report_count < 3 then
    return new;
  end if;

  for v_therapist_id in
    select tp.therapist_id
    from public.therapist_patients tp
    where tp.patient_id = new.patient_id and tp.status = 'active'
  loop
    insert into public.clinician_recommendations (
      therapist_id,
      patient_id,
      exercise_key,
      recommendation_type,
      title,
      summary,
      evidence,
      proposed_action
    ) values (
      v_therapist_id,
      new.patient_id,
      new.exercise_key,
      'repeated_patient_report',
      'Review repeated patient reports',
      'The patient submitted three or more safety reports for this exercise in the past 30 days. Review the reports and contact the patient before deciding whether the plan needs an update.',
      jsonb_build_object('report_count_30d', v_report_count, 'latest_event_type', new.event_type),
      jsonb_build_object('action', 'review_plan_with_patient', 'automatic_plan_change', false)
    )
    on conflict (therapist_id, patient_id, exercise_key, recommendation_type)
      where status = 'pending'
    do update set
      evidence = excluded.evidence,
      summary = excluded.summary,
      updated_at = now();
  end loop;
  return new;
end;
$$;

create or replace function private.audit_recommendation_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status or old.clinician_response is distinct from new.clinician_response then
    insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
    values (
      auth.uid(),
      'clinician_recommendation_reviewed',
      'clinician_recommendation',
      new.id::text,
      jsonb_build_object(
        'previous_status', old.status,
        'new_status', new.status,
        'patient_id', new.patient_id,
        'exercise_key', new.exercise_key,
        'response_recorded', new.clinician_response is not null
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_care_message() from public, anon, authenticated;
revoke all on function private.create_repeated_report_recommendation() from public, anon, authenticated;
revoke all on function private.audit_recommendation_review() from public, anon, authenticated;

create trigger care_message_audit
after insert on public.care_messages
for each row execute function private.audit_care_message();

create trigger patient_safety_event_recommendation
after insert on public.patient_safety_events
for each row execute function private.create_repeated_report_recommendation();

create trigger clinician_recommendation_audit
after update on public.clinician_recommendations
for each row execute function private.audit_recommendation_review();

revoke all on table public.care_messages from public, anon, authenticated;
grant select, insert on table public.care_messages to authenticated;
grant update (read_at) on table public.care_messages to authenticated;

revoke all on table public.clinician_recommendations from public, anon, authenticated;
grant select on table public.clinician_recommendations to authenticated;
grant update (status, clinician_response, reviewed_at, updated_at) on table public.clinician_recommendations to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'care_messages'
  ) then
    alter publication supabase_realtime add table public.care_messages;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clinician_recommendations'
  ) then
    alter publication supabase_realtime add table public.clinician_recommendations;
  end if;
end;
$$;
