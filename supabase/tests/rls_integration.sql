-- Production-safe authorization integration test.
-- All fixtures are synthetic and the transaction is always rolled back.

begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
(
  '10000000-0000-4000-8000-000000000001'::uuid, 'authenticated', 'authenticated',
  'security-therapist@axion.invalid', '', now(), '{}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  '10000000-0000-4000-8000-000000000002'::uuid, 'authenticated', 'authenticated',
  'security-patient-a@axion.invalid', '', now(), '{}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', ''
),
(
  '10000000-0000-4000-8000-000000000003'::uuid, 'authenticated', 'authenticated',
  'security-patient-b@axion.invalid', '', now(), '{}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', ''
);

-- Therapist elevation is an administrative action, never a self-selected signup field.
update public.profiles
set role = 'therapist'::public.app_role
where id = '10000000-0000-4000-8000-000000000001'::uuid;

insert into public.therapist_patients (
  therapist_id, patient_id, status, patient_confirmed_at, therapist_verified_at
) values (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid,
  'active', now(), now()
);

-- Therapist publishes Patient A's plan and creates Patient B's one-time invitation.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000001',
  'email','security-therapist@axion.invalid', 'role','authenticated'
)::text, true);
set local role authenticated;

select set_config('axion.plan_a', public.publish_patient_plan(
  '10000000-0000-4000-8000-000000000002'::uuid,
  'Patient A secure plan', 'ACL recovery', 'Phase 1',
  'Patient A only instructions', array['bodyweight_squat']::text[], 3, 8, 45
)::text, true);

select set_config('axion.assignment_a', ea.id::text, true)
from public.exercise_assignments ea
where ea.plan_id = current_setting('axion.plan_a')::uuid
limit 1;

select set_config('axion.invite_code', ci.invite_code, true)
from public.create_care_invitation('security-patient-b@axion.invalid') ci;

-- Patient B claims the code; therapist verification must remain pending.
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000003',
  'email','security-patient-b@axion.invalid', 'role','authenticated'
)::text, true);
set local role authenticated;

update public.profiles
set display_name = 'Security Patient B',
    onboarding_version = 1,
    onboarding_completed_at = now(),
    updated_at = now()
where id = '10000000-0000-4000-8000-000000000003'::uuid;

do $test$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = '10000000-0000-4000-8000-000000000003'::uuid
      and p.display_name = 'Security Patient B'
      and p.onboarding_version = 1
      and p.role = 'patient'::public.app_role
  ) then
    raise exception 'Patient onboarding fields were not saved safely';
  end if;
end
$test$;

select set_config('axion.invitation_id', claim.invitation_id::text, true)
from public.claim_care_invitation(current_setting('axion.invite_code')) claim;

do $test$
begin
  if not exists (
    select 1 from public.therapist_patients tp
    where tp.patient_id = '10000000-0000-4000-8000-000000000003'::uuid
      and tp.therapist_id = '10000000-0000-4000-8000-000000000001'::uuid
      and tp.status = 'pending_verification'
      and tp.therapist_verified_at is null
  ) then
    raise exception 'Claim bypassed therapist verification';
  end if;
end
$test$;

-- The therapist explicitly approves and publishes Patient B's distinct plan.
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000001',
  'email','security-therapist@axion.invalid', 'role','authenticated'
)::text, true);
set local role authenticated;

select public.approve_patient_connection(
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.invitation_id')::uuid
);

select set_config('axion.plan_b', public.publish_patient_plan_v2(
  '10000000-0000-4000-8000-000000000003'::uuid,
  'Patient B secure plan', 'Shoulder recovery', 'Phase 2',
  'Patient B only instructions',
  '[{"exercise_key":"bodyweight_squat","sets":2,"repetitions":6,"duration_seconds":null},{"exercise_key":"wall_sit","sets":4,"repetitions":1,"duration_seconds":35}]'::jsonb
)::text, true);

