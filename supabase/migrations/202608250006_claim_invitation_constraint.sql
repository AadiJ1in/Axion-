-- Use the named relationship key so PL/pgSQL output columns cannot shadow conflict columns.

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

revoke all on function private.claim_care_invitation(text) from public, anon;
grant execute on function private.claim_care_invitation(text) to authenticated;
