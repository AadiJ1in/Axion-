-- Additive gameplay configuration; existing authorization and prescription publishers remain authoritative.
alter table public.exercise_assignments add column if not exists prescribed_side text not null default 'either'
  check (prescribed_side in ('either','left','right'));
insert into private.exercise_catalog (exercise_key, display_name, category, tracking_mode, joint)
values ('push_up','Push-Up','Chest','pose_reps','elbow')
on conflict (exercise_key) do nothing;

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
    if v_mode = 'movement_game' and v_key not in ('bodyweight_squat','push_up','wall_push_up','forward_lunge','standing_shoulder_abduction') then
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

create or replace function private.publish_patient_plan_v6(
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
  v_side text;
begin
  if jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'Exercises must be supplied as an array.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_exercises)
  loop
    v_side := coalesce(v_item ->> 'prescribed_side', 'either');
    if v_side not in ('either','left','right') then
      raise exception 'Choose either, left or right for the prescribed side.' using errcode = '22023';
    end if;
  end loop;

  v_plan_id := private.publish_patient_plan_v5(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );

  update public.exercise_assignments ea
  set prescribed_side = coalesce((
    select item ->> 'prescribed_side'
    from jsonb_array_elements(p_exercises) item
    where lower(trim(item ->> 'exercise_key')) = ea.exercise_key
    limit 1
  ), 'either'),
  updated_at = now()
  where ea.plan_id = v_plan_id;

  return v_plan_id;
end;
$$;

create or replace function public.publish_patient_plan_v6(
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
  select private.publish_patient_plan_v6(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );
$$;

revoke all on function private.publish_patient_plan_v6(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
revoke all on function public.publish_patient_plan_v6(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
grant execute on function private.publish_patient_plan_v6(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
grant execute on function public.publish_patient_plan_v6(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;

-- Partial clinical work is saved but cannot unlock a roadmap node.
create or replace function private.complete_roadmap_node_after_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_required integer;
  v_completed integer;
  v_inserted integer;
begin
  if new.roadmap_node_id is null then
    return new;
  end if;

  select rn.plan_id into v_plan_id
  from public.roadmap_nodes rn where rn.id = new.roadmap_node_id;

  select count(*) into v_required
  from public.roadmap_node_assignments rna
  where rna.roadmap_node_id = new.roadmap_node_id;

  select count(distinct es.assignment_id) into v_completed
  from public.exercise_sessions es
  join public.roadmap_node_assignments rna
    on rna.roadmap_node_id = new.roadmap_node_id and rna.assignment_id = es.assignment_id
  join public.exercise_assignments ea on ea.id = es.assignment_id
  where es.roadmap_node_id = new.roadmap_node_id and es.patient_id = new.patient_id
    and case when ea.tracking_mode = 'timed_hold' then
      case when jsonb_typeof(es.movement_summary -> 'measured_hold_seconds') = 'number'
        then (es.movement_summary ->> 'measured_hold_seconds')::numeric else 0 end
          >= ea.target_sets * coalesce(ea.duration_seconds, 30)
    else es.repetitions >= ea.target_sets * ea.target_repetitions end;

  if v_required > 0 and v_completed >= v_required then
    insert into public.roadmap_node_completions (roadmap_node_id, patient_id, xp_awarded)
    values (new.roadmap_node_id, new.patient_id, 50)
    on conflict (roadmap_node_id) do nothing;
    get diagnostics v_inserted = row_count;

    if v_inserted = 1 then
      update public.profiles p
      set recovery_xp = p.recovery_xp + 50,
          level = least(100, greatest(1, ((p.recovery_xp + 50) / 500) + 1)),
          streak_days = case
            when p.last_roadmap_session_at::date = current_date then p.streak_days
            when p.last_roadmap_session_at::date = current_date - 1 then p.streak_days + 1
            else 1
          end,
          last_roadmap_session_at = now(),
          updated_at = now()
      where p.id = new.patient_id;

      insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
      values (
        new.patient_id,
        'roadmap_node_completed',
        'roadmap_node',
        new.roadmap_node_id::text,
        jsonb_build_object('plan_id', v_plan_id, 'xp_awarded', 50)
      );
    end if;
  end if;
  return new;
end;
$$;