do $test$
begin
  if not exists (
    select 1 from public.exercise_assignments ea
    where ea.plan_id = current_setting('axion.plan_b')::uuid
      and ea.exercise_key = 'bodyweight_squat'
      and ea.target_sets = 2 and ea.target_repetitions = 6
  ) or not exists (
    select 1 from public.exercise_assignments ea
    where ea.plan_id = current_setting('axion.plan_b')::uuid
      and ea.exercise_key = 'wall_sit'
      and ea.target_sets = 4 and ea.duration_seconds = 35
  ) then
    raise exception 'Per-exercise dosage was not preserved';
  end if;
end
$test$;

select set_config('axion.assignment_b', ea.id::text, true)
from public.exercise_assignments ea
where ea.plan_id = current_setting('axion.plan_b')::uuid
limit 1;

-- Patient B can save the assigned exercise.
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000003',
  'email','security-patient-b@axion.invalid', 'role','authenticated'
)::text, true);
set local role authenticated;

insert into public.exercise_sessions (
  patient_id, assignment_id, exercise_key, repetitions, movement_summary,
  difficulty, discomfort, started_at, completed_at, duration_seconds, client_session_id
) values (
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.assignment_b')::uuid,
  'bodyweight_squat', 6, '{"source":"security-integration-test"}'::jsonb,
  2, 'none', now() - interval '30 seconds', now(), 30,
  '11111111-1111-4111-8111-111111111111'::uuid
);

select set_config('axion.session_b', es.id::text, true)
from public.exercise_sessions es
where es.client_session_id = '11111111-1111-4111-8111-111111111111'::uuid;

-- A patient can immediately save an append-only, assignment-bound safety event.
insert into public.patient_safety_events (
  patient_id, assignment_id, client_session_id, exercise_key,
  set_number, rep_number, event_type, pain_score, comment
) values (
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.assignment_b')::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,
  'bodyweight_squat', 1, 2, 'pain', 6, 'Synthetic safety test only'
);

select set_config('axion.safety_event_b', pse.id::text, true)
from public.patient_safety_events pse
where pse.client_session_id = '33333333-3333-4333-8333-333333333333'::uuid;

-- A patient can message only their active care-team relationship with valid context.
insert into public.care_messages (
  therapist_id, patient_id, sender_id, plan_id, assignment_id, session_id,
  client_message_id, body
) values (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000003'::uuid,
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.plan_b')::uuid,
  current_setting('axion.assignment_b')::uuid,
  current_setting('axion.session_b')::uuid,
  '55555555-5555-4555-8555-555555555555'::uuid,
  'Synthetic patient care-team message'
);

select set_config('axion.patient_message_b', cm.id::text, true)
from public.care_messages cm
where cm.client_message_id = '55555555-5555-4555-8555-555555555555'::uuid;

do $test$
begin
  begin
    insert into public.care_messages (
      therapist_id, patient_id, sender_id, client_message_id, body
    ) values (
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000002'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid,
      '66666666-6666-4666-8666-666666666666'::uuid,
      'Cross-patient message attack'
    );
  exception when sqlstate '42501' then
    return;
  end;
  raise exception 'Cross-patient care message was allowed';
end
$test$;

-- Three reports for one exercise create one therapist-only review suggestion.
insert into public.patient_safety_events (
  patient_id, assignment_id, client_session_id, exercise_key,
  set_number, rep_number, event_type, comment
) values
(
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.assignment_b')::uuid,
  '77777777-7777-4777-8777-777777777771'::uuid,
  'bodyweight_squat', 1, 3, 'felt_wrong', 'Synthetic report two'
),
(
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.assignment_b')::uuid,
  '77777777-7777-4777-8777-777777777772'::uuid,
  'bodyweight_squat', 1, 4, 'felt_different', 'Synthetic report three'
);

do $test$
begin
  if (select count(*) from public.patient_safety_events) <> 3 then
    raise exception 'Patient could not read their own safety event';
  end if;
  begin
    update public.patient_safety_events set comment = 'Tampered' where id = current_setting('axion.safety_event_b')::uuid;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'Patient could alter an append-only safety event';
end
$test$;

