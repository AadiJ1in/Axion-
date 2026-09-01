-- Therapist-configured, session-based treatment paths.
-- Gamification is cosmetic: clinical dosage remains in exercise_assignments.

alter table public.exercise_plans
  add column duration_weeks smallint not null default 12 check (duration_weeks between 1 and 52),
  add column sessions_per_week smallint not null default 7 check (sessions_per_week between 1 and 7),
  add column game_enabled boolean not null default true;

alter table public.profiles
  add column last_roadmap_session_at timestamptz;

create table public.roadmap_nodes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.exercise_plans(id) on delete cascade,
  session_number smallint not null check (session_number between 1 and 364),
  week_number smallint not null check (week_number between 1 and 52),
  session_in_week smallint not null check (session_in_week between 1 and 7),
  biome smallint not null check (biome between 1 and 3),
  title text not null check (char_length(title) between 1 and 120),
  detail text not null check (char_length(detail) between 1 and 500),
  target_date date,
  unlock_override boolean not null default false,
  override_reason text check (override_reason is null or char_length(override_reason) between 3 and 1000),
  overridden_by uuid references public.profiles(id) on delete set null,
  overridden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, session_number),
  constraint roadmap_node_override_context check (
    (unlock_override = false and overridden_by is null and overridden_at is null)
    or (unlock_override = true and override_reason is not null and overridden_by is not null and overridden_at is not null)
  )
);

