-- Production hardening for Axion's patient/therapist workflows.
-- Sensitive multi-table mutations are transactional RPCs and invitation codes are hashed at rest.

create table if not exists private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null check (char_length(target_type) between 1 and 80),
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

revoke all on table private.audit_events from public, anon, authenticated;

alter table public.exercise_sessions
  add column if not exists duration_seconds integer,
  add column if not exists client_session_id uuid;

update public.exercise_sessions
set client_session_id = gen_random_uuid()
where client_session_id is null;

alter table public.exercise_sessions
  alter column client_session_id set not null;

create unique index if not exists exercise_sessions_patient_client_key
  on public.exercise_sessions (patient_id, client_session_id);

alter table public.exercise_sessions
  drop constraint if exists exercise_sessions_duration_seconds_check,
  add constraint exercise_sessions_duration_seconds_check
    check (duration_seconds is null or duration_seconds between 0 and 14400),
  drop constraint if exists exercise_sessions_summary_object_check,
  add constraint exercise_sessions_summary_object_check
    check (jsonb_typeof(movement_summary) = 'object'),
  drop constraint if exists exercise_sessions_summary_size_check,
  add constraint exercise_sessions_summary_size_check
    check (octet_length(movement_summary::text) <= 16384),
  drop constraint if exists exercise_sessions_time_order_check,
  add constraint exercise_sessions_time_order_check
    check (started_at is null or completed_at is null or completed_at >= started_at);

alter table public.rep_metrics
  drop constraint if exists rep_metrics_rep_number_check,
  add constraint rep_metrics_rep_number_check check (rep_number between 1 and 500),
  drop constraint if exists rep_metrics_depth_check,
  add constraint rep_metrics_depth_check check (depth is null or depth between 0 and 180),
  drop constraint if exists rep_metrics_tempo_check,
  add constraint rep_metrics_tempo_check check (tempo_seconds is null or tempo_seconds between 0 and 120),
  drop constraint if exists rep_metrics_symmetry_check,
  add constraint rep_metrics_symmetry_check check (symmetry_delta is null or symmetry_delta between 0 and 180),
  drop constraint if exists rep_metrics_confidence_check,
  add constraint rep_metrics_confidence_check check (confidence is null or confidence between 0 and 1),
  drop constraint if exists rep_metrics_payload_size_check,
  add constraint rep_metrics_payload_size_check check (octet_length(metrics::text) <= 4096);

alter table public.therapist_notes
  drop constraint if exists therapist_notes_length_check,
  add constraint therapist_notes_length_check check (char_length(note) between 1 and 4000);

-- Replace plaintext invitation codes with one-way SHA-256 hashes.
alter table public.care_invitations
  add column if not exists invite_code_hash bytea;

update public.care_invitations
set invite_code_hash = extensions.digest(invite_code, 'sha256')
where invite_code_hash is null;

alter table public.care_invitations
  alter column invite_code_hash set not null,
  drop constraint if exists care_invitations_invite_code_key,
  drop constraint if exists care_invitations_invite_code_check,
  drop column if exists invite_code;

create unique index if not exists care_invitations_code_hash_key
  on public.care_invitations (invite_code_hash);