do $test$
begin
  begin
    insert into public.patient_safety_events (
      patient_id, assignment_id, client_session_id, exercise_key,
      set_number, rep_number, event_type, comment
    ) values (
      '10000000-0000-4000-8000-000000000003'::uuid,
      current_setting('axion.assignment_a')::uuid,
      '44444444-4444-4444-8444-444444444444'::uuid,
      'bodyweight_squat', 1, 1, 'felt_wrong', 'Cross-patient attack'
    );
  exception when sqlstate '42501' then
    return;
  end;
  raise exception 'Cross-patient safety-event insert was allowed';
end
$test$;

-- A patient cannot impersonate a therapist and create a therapist note.
do $test$
begin
  begin
    insert into public.therapist_notes (therapist_id, patient_id, session_id, note)
    values (
      '10000000-0000-4000-8000-000000000001'::uuid,
      '10000000-0000-4000-8000-000000000003'::uuid,
      current_setting('axion.session_b')::uuid,
      'Patient-authored spoofed therapist note'
    );
  exception when sqlstate '42501' then
    return;
  end;
  raise exception 'Patient was allowed to create a therapist note';
end
$test$;

-- The connected therapist can add a session note.
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000001',
  'email','security-therapist@axion.invalid', 'role','authenticated'
)::text, true);
set local role authenticated;

insert into public.therapist_notes (therapist_id, patient_id, session_id, note)
values (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000003'::uuid,
  current_setting('axion.session_b')::uuid,
  'Synthetic authorization test note'
);

-- The therapist can read/reply to the thread and mark only incoming messages read.
do $test$
begin
  if (select count(*) from public.care_messages where patient_id = '10000000-0000-4000-8000-000000000003'::uuid) <> 1 then
    raise exception 'Connected therapist could not read the patient message';
  end if;
end
$test$;

update public.care_messages
set read_at = now()
where id = current_setting('axion.patient_message_b')::uuid;

insert into public.care_messages (
  therapist_id, patient_id, sender_id, plan_id, client_message_id, body
) values (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000003'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  current_setting('axion.plan_b')::uuid,
  '88888888-8888-4888-8888-888888888888'::uuid,
  'Synthetic therapist reply'
);

select set_config('axion.therapist_message_b', cm.id::text, true)
from public.care_messages cm
where cm.client_message_id = '88888888-8888-4888-8888-888888888888'::uuid;

-- The review suggestion is therapist-only and its decision cannot change dosage.
select set_config('axion.recommendation_b', cr.id::text, true)
from public.clinician_recommendations cr
where cr.patient_id = '10000000-0000-4000-8000-000000000003'::uuid
  and cr.exercise_key = 'bodyweight_squat'
  and cr.status = 'pending';

do $test$
begin
  if nullif(current_setting('axion.recommendation_b', true), '') is null then
    raise exception 'Repeated safety reports did not create a review suggestion';
  end if;
end
$test$;

update public.clinician_recommendations
set status = 'accepted',
    clinician_response = 'Review with patient before considering any roadmap change',
    reviewed_at = now(),
    updated_at = now()
where id = current_setting('axion.recommendation_b')::uuid;

do $test$
begin
  if not exists (
    select 1 from public.exercise_assignments ea
    where ea.id = current_setting('axion.assignment_b')::uuid
      and ea.target_sets = 2 and ea.target_repetitions = 6
  ) then
    raise exception 'Recommendation review changed the prescription';
  end if;
end
$test$;

do $test$
begin
  if (select count(*) from public.patient_safety_events where patient_id = '10000000-0000-4000-8000-000000000003'::uuid) <> 3 then
    raise exception 'Connected therapist could not read the patient safety event';
  end if;
  if (select count(*) from public.therapist_alerts where patient_id = '10000000-0000-4000-8000-000000000003'::uuid and status = 'open') <> 3 then
    raise exception 'Safety event did not create one therapist alert';
  end if;
  update public.therapist_alerts
  set status = 'reviewed', reviewed_at = now()
  where patient_id = '10000000-0000-4000-8000-000000000003'::uuid;
  if (select count(*) from public.therapist_alerts where patient_id = '10000000-0000-4000-8000-000000000003'::uuid and status = 'reviewed') <> 3 then
    raise exception 'Therapist could not review their own alert';
  end if;
