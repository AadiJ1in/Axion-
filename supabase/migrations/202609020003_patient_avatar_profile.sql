-- Persist a patient-selected, non-photo avatar without widening profile permissions.

alter table public.profiles
  add column if not exists avatar_key text not null default 'pulse';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_key_allowed'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_key_allowed
      check (avatar_key in ('pulse', 'summit', 'orbit', 'trail'));
  end if;
end
$$;

grant update (avatar_key, updated_at) on table public.profiles to authenticated;

comment on column public.profiles.avatar_key is
  'Patient-selected key for one of Axion''s built-in non-photo avatars.';
