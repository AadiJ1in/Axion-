-- Store the server-authoritative prescription allowlist outside the exposed Data API.
-- Patient-facing educational content remains versioned with the frontend; this table
-- contains only the clinical key, label, body section, tracking mode, and measured joint.

create table if not exists private.exercise_catalog (
  exercise_key text primary key check (exercise_key ~ '^[a-z0-9_]{1,64}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  category text not null check (char_length(category) between 1 and 80),
  tracking_mode text not null check (tracking_mode in ('pose_reps', 'guided_reps', 'timed_hold')),
  joint text not null check (joint in ('neck', 'shoulder', 'elbow', 'wrist', 'spine', 'hip', 'knee', 'ankle')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on table private.exercise_catalog from public, anon, authenticated;

insert into private.exercise_catalog (exercise_key, display_name, category, tracking_mode, joint) values
  ('chin_tuck', 'Chin Tuck', 'Neck', 'guided_reps', 'neck'),
  ('cervical_rotation', 'Seated Neck Rotation', 'Neck', 'guided_reps', 'neck'),
  ('cervical_side_bend', 'Neck Side Bend', 'Neck', 'guided_reps', 'neck'),
  ('upper_trap_stretch', 'Upper Trapezius Stretch', 'Neck', 'timed_hold', 'neck'),
  ('shoulder_pendulum', 'Shoulder Pendulum', 'Shoulders', 'timed_hold', 'shoulder'),
  ('wall_crawl', 'Shoulder Wall Crawl', 'Shoulders', 'guided_reps', 'shoulder'),
  ('cross_body_shoulder_stretch', 'Cross-Body Shoulder Stretch', 'Shoulders', 'timed_hold', 'shoulder'),
  ('shoulder_external_rotation', 'Band Shoulder External Rotation', 'Shoulders', 'guided_reps', 'shoulder'),
  ('shoulder_internal_rotation', 'Band Shoulder Internal Rotation', 'Shoulders', 'guided_reps', 'shoulder'),
  ('scapular_retraction', 'Scapular Retraction', 'Shoulders', 'guided_reps', 'shoulder'),
  ('doorway_chest_stretch', 'Doorway Chest Stretch', 'Chest', 'timed_hold', 'shoulder'),
  ('wall_push_up', 'Wall Push-Up', 'Chest', 'guided_reps', 'elbow'),
  ('supine_chest_opening', 'Supine Chest Opening', 'Chest', 'timed_hold', 'shoulder'),
  ('thoracic_extension_chair', 'Thoracic Extension Over Chair', 'Upper back', 'guided_reps', 'spine'),
  ('open_book', 'Open Book Rotation', 'Upper back', 'guided_reps', 'spine'),
  ('seated_row', 'Band Seated Row', 'Upper back', 'guided_reps', 'shoulder'),
  ('wall_angels', 'Wall Angels', 'Upper back', 'guided_reps', 'shoulder'),
  ('biceps_curl', 'Biceps Curl', 'Arms & elbows', 'guided_reps', 'elbow'),
  ('triceps_extension', 'Band Triceps Extension', 'Arms & elbows', 'guided_reps', 'elbow'),
  ('wrist_flexor_stretch', 'Wrist Flexor Stretch', 'Arms & elbows', 'timed_hold', 'wrist'),
  ('forearm_rotation', 'Forearm Pronation and Supination', 'Arms & elbows', 'guided_reps', 'elbow'),
  ('abdominal_bracing', 'Abdominal Bracing', 'Core & abs', 'timed_hold', 'spine'),
  ('dead_bug', 'Dead Bug', 'Core & abs', 'guided_reps', 'spine'),
  ('bridge', 'Glute Bridge', 'Core & abs', 'guided_reps', 'hip'),
  ('bird_dog', 'Bird Dog', 'Core & abs', 'guided_reps', 'spine'),
  ('modified_front_plank', 'Modified Front Plank', 'Core & abs', 'timed_hold', 'spine'),
  ('side_plank_knees', 'Side Plank From Knees', 'Core & abs', 'timed_hold', 'spine'),
  ('pelvic_tilt', 'Pelvic Tilt', 'Lower back', 'guided_reps', 'spine'),
  ('knee_to_chest', 'Single Knee-to-Chest Stretch', 'Lower back', 'timed_hold', 'hip'),
  ('cat_camel', 'Cat-Camel', 'Lower back', 'guided_reps', 'spine'),
  ('seated_trunk_rotation', 'Seated Trunk Rotation', 'Lower back', 'guided_reps', 'spine'),
  ('clamshell', 'Clamshell', 'Hips & glutes', 'guided_reps', 'hip'),
  ('reverse_clamshell', 'Reverse Clamshell', 'Hips & glutes', 'guided_reps', 'hip'),
  ('hip_abduction', 'Side-Lying Hip Abduction', 'Hips & glutes', 'guided_reps', 'hip'),
  ('hip_adduction', 'Side-Lying Hip Adduction', 'Hips & glutes', 'guided_reps', 'hip'),
  ('prone_hip_extension', 'Prone Hip Extension', 'Hips & glutes', 'guided_reps', 'hip'),
  ('figure_four_stretch', 'Figure-Four Hip Stretch', 'Hips & glutes', 'timed_hold', 'hip'),
  ('half_squat', 'Half Squat', 'Thighs & quads', 'pose_reps', 'knee'),
  ('wall_sit', 'Wall Sit', 'Thighs & quads', 'timed_hold', 'knee'),
  ('leg_extension', 'Seated Leg Extension', 'Thighs & quads', 'guided_reps', 'knee'),
  ('straight_leg_raise', 'Straight-Leg Raise', 'Thighs & quads', 'guided_reps', 'hip'),
  ('standing_quad_stretch', 'Standing Quadriceps Stretch', 'Thighs & quads', 'timed_hold', 'knee'),
  ('hamstring_curl', 'Standing Hamstring Curl', 'Hamstrings', 'guided_reps', 'knee'),
  ('supine_hamstring_stretch', 'Supine Hamstring Stretch', 'Hamstrings', 'timed_hold', 'hip'),
  ('seated_hamstring_stretch', 'Seated Hamstring Stretch', 'Hamstrings', 'timed_hold', 'hip'),
  ('bodyweight_squat', 'Bodyweight Squat', 'Knees', 'pose_reps', 'knee'),
  ('step_up', 'Step-Up', 'Knees', 'guided_reps', 'knee'),
  ('terminal_knee_extension', 'Band Terminal Knee Extension', 'Knees', 'guided_reps', 'knee'),
  ('heel_slide', 'Heel Slide', 'Knees', 'guided_reps', 'knee'),
  ('heel_raise', 'Calf Raise', 'Calves & shins', 'guided_reps', 'ankle'),
  ('heel_cord_stretch', 'Straight-Knee Calf Stretch', 'Calves & shins', 'timed_hold', 'ankle'),
  ('bent_knee_heel_cord_stretch', 'Bent-Knee Calf Stretch', 'Calves & shins', 'timed_hold', 'ankle'),
  ('tibialis_raise', 'Tibialis Raise', 'Calves & shins', 'guided_reps', 'ankle'),
  ('ankle_dorsiflexion', 'Band Ankle Dorsiflexion', 'Ankles & feet', 'guided_reps', 'ankle'),
  ('ankle_plantar_flexion', 'Band Ankle Plantar Flexion', 'Ankles & feet', 'guided_reps', 'ankle'),
  ('ankle_range_of_motion', 'Ankle Alphabet', 'Ankles & feet', 'guided_reps', 'ankle'),
  ('towel_curl', 'Towel Curl', 'Ankles & feet', 'guided_reps', 'ankle'),
  ('toe_yoga', 'Toe Yoga', 'Ankles & feet', 'guided_reps', 'ankle'),
  ('single_leg_balance', 'Single-Leg Balance', 'Balance', 'timed_hold', 'knee'),
  ('tandem_stance', 'Tandem Stance', 'Balance', 'timed_hold', 'ankle'),
  ('heel_to_toe_walk', 'Heel-to-Toe Walk', 'Balance', 'guided_reps', 'ankle')
on conflict (exercise_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  tracking_mode = excluded.tracking_mode,
  joint = excluded.joint,
  active = true,
  updated_at = now();

create or replace function private.publish_patient_plan_v2(
  p_patient_id uuid, p_title text, p_program_label text, p_phase_label text,
  p_instructions text, p_exercises jsonb
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
    where tp.therapist_id = v_actor and tp.patient_id = p_patient_id and tp.status = 'active'
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

  update public.exercise_plans set status = 'archived', updated_at = now()
  where therapist_id = v_actor and patient_id = p_patient_id and status = 'active';
  insert into public.exercise_plans (
    therapist_id, patient_id, title, program_label, phase_label, instructions, start_date, status, updated_at
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
    v_duration_seconds := case when jsonb_typeof(v_item -> 'duration_seconds') = 'number' then (v_item ->> 'duration_seconds')::integer else null end;
    if v_key = any(v_seen) then
      raise exception 'Each exercise can appear only once in a roadmap.' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_key);

    select c.display_name, c.tracking_mode into v_name, v_tracking_mode
    from private.exercise_catalog c where c.exercise_key = v_key and c.active;
    if not found then
      raise exception 'Unsupported exercise in roadmap.' using errcode = '22023';
    end if;
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
      v_plan_id, v_key, v_name, v_sequence, v_tracking_mode, v_sets, v_repetitions,
      case when v_tracking_mode = 'timed_hold' then v_duration_seconds else null end,
      nullif(trim(coalesce(p_instructions, '')), ''), 'active', now()
    );
  end loop;

  insert into public.roadmap_stages (plan_id, stage_number, title, detail, status, unlock_after_sessions) values
    (v_plan_id, 1, 'Baseline', 'Establish a comfortable movement baseline.', 'current', 0),
    (v_plan_id, 2, 'Control', 'Build repeatable movement control.', 'locked', 3),
    (v_plan_id, 3, 'Capacity', 'Progress volume under therapist guidance.', 'locked', 8),
    (v_plan_id, 4, 'Return', 'Complete therapist-defined return milestones.', 'locked', 14);
  insert into private.audit_events (actor_id, action, target_type, target_id, metadata) values (
    v_actor, 'patient_plan_published_v2', 'exercise_plan', v_plan_id::text,
    jsonb_build_object('patient_id', p_patient_id, 'exercise_count', jsonb_array_length(p_exercises))
  );
  return v_plan_id;
end;
$$;

revoke all on function private.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function private.publish_patient_plan_v2(uuid, text, text, text, text, jsonb) to authenticated;
