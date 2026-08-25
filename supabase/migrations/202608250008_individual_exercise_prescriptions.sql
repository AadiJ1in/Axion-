-- Publish patient-specific roadmaps with independently validated dosage per exercise.
-- The privileged implementation stays in the unexposed private schema and verifies
-- both the authenticated therapist role and the active therapist/patient relationship.

create or replace function private.publish_patient_plan_v2(
  p_patient_id uuid,
  p_title text,
  p_program_label text,
  p_phase_label text,
  p_instructions text,
  p_exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_id uuid;
  v_item jsonb;
  v_key text;
  v_name text;
  v_tracking_mode text;
  v_sets integer;
  v_repetitions integer;
  v_duration_seconds integer;
  v_sequence integer := 0;
  v_seen text[] := array[]::text[];
begin
  if v_actor is null or (select private.current_app_role()) <> 'therapist'::public.app_role then
    raise exception 'Only verified therapist accounts can publish plans.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = v_actor
      and tp.patient_id = p_patient_id
      and tp.status = 'active'
  ) then
    raise exception 'The patient must be verified and connected before a plan can be published.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 1 and 120
     or char_length(trim(coalesce(p_program_label, ''))) not between 1 and 80
     or char_length(trim(coalesce(p_phase_label, ''))) not between 1 and 80
     or char_length(coalesce(p_instructions, '')) > 2000
     or jsonb_typeof(p_exercises) <> 'array'
     or jsonb_array_length(p_exercises) not between 1 and 12 then
    raise exception 'Review the roadmap fields and select between 1 and 12 exercises.' using errcode = '22023';
  end if;

  update public.exercise_plans
  set status = 'archived', updated_at = now()
  where therapist_id = v_actor and patient_id = p_patient_id and status = 'active';

  insert into public.exercise_plans (
    therapist_id, patient_id, title, program_label, phase_label,
    instructions, start_date, status, updated_at
  ) values (
    v_actor, p_patient_id, trim(p_title), trim(p_program_label), trim(p_phase_label),
    nullif(trim(coalesce(p_instructions, '')), ''), current_date, 'active', now()
  ) returning id into v_plan_id;

  for v_item in select value from jsonb_array_elements(p_exercises)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'exercise_key', '') !~ '^[a-z0-9_]{1,64}$'
       or coalesce(v_item ->> 'sets', '') !~ '^[0-9]{1,3}$'
       or coalesce(v_item ->> 'repetitions', '') !~ '^[0-9]{1,3}$'
       or (v_item ? 'duration_seconds' and jsonb_typeof(v_item -> 'duration_seconds') not in ('number', 'null')) then
      raise exception 'Each exercise must contain a valid key, sets, repetitions, and optional hold duration.' using errcode = '22023';
    end if;

    v_key := lower(trim(v_item ->> 'exercise_key'));
    v_sets := (v_item ->> 'sets')::integer;
    v_repetitions := (v_item ->> 'repetitions')::integer;
    v_duration_seconds := case
      when jsonb_typeof(v_item -> 'duration_seconds') = 'number' then (v_item ->> 'duration_seconds')::integer
      else null
    end;

    if v_key = any(v_seen) then
      raise exception 'Each exercise can appear only once in a roadmap.' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_key);

    case v_key
      when 'bodyweight_squat' then v_name := 'Bodyweight Squat'; v_tracking_mode := 'pose_reps';
      when 'half_squat' then v_name := 'Half Squat'; v_tracking_mode := 'pose_reps';
      when 'wall_sit' then v_name := 'Wall Sit'; v_tracking_mode := 'timed_hold';
      when 'step_up' then v_name := 'Step-up'; v_tracking_mode := 'pose_reps';
      when 'hamstring_curl' then v_name := 'Standing Hamstring Curl'; v_tracking_mode := 'pose_reps';
      when 'leg_extension' then v_name := 'Leg Extension'; v_tracking_mode := 'pose_reps';
      when 'straight_leg_raise' then v_name := 'Straight-Leg Raise'; v_tracking_mode := 'pose_reps';
      when 'prone_hip_extension' then v_name := 'Prone Hip Extension'; v_tracking_mode := 'pose_reps';
      when 'hip_abduction' then v_name := 'Side-Lying Hip Abduction'; v_tracking_mode := 'pose_reps';
      when 'hip_adduction' then v_name := 'Side-Lying Hip Adduction'; v_tracking_mode := 'pose_reps';
      when 'clamshell' then v_name := 'Clamshell'; v_tracking_mode := 'guided_reps';
      when 'reverse_clamshell' then v_name := 'Reverse Clamshell'; v_tracking_mode := 'guided_reps';
      when 'heel_raise' then v_name := 'Calf Raise'; v_tracking_mode := 'pose_reps';
      when 'ankle_dorsiflexion' then v_name := 'Ankle Dorsiflexion'; v_tracking_mode := 'pose_reps';
      when 'ankle_plantar_flexion' then v_name := 'Ankle Plantar Flexion'; v_tracking_mode := 'pose_reps';
      when 'single_leg_balance' then v_name := 'Single-Leg Balance'; v_tracking_mode := 'timed_hold';
      when 'heel_cord_stretch' then v_name := 'Heel Cord Stretch'; v_tracking_mode := 'timed_hold';
      when 'bent_knee_heel_cord_stretch' then v_name := 'Bent-Knee Heel Cord Stretch'; v_tracking_mode := 'timed_hold';
      when 'standing_quad_stretch' then v_name := 'Standing Quadriceps Stretch'; v_tracking_mode := 'timed_hold';
      when 'supine_hamstring_stretch' then v_name := 'Supine Hamstring Stretch'; v_tracking_mode := 'timed_hold';
      when 'towel_curl' then v_name := 'Towel Curl'; v_tracking_mode := 'guided_reps';
      when 'ankle_range_of_motion' then v_name := 'Ankle Range of Motion'; v_tracking_mode := 'guided_reps';
      else raise exception 'Unsupported exercise in roadmap.' using errcode = '22023';
    end case;

    if v_sets not between 1 and 20
       or v_repetitions not between 1 and 500
       or (v_tracking_mode = 'timed_hold' and coalesce(v_duration_seconds, 0) not between 5 and 3600) then
      raise exception 'Review the sets, repetitions, and hold duration for each exercise.' using errcode = '22023';
    end if;

    v_sequence := v_sequence + 1;
    insert into public.exercise_assignments (
      plan_id, exercise_key, display_name, sequence, tracking_mode,
      target_sets, target_repetitions, duration_seconds, instructions, status, updated_at
    ) values (
      v_plan_id, v_key, v_name, v_sequence, v_tracking_mode,
      v_sets, v_repetitions,
      case when v_tracking_mode = 'timed_hold' then v_duration_seconds else null end,
      nullif(trim(coalesce(p_instructions, '')), ''), 'active', now()
    );
  end loop;

  insert into public.roadmap_stages (plan_id, stage_number, title, detail, status, unlock_after_sessions)
  values
    (v_plan_id, 1, 'Baseline', 'Establish a comfortable movement baseline.', 'current', 0),
    (v_plan_id, 2, 'Control', 'Build repeatable movement control.', 'locked', 3),
    (v_plan_id, 3, 'Capacity', 'Progress volume under therapist guidance.', 'locked', 8),
    (v_plan_id, 4, 'Return', 'Complete therapist-defined return milestones.', 'locked', 14);

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'patient_plan_published_v2', 'exercise_plan', v_plan_id::text,
    jsonb_build_object('patient_id', p_patient_id, 'exercise_count', jsonb_array_length(p_exercises))
  );

  return v_plan_id;
end;
$$;

create or replace function public.publish_patient_plan_v2(
  p_patient_id uuid,
  p_title text,
  p_program_label text,
  p_phase_label text,
  p_instructions text,
  p_exercises jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.publish_patient_plan_v2(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions, p_exercises
  );
$$;

revoke all on function private.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) to authenticated;

