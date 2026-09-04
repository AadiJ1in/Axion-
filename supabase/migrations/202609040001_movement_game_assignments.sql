-- Persist the therapist's per-exercise delivery mode without changing dosage.
-- The first supported movement-game vertical slice is intentionally limited to
-- Bodyweight Squat; unsupported exercises remain standard.

alter table public.exercise_assignments
  add column if not exists exercise_mode text not null default 'standard';

alter table public.exercise_assignments
  drop constraint if exists exercise_assignments_exercise_mode_check;

alter table public.exercise_assignments
  add constraint exercise_assignments_exercise_mode_check
  check (exercise_mode in ('standard', 'movement_game'));

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
    if v_mode = 'movement_game' and v_key <> 'bodyweight_squat' then
      raise exception 'Movement Game is currently available only for Bodyweight Squat.' using errcode = '22023';
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

create or replace function public.publish_patient_plan_v4(
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
language sql
security invoker
set search_path = ''
as $$
  select private.publish_patient_plan_v4(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );
$$;

revoke all on function private.publish_patient_plan_v4(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
revoke all on function public.publish_patient_plan_v4(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon;
grant execute on function public.publish_patient_plan_v4(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
