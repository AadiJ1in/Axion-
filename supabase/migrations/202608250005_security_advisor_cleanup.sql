-- Correct the invitation helper's output-column ambiguity and make intentional deny-all RLS explicit.

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

revoke all on function private.create_care_invitation(text) from public, anon;
grant execute on function private.create_care_invitation(text) to authenticated;

drop policy if exists care_invitations_deny_direct_access on public.care_invitations;
create policy care_invitations_deny_direct_access
on public.care_invitations for all to authenticated
using (false)
with check (false);
