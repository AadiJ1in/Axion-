-- RC1 P0: deterministic clinical session identity.
-- Additive migration. Existing historical sessions remain context version 0.

alter table public.exercise_sessions
  add column if not exists plan_id uuid references public.exercise_plans(id) on delete set null,
  add column if not exists session_context_version smallint not null default 0,
  add column if not exists session_identity_context jsonb not null default '{}'::jsonb;

create index if not exists exercise_sessions_plan_idx
  on public.exercise_sessions (plan_id, created_at desc);

alter table public.exercise_sessions
  drop constraint if exists exercise_sessions_identity_context_object_check;
alter table public.exercise_sessions
  add constraint exercise_sessions_identity_context_object_check
  check (jsonb_typeof(session_identity_context) = 'object');

create or replace function private.verify_and_snapshot_session_identity_rc1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_assignment public.exercise_assignments%rowtype;
  v_plan public.exercise_plans%rowtype;
  v_node public.roadmap_nodes%rowtype;
  v_existing public.exercise_sessions%rowtype;
  v_completed_for_plan integer := 0;
  v_has_roadmap boolean := false;
begin
  if v_actor is null or new.patient_id is distinct from v_actor then
    raise exception 'AXION_SESSION_IDENTITY_UNAUTHORIZED' using errcode = '42501';
  end if;

  if new.assignment_id is null or new.client_session_id is null or nullif(trim(new.exercise_key), '') is null then
    raise exception 'AXION_ASSIGNMENT_CONTEXT_MISSING' using errcode = '22023';
  end if;

  -- Idempotent retries must remain retryable after the first insert has already
  -- completed a roadmap node. A different identity reusing the same client UUID
  -- is rejected rather than being treated as the existing session.
  select * into v_existing
  from public.exercise_sessions es
  where es.patient_id = new.patient_id and es.client_session_id = new.client_session_id
  limit 1;
  if found then
    if v_existing.assignment_id is distinct from new.assignment_id
       or v_existing.exercise_key is distinct from new.exercise_key
       or v_existing.roadmap_node_id is distinct from new.roadmap_node_id
       or (new.plan_id is not null and v_existing.plan_id is distinct from new.plan_id) then
      raise exception 'AXION_ASSIGNMENT_CONTEXT_MISMATCH' using errcode = '22023';
    end if;
    return new; -- the unique index produces 23505; the client resolves the saved row.
  end if;

  select ea.* into v_assignment
  from public.exercise_assignments ea
  where ea.id = new.assignment_id;
  if not found then
    raise exception 'AXION_ASSIGNMENT_CONTEXT_MISMATCH' using errcode = '22023';
  end if;

  select ep.* into v_plan
  from public.exercise_plans ep
  where ep.id = v_assignment.plan_id;
  if not found or v_plan.patient_id is distinct from v_actor then
    raise exception 'AXION_ASSIGNMENT_CONTEXT_MISMATCH' using errcode = '42501';
  end if;
  if v_plan.status <> 'active' then
    raise exception 'AXION_PLAN_INACTIVE' using errcode = '22023';
  end if;
  if v_assignment.status <> 'active' then
    raise exception 'AXION_ASSIGNMENT_INACTIVE' using errcode = '22023';
  end if;
  if new.exercise_key is distinct from v_assignment.exercise_key then
    raise exception 'AXION_ASSIGNMENT_CONTEXT_MISMATCH' using errcode = '22023';
  end if;
  if new.plan_id is not null and new.plan_id is distinct from v_plan.id then
    raise exception 'AXION_ASSIGNMENT_CONTEXT_MISMATCH' using errcode = '22023';
  end if;
  new.plan_id := v_plan.id;

  select exists(
    select 1 from public.roadmap_nodes rn where rn.plan_id = v_plan.id
  ) into v_has_roadmap;

  if v_has_roadmap then
    if new.roadmap_node_id is null then
      raise exception 'AXION_ROADMAP_CONTEXT_MISSING' using errcode = '22023';
    end if;

    select rn.* into v_node
    from public.roadmap_nodes rn
    where rn.id = new.roadmap_node_id
      and rn.plan_id = v_plan.id
      and exists (
        select 1 from public.roadmap_node_assignments rna
        where rna.roadmap_node_id = rn.id and rna.assignment_id = v_assignment.id
      );
    if not found then
      raise exception 'AXION_ROADMAP_NODE_STALE' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.roadmap_node_completions rnc
      where rnc.roadmap_node_id = v_node.id and rnc.patient_id = v_actor
    ) then
      raise exception 'AXION_ROADMAP_NODE_STALE' using errcode = '22023';
    end if;

    select count(*) into v_completed_for_plan
    from public.roadmap_node_completions rnc
    join public.roadmap_nodes completed_node on completed_node.id = rnc.roadmap_node_id
    where completed_node.plan_id = v_plan.id and rnc.patient_id = v_actor;

    if not v_node.unlock_override and v_node.session_number > v_completed_for_plan + 1 then
      raise exception 'AXION_ROADMAP_NODE_STALE' using errcode = '22023';
    end if;
  elsif new.roadmap_node_id is not null then
    raise exception 'AXION_ROADMAP_NODE_STALE' using errcode = '22023';
  end if;

  if new.started_at is null then
    raise exception 'AXION_SESSION_START_MISSING' using errcode = '22023';
  end if;

  new.session_context_version := 1;
  new.session_identity_context := jsonb_build_object(
    'version', 1,
    'patient_id', v_actor,
    'plan_id', v_plan.id,
    'assignment_id', v_assignment.id,
    'roadmap_node_id', new.roadmap_node_id,
    'exercise_key', v_assignment.exercise_key,
    'tracking_mode', v_assignment.tracking_mode,
    'prescribed_sets', v_assignment.target_sets,
    'prescribed_reps', v_assignment.target_repetitions,
    'prescribed_hold_seconds', v_assignment.duration_seconds,
    'rest_seconds', v_assignment.rest_seconds,
    'client_session_id', new.client_session_id,
    'movement_profile_id', v_assignment.exercise_key || ':' || v_assignment.tracking_mode || ':rc1-profile-v1',
    'started_at', new.started_at,
    'exercise_mode', v_assignment.exercise_mode,
    'prescribed_side', v_assignment.prescribed_side,
    'prescription_version', v_assignment.updated_at,
    'plan_version', v_plan.updated_at,
    'roadmap_version', case when new.roadmap_node_id is null then null else v_node.updated_at end
  );

  return new;
end;
$$;

revoke all on function private.verify_and_snapshot_session_identity_rc1() from public;

-- Trigger is defense-in-depth in addition to the existing patient INSERT RLS.
drop trigger if exists exercise_session_verify_identity_rc1 on public.exercise_sessions;
create trigger exercise_session_verify_identity_rc1
  before insert on public.exercise_sessions
  for each row execute function private.verify_and_snapshot_session_identity_rc1();

comment on column public.exercise_sessions.session_context_version is
  '0 = historical/legacy row; 1 = RC1 server-verified immutable assignment context.';
comment on column public.exercise_sessions.session_identity_context is
  'Server-generated non-display identity snapshot for reproducibility; clients must not treat this as free-form input.';
