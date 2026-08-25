-- Axion secure connections and patient workflow hardening.
-- Designed to upgrade existing PTpal projects without deleting historical data.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.profiles
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- The original prototype called this column user_id. The product model calls it
-- patient_id everywhere so ownership is explicit and harder to misuse.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercise_sessions' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercise_sessions' and column_name = 'patient_id'
  ) then
    alter table public.exercise_sessions rename column user_id to patient_id;
  end if;
end $$;

alter table public.exercise_sessions
  add column if not exists client_session_id uuid,
  add column if not exists duration_seconds integer check (duration_seconds between 0 and 14400),
  add column if not exists quality_score smallint check (quality_score between 0 and 100);

alter table public.exercise_sessions alter column source drop not null;

create unique index if not exists exercise_sessions_patient_client_session_uidx
  on public.exercise_sessions (patient_id, client_session_id)
  where client_session_id is not null;

create index if not exists exercise_sessions_patient_completed_idx
  on public.exercise_sessions (patient_id, completed_at desc);
create index if not exists prescriptions_patient_status_position_idx
  on public.exercise_prescriptions (patient_id, status, position);
create index if not exists prescriptions_therapist_patient_idx
  on public.exercise_prescriptions (therapist_id, patient_id);
create index if not exists checkins_patient_created_idx
  on public.patient_checkins (patient_id, created_at desc);
create index if not exists alerts_therapist_status_created_idx
  on public.therapist_alerts (therapist_id, status, created_at desc);

create table if not exists public.patient_invites (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.profiles(id) on delete cascade,
  code_hash bytea not null unique,
  target_email_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_by is not null)
);

create index if not exists patient_invites_therapist_created_idx
  on public.patient_invites (therapist_id, created_at desc);
create index if not exists patient_invites_active_expiry_idx
  on public.patient_invites (expires_at)
  where used_at is null and revoked_at is null;

create table if not exists private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  event_type text not null check (char_length(event_type) between 3 and 80),
  subject_id uuid,
  object_type text,
  object_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

revoke all on private.audit_events from public, anon, authenticated;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function private.is_assigned_therapist(target_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.therapist_patients tp
    where tp.therapist_id = (select auth.uid())
      and tp.patient_id = target_patient
      and tp.status = 'active'
  );
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.is_assigned_therapist(uuid) from public;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_assigned_therapist(uuid) to authenticated;

create or replace function private.create_patient_invite(target_email text)
returns table (invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  invite_expiry timestamptz := now() + interval '48 hours';
  normalized_email text := lower(trim(target_email));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if private.current_app_role() is distinct from 'therapist'::public.app_role then
    raise exception 'Only therapists can create patient invitations';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Enter a valid patient email address';
  end if;

  generated_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.patient_invites (
    therapist_id, code_hash, target_email_hash, expires_at
  ) values (
    (select auth.uid()),
    extensions.digest(generated_code, 'sha256'),
    extensions.digest(normalized_email, 'sha256'),
    invite_expiry
  );

  insert into private.audit_events (actor_id, event_type, object_type, metadata)
  values ((select auth.uid()), 'patient_invite_created', 'patient_invite', jsonb_build_object('expires_at', invite_expiry));

  return query select generated_code, invite_expiry;
end;
$$;

create or replace function private.claim_patient_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_invite public.patient_invites%rowtype;
  caller_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if private.current_app_role() is distinct from 'patient'::public.app_role then
    raise exception 'Only patient accounts can claim invitations';
  end if;
  if caller_email = '' then
    raise exception 'A verified account email is required';
  end if;

  select pi.* into matched_invite
  from public.patient_invites pi
  where pi.code_hash = extensions.digest(upper(trim(invite_code)), 'sha256')
    and pi.target_email_hash = extensions.digest(caller_email, 'sha256')
    and pi.used_at is null
    and pi.revoked_at is null
    and pi.expires_at > now()
  for update skip locked;

  if matched_invite.id is null then
    raise exception 'This invitation is invalid, expired, already used, or belongs to another email';
  end if;

  insert into public.therapist_patients (therapist_id, patient_id, status, assigned_at)
  values (matched_invite.therapist_id, (select auth.uid()), 'active', now())
  on conflict (therapist_id, patient_id)
  do update set status = 'active', assigned_at = excluded.assigned_at;

  update public.patient_invites
  set used_at = now(), used_by = (select auth.uid())
  where id = matched_invite.id;

  update public.profiles
  set onboarding_completed = true, updated_at = now()
  where id = (select auth.uid());

  insert into private.audit_events (actor_id, event_type, subject_id, object_type, object_id)
  values ((select auth.uid()), 'patient_invite_claimed', matched_invite.therapist_id, 'patient_invite', matched_invite.id::text);

  return true;
end;
$$;

revoke all on function private.create_patient_invite(text) from public;
revoke all on function private.claim_patient_invite(text) from public;
grant execute on function private.create_patient_invite(text) to authenticated;
grant execute on function private.claim_patient_invite(text) to authenticated;

-- Exposed RPC wrappers are security invoker. Privileged work remains in the
-- non-exposed private schema and validates auth.uid() again before mutation.
create or replace function public.create_patient_invite(target_email text)
returns table (invite_code text, expires_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.create_patient_invite(target_email); $$;

create or replace function public.claim_patient_invite(invite_code text)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.claim_patient_invite(invite_code); $$;

revoke all on function public.create_patient_invite(text) from public, anon;
revoke all on function public.claim_patient_invite(text) from public, anon;
grant execute on function public.create_patient_invite(text) to authenticated;
grant execute on function public.claim_patient_invite(text) to authenticated;

alter table public.patient_invites enable row level security;

drop policy if exists "invites_read_own_therapist" on public.patient_invites;
create policy "invites_read_own_therapist"
on public.patient_invites for select to authenticated
using (therapist_id = (select auth.uid()) and private.current_app_role() = 'therapist'::public.app_role);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "profiles_read_assigned" on public.profiles;
create policy "profiles_read_assigned"
on public.profiles for select to authenticated
using (private.is_assigned_therapist(id));

drop policy if exists "assignments_manage_therapist" on public.therapist_patients;
create policy "assignments_manage_therapist"
on public.therapist_patients for all to authenticated
using (therapist_id = (select auth.uid()) and private.current_app_role() = 'therapist'::public.app_role)
with check (therapist_id = (select auth.uid()) and private.current_app_role() = 'therapist'::public.app_role);

drop policy if exists "plans_manage_therapist" on public.recovery_plans;
create policy "plans_manage_therapist"
on public.recovery_plans for all to authenticated
using (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id))
with check (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id));