create or replace function private.create_care_invitation(p_patient_email text)
returns table (invite_code text, patient_email text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text := lower(trim(coalesce(p_patient_email, '')));
  v_code text := upper(encode(extensions.gen_random_bytes(10), 'hex'));
  v_expires_at timestamptz := now() + interval '48 hours';
  v_invitation_id uuid;
begin
  if v_actor is null or (select private.current_app_role()) <> 'therapist'::public.app_role then
    raise exception 'Only verified therapist accounts can create invitations.' using errcode = '42501';
  end if;

  if char_length(v_email) < 3 or char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid patient email address.' using errcode = '22023';
  end if;

  update public.care_invitations ci
  set status = 'revoked', updated_at = now()
  where ci.therapist_id = v_actor and ci.patient_email = v_email and ci.status = 'sent';

  insert into public.care_invitations (
    therapist_id, patient_email, invite_code_hash, status, expires_at
  ) values (
    v_actor, v_email, extensions.digest(v_code, 'sha256'), 'sent', v_expires_at
  ) returning id into v_invitation_id;

  insert into private.audit_events (actor_id, action, target_type, target_id, metadata)
  values (v_actor, 'care_invitation_created', 'care_invitation', v_invitation_id::text,
          jsonb_build_object('expires_at', v_expires_at));

  return query select v_code, v_email, v_expires_at;
end;
$$;

create or replace function private.claim_care_invitation(p_invite_code text)
returns table (therapist_id uuid, patient_id uuid, status text, invitation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text := lower(trim(coalesce((select auth.jwt()) ->> 'email', '')));
  v_code text := upper(regexp_replace(coalesce(p_invite_code, ''), '[^A-Z0-9]', '', 'g'));
  v_invitation public.care_invitations%rowtype;
begin
  if v_actor is null or (select private.current_app_role()) <> 'patient'::public.app_role then
    raise exception 'Only signed-in patient accounts can claim invitations.' using errcode = '42501';
  end if;

  if char_length(v_code) <> 20 or v_email = '' then
    raise exception 'That invitation is invalid, expired, or belongs to another email.' using errcode = '22023';
  end if;

  select ci.* into v_invitation
  from public.care_invitations ci
  where ci.invite_code_hash = extensions.digest(v_code, 'sha256')
    and ci.patient_email = v_email
    and ci.status = 'sent'
    and ci.expires_at > now()
  for update;

  if not found then
    raise exception 'That invitation is invalid, expired, or belongs to another email.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.therapist_patients tp
    where tp.patient_id = v_actor and tp.status in ('active', 'pending_verification')
  ) then
    raise exception 'This patient account already has a current care-team connection.' using errcode = '23505';
  end if;

  update public.care_invitations
  set status = 'claimed', patient_id = v_actor, claimed_at = now(), updated_at = now()
  where id = v_invitation.id;

  insert into public.therapist_patients (
    therapist_id, patient_id, invitation_id, status, patient_confirmed_at, therapist_verified_at, updated_at
  ) values (
    v_invitation.therapist_id, v_actor, v_invitation.id, 'pending_verification', now(), null, now()
  )
  on conflict on constraint therapist_patients_pkey do update
    set invitation_id = excluded.invitation_id,
        status = 'pending_verification',
        patient_confirmed_at = excluded.patient_confirmed_at,
        therapist_verified_at = null,
        updated_at = now()
    where public.therapist_patients.status in ('rejected', 'inactive');

  insert into private.audit_events (actor_id, action, target_type, target_id)
  values (v_actor, 'care_invitation_claimed', 'care_invitation', v_invitation.id::text);

  return query
  select v_invitation.therapist_id, v_actor, 'pending_verification'::text, v_invitation.id;
end;
$$;

create or replace function private.approve_patient_connection(
  p_patient_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or (select private.current_app_role()) <> 'therapist'::public.app_role then
    raise exception 'Only verified therapist accounts can approve patients.' using errcode = '42501';
  end if;

  update public.therapist_patients
  set status = 'active', therapist_verified_at = now(), updated_at = now()
  where therapist_id = v_actor
    and patient_id = p_patient_id
    and invitation_id = p_invitation_id
    and status = 'pending_verification';

  if not found then
    raise exception 'That pending patient connection was not found.' using errcode = 'P0002';
  end if;

  update public.care_invitations
  set status = 'approved', approved_at = now(), updated_at = now()
  where id = p_invitation_id
    and therapist_id = v_actor
    and patient_id = p_patient_id
    and status = 'claimed';

  if not found then
    raise exception 'The matching claimed invitation was not found.' using errcode = 'P0002';
  end if;

  insert into private.audit_events (actor_id, action, target_type, target_id,
                                    metadata)
  values (v_actor, 'patient_connection_approved', 'patient', p_patient_id::text,
          jsonb_build_object('invitation_id', p_invitation_id));

  return true;
end;
$$;

create or replace function private.publish_patient_plan(
  p_patient_id uuid,
  p_title text,
  p_program_label text,
  p_phase_label text,
  p_instructions text,
  p_exercise_keys text[],
  p_sets integer,
  p_repetitions integer,
  p_duration_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_id uuid;
  v_key text;
  v_name text;
  v_tracking_mode text;
  v_sequence integer := 0;
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

  if coalesce(array_length(p_exercise_keys, 1), 0) not between 1 and 3
     or p_sets not between 1 and 20
     or p_repetitions not between 1 and 500
     or p_duration_seconds not between 5 and 3600
     or char_length(trim(coalesce(p_title, ''))) not between 1 and 120
     or char_length(trim(coalesce(p_program_label, ''))) not between 1 and 80
     or char_length(trim(coalesce(p_phase_label, ''))) not between 1 and 80
     or char_length(coalesce(p_instructions, '')) > 2000 then
    raise exception 'Review the plan fields and exercise dosage.' using errcode = '22023';
  end if;

  if (select count(distinct key) from unnest(p_exercise_keys) as key)
     <> array_length(p_exercise_keys, 1) then
    raise exception 'Each exercise can appear only once in a plan.' using errcode = '22023';
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

  foreach v_key in array p_exercise_keys loop
    v_sequence := v_sequence + 1;
    v_key := lower(trim(v_key));
    case v_key
      when 'bodyweight_squat' then v_name := 'Bodyweight Squat'; v_tracking_mode := 'pose_reps';
      when 'wall_sit' then v_name := 'Wall Sit'; v_tracking_mode := 'timed_hold';
      when 'heel_raise' then v_name := 'Heel Raises'; v_tracking_mode := 'guided_reps';
      when 'single_leg_balance' then v_name := 'Single-leg Balance'; v_tracking_mode := 'timed_hold';
      when 'step_up' then v_name := 'Step-ups'; v_tracking_mode := 'guided_reps';
      else raise exception 'Unsupported exercise in plan.' using errcode = '22023';
    end case;

    insert into public.exercise_assignments (
      plan_id, exercise_key, display_name, sequence, tracking_mode,
      target_sets, target_repetitions, duration_seconds, instructions, status, updated_at
    ) values (
      v_plan_id, v_key, v_name, v_sequence, v_tracking_mode,
      p_sets, p_repetitions,
      case when v_tracking_mode = 'timed_hold' then p_duration_seconds else null end,
      nullif(trim(coalesce(p_instructions, '')), ''), 'active', now()
    );
  end loop;

  insert into public.roadmap_stages (plan_id, stage_number, title, detail, status, unlock_after_sessions)
  values
    (v_plan_id, 1, 'Baseline', 'Establish a comfortable movement baseline.', 'current', 0),
    (v_plan_id, 2, 'Control', 'Build repeatable movement control.', 'locked', 3),
    (v_plan_id, 3, 'Capacity', 'Progress volume under therapist guidance.', 'locked', 8),
    (v_plan_id, 4, 'Return', 'Complete therapist-defined return milestones.', 'locked', 14);

  insert into private.audit_events (actor_id, action, target_type, target_id,
                                    metadata)
  values (v_actor, 'patient_plan_published', 'exercise_plan', v_plan_id::text,
          jsonb_build_object('patient_id', p_patient_id, 'exercise_count', array_length(p_exercise_keys, 1)));

  return v_plan_id;
end;
$$;

-- Public Data API wrappers remain security-invoker; the privileged implementation stays private.
create or replace function public.create_care_invitation(p_patient_email text)
returns table (invite_code text, patient_email text, expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.create_care_invitation(p_patient_email); $$;

create or replace function public.claim_care_invitation(p_invite_code text)
returns table (therapist_id uuid, patient_id uuid, status text, invitation_id uuid)
language sql
security invoker
set search_path = ''
as $$ select * from private.claim_care_invitation(p_invite_code); $$;

create or replace function public.approve_patient_connection(p_patient_id uuid, p_invitation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.approve_patient_connection(p_patient_id, p_invitation_id); $$;

create or replace function public.publish_patient_plan(
  p_patient_id uuid,
  p_title text,
  p_program_label text,
  p_phase_label text,
  p_instructions text,
  p_exercise_keys text[],
  p_sets integer,
  p_repetitions integer,
  p_duration_seconds integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.publish_patient_plan(
    p_patient_id, p_title, p_program_label, p_phase_label, p_instructions,
    p_exercise_keys, p_sets, p_repetitions, p_duration_seconds
  );
$$;

revoke all on function private.create_care_invitation(text) from public, anon;
revoke all on function private.claim_care_invitation(text) from public, anon;
revoke all on function private.approve_patient_connection(uuid, uuid) from public, anon;
revoke all on function private.publish_patient_plan(uuid, text, text, text, text, text[], integer, integer, integer) from public, anon;
grant execute on function private.create_care_invitation(text) to authenticated;
grant execute on function private.claim_care_invitation(text) to authenticated;
grant execute on function private.approve_patient_connection(uuid, uuid) to authenticated;
grant execute on function private.publish_patient_plan(uuid, text, text, text, text, text[], integer, integer, integer) to authenticated;

revoke all on function public.create_care_invitation(text) from public, anon, authenticated;
revoke all on function public.claim_care_invitation(text) from public, anon, authenticated;
revoke all on function public.approve_patient_connection(uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_patient_plan(uuid, text, text, text, text, text[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.create_care_invitation(text) to authenticated;
grant execute on function public.claim_care_invitation(text) to authenticated;
grant execute on function public.approve_patient_connection(uuid, uuid) to authenticated;
grant execute on function public.publish_patient_plan(uuid, text, text, text, text, text[], integer, integer, integer) to authenticated;

-- Direct mutations for multi-table workflows are disabled; RPCs above are the only write path.
revoke all on table public.care_invitations from anon, authenticated;
revoke insert, update, delete on table public.therapist_patients from authenticated;
revoke insert, update, delete on table public.exercise_plans from authenticated;
revoke insert, update, delete on table public.exercise_assignments from authenticated;
revoke insert, update, delete on table public.roadmap_stages from authenticated;
grant select on table public.therapist_patients, public.exercise_plans,
  public.exercise_assignments, public.roadmap_stages to authenticated;

-- Collapse permissive SELECT policies and use init-plans for auth helpers.
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists patients_read_connected_therapist on public.profiles;
drop policy if exists therapists_read_assigned_patients on public.profiles;
create policy profiles_read_authorized on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    role = 'therapist'::public.app_role
    and exists (
      select 1 from public.therapist_patients tp
      where tp.patient_id = (select auth.uid())
        and tp.therapist_id = profiles.id
        and tp.status in ('pending_verification', 'active')
    )
  )
  or (
    (select private.current_app_role()) = 'therapist'::public.app_role
    and exists (
      select 1 from public.therapist_patients tp
      where tp.therapist_id = (select auth.uid())
        and tp.patient_id = profiles.id
        and tp.status in ('pending_verification', 'active')
    )
  )
);

drop policy if exists patients_read_own_relationship on public.therapist_patients;
drop policy if exists therapists_read_own_assignments on public.therapist_patients;
drop policy if exists patients_request_invited_relationship on public.therapist_patients;
drop policy if exists therapists_update_own_relationships on public.therapist_patients;
create policy relationships_read_participant on public.therapist_patients for select to authenticated
using (patient_id = (select auth.uid()) or therapist_id = (select auth.uid()));

drop policy if exists patients_read_own_plans on public.exercise_plans;
drop policy if exists therapists_read_own_plans on public.exercise_plans;
drop policy if exists therapists_create_plans_for_assigned_patients on public.exercise_plans;
drop policy if exists therapists_update_own_plans on public.exercise_plans;
create policy plans_read_participant on public.exercise_plans for select to authenticated
using (patient_id = (select auth.uid()) or therapist_id = (select auth.uid()));

drop policy if exists patients_read_own_assignments on public.exercise_assignments;
drop policy if exists therapists_read_own_assignments on public.exercise_assignments;
drop policy if exists therapists_create_assignments_for_own_plans on public.exercise_assignments;
drop policy if exists therapists_update_own_assignments on public.exercise_assignments;
create policy assignments_read_participant on public.exercise_assignments for select to authenticated
using (
  exists (
    select 1 from public.exercise_plans ep
    where ep.id = exercise_assignments.plan_id
      and (ep.patient_id = (select auth.uid()) or ep.therapist_id = (select auth.uid()))
  )
);

drop policy if exists patients_read_own_roadmap on public.roadmap_stages;
drop policy if exists therapists_read_own_roadmap on public.roadmap_stages;
drop policy if exists therapists_create_own_roadmap on public.roadmap_stages;
drop policy if exists therapists_update_own_roadmap on public.roadmap_stages;
create policy roadmap_read_participant on public.roadmap_stages for select to authenticated
using (
  exists (
    select 1 from public.exercise_plans ep
    where ep.id = roadmap_stages.plan_id
      and (ep.patient_id = (select auth.uid()) or ep.therapist_id = (select auth.uid()))
  )
);

drop policy if exists patients_insert_own_sessions on public.exercise_sessions;
drop policy if exists patients_read_own_sessions on public.exercise_sessions;
drop policy if exists therapists_read_assigned_sessions on public.exercise_sessions;
create policy sessions_insert_assigned_patient on public.exercise_sessions for insert to authenticated
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
);
create policy sessions_read_authorized on public.exercise_sessions for select to authenticated
using (
  patient_id = (select auth.uid())
  or (
    (select private.current_app_role()) = 'therapist'::public.app_role
    and exists (
      select 1 from public.therapist_patients tp
      where tp.therapist_id = (select auth.uid())
        and tp.patient_id = exercise_sessions.patient_id
        and tp.status = 'active'
    )
  )
);

drop policy if exists patients_insert_own_rep_metrics on public.rep_metrics;
drop policy if exists patients_read_own_rep_metrics on public.rep_metrics;
drop policy if exists therapists_read_assigned_rep_metrics on public.rep_metrics;
create policy rep_metrics_insert_session_owner on public.rep_metrics for insert to authenticated
with check (
  exists (
    select 1 from public.exercise_sessions es
    where es.id = rep_metrics.session_id and es.patient_id = (select auth.uid())
  )
);
create policy rep_metrics_read_authorized on public.rep_metrics for select to authenticated
using (
  exists (
    select 1
    from public.exercise_sessions es
    where es.id = rep_metrics.session_id
      and (
        es.patient_id = (select auth.uid())
        or exists (
          select 1 from public.therapist_patients tp
          where tp.therapist_id = (select auth.uid())
            and tp.patient_id = es.patient_id
            and tp.status = 'active'
            and (select private.current_app_role()) = 'therapist'::public.app_role
        )
      )
  )
);

drop policy if exists therapists_create_notes_for_assigned_patients on public.therapist_notes;
drop policy if exists therapists_read_notes_for_assigned_patients on public.therapist_notes;
create policy therapist_notes_insert_assigned on public.therapist_notes for insert to authenticated
with check (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = (select auth.uid())
      and tp.patient_id = therapist_notes.patient_id
      and tp.status = 'active'
  )
  and (
    session_id is null
    or exists (
      select 1 from public.exercise_sessions es
      where es.id = therapist_notes.session_id and es.patient_id = therapist_notes.patient_id
    )
  )
);
create policy therapist_notes_read_assigned on public.therapist_notes for select to authenticated
using (
  therapist_id = (select auth.uid())
  and (select private.current_app_role()) = 'therapist'::public.app_role
  and exists (
    select 1 from public.therapist_patients tp
    where tp.therapist_id = (select auth.uid())
      and tp.patient_id = therapist_notes.patient_id
      and tp.status = 'active'
  )
);

drop policy if exists therapists_read_own_invitations on public.care_invitations;
drop policy if exists therapists_create_own_invitations on public.care_invitations;
drop policy if exists therapists_update_own_invitations on public.care_invitations;
drop policy if exists patients_read_email_invitations on public.care_invitations;

-- The self-profile policy was the final remaining unwrapped auth.uid() call.
drop policy if exists profiles_read_self on public.profiles;