end
$test$;

do $test$
begin
  if (select count(*) from public.therapist_notes where patient_id = '10000000-0000-4000-8000-000000000003'::uuid) <> 1 then
    raise exception 'Connected therapist could not read the authorized note';
  end if;
end
$test$;

-- Therapist notes remain hidden from the patient account.
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000003',
  'email','security-patient-b@axion.invalid', 'role','authenticated'
)::text, true);
set local role authenticated;

do $test$
begin
  if (select count(*) from public.therapist_notes) <> 0 then
    raise exception 'Patient could read private therapist notes';
  end if;
  if (select count(*) from public.therapist_alerts) <> 0 then
    raise exception 'Patient could read therapist-only alerts';
  end if;
  if (select count(*) from public.clinician_recommendations) <> 0 then
    raise exception 'Patient could read therapist-only recommendations';
  end if;
  if (select count(*) from public.care_messages) <> 2 then
    raise exception 'Patient could not read only their care-team thread';
  end if;
  begin
    update public.care_messages set body = 'Tampered body'
    where id = current_setting('axion.patient_message_b')::uuid;
  exception when insufficient_privilege then
    null;
  end;
  if exists (
    select 1 from public.care_messages
    where id = current_setting('axion.patient_message_b')::uuid and body = 'Tampered body'
  ) then
    raise exception 'Patient could alter immutable message content';
  end if;
  perform set_config('axion.message_read_at', cm.read_at::text, true)
  from public.care_messages cm
  where cm.id = current_setting('axion.patient_message_b')::uuid;
  update public.care_messages set read_at = now() + interval '1 day'
  where id = current_setting('axion.patient_message_b')::uuid;
  if exists (
    select 1 from public.care_messages cm
    where cm.id = current_setting('axion.patient_message_b')::uuid
      and cm.read_at is distinct from current_setting('axion.message_read_at')::timestamptz
  ) then
    raise exception 'Sender could mark their own message as read';
  end if;
end
$test$;

-- A cross-patient assignment injection must fail.
do $test$
begin
  begin
    insert into public.exercise_sessions (
      patient_id, assignment_id, exercise_key, repetitions, movement_summary,
      completed_at, duration_seconds, client_session_id
    ) values (
      '10000000-0000-4000-8000-000000000003'::uuid,
      current_setting('axion.assignment_a')::uuid,
      'bodyweight_squat', 1, '{}'::jsonb, now(), 1,
      '22222222-2222-4222-8222-222222222222'::uuid
    );
  exception when sqlstate '42501' then
    return;
  end;
  raise exception 'Cross-patient assignment insert was allowed';
end
$test$;

-- A retried client write with the same idempotency key must fail closed.
do $test$
begin
  begin
    insert into public.exercise_sessions (
      patient_id, assignment_id, exercise_key, repetitions, movement_summary,
      completed_at, duration_seconds, client_session_id
    ) values (
      '10000000-0000-4000-8000-000000000003'::uuid,
      current_setting('axion.assignment_b')::uuid,
      'bodyweight_squat', 6, '{}'::jsonb, now(), 30,
      '11111111-1111-4111-8111-111111111111'::uuid
    );
  exception when unique_violation then
    return;
  end;
  raise exception 'Duplicate client session was allowed';
end
$test$;

-- Patient B must see only Patient B's plan and session.
do $test$
begin
  if (select count(*) from public.exercise_plans) <> 1 then
    raise exception 'Patient isolation failed for plans';
  end if;
  if (select count(*) from public.exercise_sessions) <> 1 then
    raise exception 'Patient isolation failed for sessions';
  end if;
end
$test$;

reset role;
rollback;

select
  true as safe_onboarding_update,
  true as claim_stays_pending,
  true as therapist_approval_required,
  true as own_assignment_session_allowed,
  true as therapist_note_authorization_enforced,
  true as append_only_safety_events_enforced,
  true as therapist_safety_alerts_enforced,
  true as care_message_isolation_enforced,
  true as recommendation_review_boundary_enforced,
  true as cross_patient_assignment_blocked,
  true as duplicate_session_blocked,
  true as patient_isolation;
