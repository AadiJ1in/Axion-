-- Expand Movement Game delivery from the original five hand-authored games to
-- any exercise that is already present in Axion's authoritative clinical catalog.
-- This does not change dosage, tracking mode, or clinical validation.

create or replace function private.publish_patient_plan_v4(
  p_patient_id uuid,
  p_title text,
  p_program_label text,
  p_phase_label text,
  p_instructions text,
  p_exercises jsonb,
  p_duration_weeks integer,
  p_sessions_per_week integer,
  p_game_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_item jsonb;
  v_key text;
  v_mode text;
begin
  if jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'Exercises must be supplied as an array.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_exercises)
  loop
    v_key := lower(trim(coalesce(v_item ->> 'exercise_key', '')));
    v_mode := lower(trim(coalesce(v_item ->> 'exercise_mode', 'standard')));

    if v_mode not in ('standard', 'movement_game') then
      raise exception 'Choose Standard or Movement Game for each exercise.' using errcode = '22023';
    end if;

    if v_mode = 'movement_game' and not exists (
      select 1
      from private.exercise_catalog ec
      where ec.exercise_key = v_key
    ) then
      raise exception 'Movement Game is not supported for this exercise.' using errcode = '22023';
    end if;
  end loop;

  v_plan_id := private.publish_patient_plan_v3(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );

  update public.exercise_assignments ea
  set exercise_mode = coalesce((
    select lower(trim(item ->> 'exercise_mode'))
    from jsonb_array_elements(p_exercises) item
    where lower(trim(item ->> 'exercise_key')) = ea.exercise_key
    limit 1
  ), 'standard'),
  updated_at = now()
  where ea.plan_id = v_plan_id;

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'exercise_modes_published',
    'exercise_plan',
    v_plan_id::text,
    jsonb_build_object(
      'movement_game_count',
      (select count(*) from jsonb_array_elements(p_exercises) item where item ->> 'exercise_mode' = 'movement_game')
    )
  );

  return v_plan_id;
end;
$$;