drop policy if exists "prescriptions_manage_therapist" on public.exercise_prescriptions;
create policy "prescriptions_manage_therapist"
on public.exercise_prescriptions for all to authenticated
using (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id))
with check (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id));

drop policy if exists "sessions_insert_self" on public.exercise_sessions;
drop policy if exists "sessions_read_self" on public.exercise_sessions;
drop policy if exists "sessions_read_assigned" on public.exercise_sessions;
create policy "sessions_insert_self"
on public.exercise_sessions for insert to authenticated
with check (patient_id = (select auth.uid()) and private.current_app_role() = 'patient'::public.app_role);
create policy "sessions_read_self"
on public.exercise_sessions for select to authenticated
using (patient_id = (select auth.uid()));
create policy "sessions_read_assigned"
on public.exercise_sessions for select to authenticated
using (private.is_assigned_therapist(patient_id));

drop policy if exists "checkins_read_assigned" on public.patient_checkins;
create policy "checkins_read_assigned"
on public.patient_checkins for select to authenticated
using (private.is_assigned_therapist(patient_id));

drop policy if exists "alerts_read_assigned_therapist" on public.therapist_alerts;
drop policy if exists "alerts_update_assigned_therapist" on public.therapist_alerts;
create policy "alerts_read_assigned_therapist"
on public.therapist_alerts for select to authenticated
using (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id));
create policy "alerts_update_assigned_therapist"
on public.therapist_alerts for update to authenticated
using (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id))
with check (therapist_id = (select auth.uid()) and private.is_assigned_therapist(patient_id));

create or replace view public.patient_invite_status
with (security_invoker = true)
as
select id, therapist_id, expires_at, used_at, used_by, revoked_at, created_at
from public.patient_invites;

revoke all on public.patient_invites from anon, authenticated;
revoke all on public.patient_invite_status from anon;
grant select on public.patient_invite_status to authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name, timezone, onboarding_completed, updated_at) on public.profiles to authenticated;

-- A relationship can only be created by the invite claim transaction above.
-- Therapists may still pause or discharge their own existing relationships.
revoke insert, delete on public.therapist_patients from authenticated;
grant select, update on public.therapist_patients to authenticated;

-- Explicit grants are required by Supabase's 2026 Data API exposure defaults.
grant select, insert on public.exercise_sessions to authenticated;
grant select, insert on public.patient_checkins to authenticated;
grant select, insert, update on public.exercise_prescriptions to authenticated;
grant select, insert, update on public.recovery_plans to authenticated;
grant select, insert, update on public.therapist_alerts to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Keep compatibility with any historical policy we did not create, but close
-- the prototype's exposed SECURITY DEFINER helpers as direct API endpoints.
revoke all on function public.current_app_role() from public, anon, authenticated;
revoke all on function public.is_assigned_therapist(uuid) from public, anon, authenticated;
