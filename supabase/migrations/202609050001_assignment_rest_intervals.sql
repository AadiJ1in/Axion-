-- Persist clinician-selected rest between sets and publish it atomically with dosage.
-- A value of zero disables the timed break.

alter table public.exercise_assignments
  add column if not exists rest_seconds smallint not null default 60;

alter table public.exercise_assignments
  drop constraint if exists exercise_assignments_rest_seconds_check;

alter table public.exercise_assignments
  add constraint exercise_assignments_rest_seconds_check
  check (rest_seconds between 0 and 900);

create or replace function private.publish_patient_plan_v5(
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
  v_rest_seconds integer;
begin
  if jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'Exercises must be supplied as an array.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_exercises)
  loop
    begin
      v_rest_seconds := coalesce((v_item ->> 'rest_seconds')::integer, 60);
    exception when invalid_text_representation then
      raise exception 'Rest time must be a whole number of seconds.' using errcode = '22023';
    end;
    if v_rest_seconds < 0 or v_rest_seconds > 900 then
      raise exception 'Rest time must be between 0 and 900 seconds.' using errcode = '22023';
    end if;
  end loop;

  v_plan_id := private.publish_patient_plan_v4(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );

  update public.exercise_assignments ea
  set rest_seconds = coalesce((
    select (item ->> 'rest_seconds')::integer
    from jsonb_array_elements(p_exercises) item
    where lower(trim(item ->> 'exercise_key')) = ea.exercise_key
    limit 1
  ), 60),
  updated_at = now()
  where ea.plan_id = v_plan_id;

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'exercise_rest_intervals_published',
    'exercise_plan',
    v_plan_id::text,
    jsonb_build_object(
      'timed_rest_count',
      (select count(*) from jsonb_array_elements(p_exercises) item where coalesce((item ->> 'rest_seconds')::integer, 60) > 0)
    )
  );

  return v_plan_id;
end;
$$;

create or replace function public.publish_patient_plan_v5(
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
  select private.publish_patient_plan_v5(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );
$$;

revoke all on function private.publish_patient_plan_v5(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
revoke all on function public.publish_patient_plan_v5(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
grant execute on function private.publish_patient_plan_v5(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
grant execute on function public.publish_patient_plan_v5(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
