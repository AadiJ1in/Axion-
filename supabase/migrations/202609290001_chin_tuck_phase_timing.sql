-- Persist therapist-selected chin-tuck pacing without allowing game timing to
-- change clinical repetition validation.

alter table public.exercise_assignments
  add column if not exists game_phase_down_seconds smallint not null default 3,
  add column if not exists game_phase_up_seconds smallint not null default 3;

alter table public.exercise_assignments
  drop constraint if exists exercise_assignments_game_phase_down_seconds_check,
  drop constraint if exists exercise_assignments_game_phase_up_seconds_check;

alter table public.exercise_assignments
  add constraint exercise_assignments_game_phase_down_seconds_check
    check (game_phase_down_seconds between 1 and 30),
  add constraint exercise_assignments_game_phase_up_seconds_check
    check (game_phase_up_seconds between 1 and 30);

create or replace function private.publish_patient_plan_v7(
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
  v_down_seconds integer;
  v_up_seconds integer;
begin
  if jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'Exercises must be supplied as an array.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_exercises)
  loop
    begin
      v_down_seconds := coalesce((v_item ->> 'game_phase_down_seconds')::integer, 3);
      v_up_seconds := coalesce((v_item ->> 'game_phase_up_seconds')::integer, 3);
    exception when invalid_text_representation then
      raise exception 'Movement-game phase timing must be a whole number of seconds.' using errcode = '22023';
    end;
    if v_down_seconds not between 1 and 30 or v_up_seconds not between 1 and 30 then
      raise exception 'Movement-game phase timing must be between 1 and 30 seconds.' using errcode = '22023';
    end if;
  end loop;

  v_plan_id := private.publish_patient_plan_v6(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );

  update public.exercise_assignments ea
  set game_phase_down_seconds = coalesce((
    select (item ->> 'game_phase_down_seconds')::integer
    from jsonb_array_elements(p_exercises) item
    where lower(trim(item ->> 'exercise_key')) = ea.exercise_key
    limit 1
  ), 3),
  game_phase_up_seconds = coalesce((
    select (item ->> 'game_phase_up_seconds')::integer
    from jsonb_array_elements(p_exercises) item
    where lower(trim(item ->> 'exercise_key')) = ea.exercise_key
    limit 1
  ), 3),
  updated_at = now()
  where ea.plan_id = v_plan_id;

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'movement_game_phase_timing_published',
    'exercise_plan',
    v_plan_id::text,
    jsonb_build_object(
      'paced_exercise_count',
      (select count(*) from jsonb_array_elements(p_exercises) item where item ->> 'exercise_key' = 'chin_tuck')
    )
  );

  return v_plan_id;
end;
$$;

create or replace function public.publish_patient_plan_v7(
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
  select private.publish_patient_plan_v7(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );
$$;

revoke all on function private.publish_patient_plan_v7(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
revoke all on function public.publish_patient_plan_v7(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
grant execute on function private.publish_patient_plan_v7(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
grant execute on function public.publish_patient_plan_v7(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