create table public.roadmap_node_assignments (
  roadmap_node_id uuid not null references public.roadmap_nodes(id) on delete cascade,
  assignment_id uuid not null references public.exercise_assignments(id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (roadmap_node_id, assignment_id),
  unique (roadmap_node_id, sequence)
);

create table public.roadmap_node_completions (
  id uuid primary key default gen_random_uuid(),
  roadmap_node_id uuid not null unique references public.roadmap_nodes(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  xp_awarded smallint not null default 50 check (xp_awarded between 0 and 500),
  completed_at timestamptz not null default now()
);

alter table public.exercise_sessions
  add column roadmap_node_id uuid references public.roadmap_nodes(id) on delete set null;

create index roadmap_nodes_plan_session_idx on public.roadmap_nodes (plan_id, session_number);
create index roadmap_node_assignments_assignment_idx on public.roadmap_node_assignments (assignment_id);
create index roadmap_node_completions_patient_idx on public.roadmap_node_completions (patient_id, completed_at desc);
create index exercise_sessions_roadmap_node_idx on public.exercise_sessions (roadmap_node_id, assignment_id);

alter table public.roadmap_nodes enable row level security;
alter table public.roadmap_node_assignments enable row level security;
alter table public.roadmap_node_completions enable row level security;

create policy roadmap_nodes_read_participant
on public.roadmap_nodes for select to authenticated
using (
  exists (
    select 1 from public.exercise_plans ep
    where ep.id = roadmap_nodes.plan_id
      and (ep.patient_id = (select auth.uid()) or ep.therapist_id = (select auth.uid()))
  )
);

create policy roadmap_nodes_therapist_override
on public.roadmap_nodes for update to authenticated
using (
  (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.exercise_plans ep
    join public.therapist_patients tp
      on tp.therapist_id = ep.therapist_id and tp.patient_id = ep.patient_id and tp.status = 'active'
    where ep.id = roadmap_nodes.plan_id and ep.therapist_id = (select auth.uid())
  )
)
with check (
  unlock_override = true
  and overridden_by = (select auth.uid())
  and overridden_at is not null
  and override_reason is not null
);

create policy roadmap_node_assignments_read_participant
on public.roadmap_node_assignments for select to authenticated
using (
  exists (
    select 1 from public.roadmap_nodes rn
    join public.exercise_plans ep on ep.id = rn.plan_id
    where rn.id = roadmap_node_assignments.roadmap_node_id
      and (ep.patient_id = (select auth.uid()) or ep.therapist_id = (select auth.uid()))
  )
);

create policy roadmap_node_completions_read_participant
on public.roadmap_node_completions for select to authenticated
using (
  patient_id = (select auth.uid())
  or (
    (select private.current_app_role()) = 'therapist'::public.app_role
    and exists (
      select 1 from public.therapist_patients tp
      where tp.patient_id = roadmap_node_completions.patient_id
        and tp.therapist_id = (select auth.uid()) and tp.status = 'active'
    )
  )
);

drop policy if exists sessions_insert_assigned_patient on public.exercise_sessions;
create policy sessions_insert_assigned_patient
on public.exercise_sessions for insert to authenticated
with check (
  patient_id = (select auth.uid())
  and (select private.current_app_role()) = 'patient'::public.app_role
  and assignment_id is not null
  and exists (
    select 1
    from public.exercise_assignments ea
    join public.exercise_plans ep on ep.id = ea.plan_id
    where ea.id = exercise_sessions.assignment_id
      and ea.exercise_key = exercise_sessions.exercise_key
      and ea.status = 'active'
      and ep.patient_id = (select auth.uid())
      and ep.status = 'active'
  )
  and (
    roadmap_node_id is null
    or exists (
      select 1
      from public.roadmap_nodes rn
      join public.exercise_plans ep on ep.id = rn.plan_id
      join public.roadmap_node_assignments rna
        on rna.roadmap_node_id = rn.id and rna.assignment_id = exercise_sessions.assignment_id
      where rn.id = exercise_sessions.roadmap_node_id
        and ep.patient_id = (select auth.uid())
        and ep.status = 'active'
        and (
          rn.unlock_override = true
          or rn.session_number <= (
            select count(*) + 1
            from public.roadmap_node_completions rnc
            join public.roadmap_nodes completed_node on completed_node.id = rnc.roadmap_node_id
            where completed_node.plan_id = rn.plan_id and rnc.patient_id = (select auth.uid())
          )
        )
    )
  )
);

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
  where es.roadmap_node_id = new.roadmap_node_id and es.patient_id = new.patient_id;

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

create or replace function private.audit_roadmap_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.unlock_override is distinct from new.unlock_override
     or old.override_reason is distinct from new.override_reason then
    insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
    values (
      auth.uid(),
      'roadmap_node_override_recorded',
      'roadmap_node',
      new.id::text,
      jsonb_build_object(
        'plan_id', new.plan_id,
        'session_number', new.session_number,
        'reason_recorded', new.override_reason is not null
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.complete_roadmap_node_after_session() from public, anon, authenticated;
revoke all on function private.audit_roadmap_override() from public, anon, authenticated;

create trigger exercise_session_complete_roadmap_node
after insert on public.exercise_sessions
for each row execute function private.complete_roadmap_node_after_session();

create trigger roadmap_node_override_audit
after update on public.roadmap_nodes
for each row execute function private.audit_roadmap_override();

create or replace function private.publish_patient_plan_v3(
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
  v_total integer;
  v_session integer;
  v_node_id uuid;
  v_biome integer;
begin
  if p_duration_weeks not between 1 and 52 or p_sessions_per_week not between 1 and 7 then
    raise exception 'Choose 1–52 weeks and 1–7 sessions per week.' using errcode = '22023';
  end if;

  v_total := p_duration_weeks * p_sessions_per_week;
  if v_total > 364 then
    raise exception 'A roadmap cannot contain more than 364 session nodes.' using errcode = '22023';
  end if;

  v_plan_id := private.publish_patient_plan_v2(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions, p_exercises
  );

  update public.exercise_plans
  set duration_weeks = p_duration_weeks,
      sessions_per_week = p_sessions_per_week,
      game_enabled = coalesce(p_game_enabled, true),
      end_date = coalesce(start_date, current_date) + (p_duration_weeks * 7 - 1),
      updated_at = now()
  where id = v_plan_id;

  for v_session in 1..v_total loop
    v_biome := case
      when v_session <= ceil(v_total / 3.0) then 1
      when v_session <= ceil(v_total * 2 / 3.0) then 2
      else 3
    end;

    insert into public.roadmap_nodes (
      plan_id, session_number, week_number, session_in_week, biome,
      title, detail, target_date
    ) values (
      v_plan_id,
      v_session,
      ((v_session - 1) / p_sessions_per_week) + 1,
      ((v_session - 1) % p_sessions_per_week) + 1,
      v_biome,
      'Session ' || v_session,
      case v_biome
        when 1 then 'Build a steady foundation with the prescribed movements.'
        when 2 then 'Rebuild capacity while keeping movement controlled.'
        else 'Practice confident movement within the therapist-directed plan.'
      end,
      coalesce((select start_date from public.exercise_plans where id = v_plan_id), current_date)
        + floor((v_session - 1) * 7.0 / p_sessions_per_week)::integer
    ) returning id into v_node_id;

    insert into public.roadmap_node_assignments (roadmap_node_id, assignment_id, sequence)
    select v_node_id, ea.id, ea.sequence
    from public.exercise_assignments ea
    where ea.plan_id = v_plan_id and ea.status = 'active'
    order by ea.sequence;
  end loop;

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'session_path_published',
    'exercise_plan',
    v_plan_id::text,
    jsonb_build_object(
      'patient_id', p_patient_id,
      'duration_weeks', p_duration_weeks,
      'sessions_per_week', p_sessions_per_week,
      'total_nodes', v_total,
      'game_enabled', coalesce(p_game_enabled, true)
    )
  );

  return v_plan_id;
end;
$$;

create or replace function public.publish_patient_plan_v3(
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
  select private.publish_patient_plan_v3(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercises, p_duration_weeks, p_sessions_per_week, p_game_enabled
  );
$$;

revoke all on function private.publish_patient_plan_v3(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon, authenticated;
revoke all on function public.publish_patient_plan_v3(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  from public, anon;
grant execute on function public.publish_patient_plan_v3(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;

revoke all on table public.roadmap_nodes from public, anon, authenticated;
grant select on table public.roadmap_nodes to authenticated;
grant update (unlock_override, override_reason, overridden_by, overridden_at, updated_at)
  on table public.roadmap_nodes to authenticated;

revoke all on table public.roadmap_node_assignments from public, anon, authenticated;
grant select on table public.roadmap_node_assignments to authenticated;

revoke all on table public.roadmap_node_completions from public, anon, authenticated;
grant select on table public.roadmap_node_completions to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['roadmap_nodes', 'roadmap_node_assignments', 'roadmap_node_completions']
  loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
