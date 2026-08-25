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
  true as cross_patient_assignment_blocked,
  true as duplicate_session_blocked,
  true as patient_isolation;
