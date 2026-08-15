-- AXION NONCLINICAL MVP
-- Use a NEW Supabase project. This schema is for synthetic/nonclinical data only.

create type public.app_role as enum ('patient', 'therapist');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role public.app_role not null default 'patient',
  created_at timestamptz not null default now()
);

create table public.exercise_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_key text not null check (exercise_key in ('bodyweight_squat_poc')),
  repetitions integer not null check (repetitions between 0 and 500),
  source text not null check (source = 'mediapipe_browser_poc'),
  movement_summary jsonb not null default '{}'::jsonb,
  difficulty smallint check (difficulty between 1 and 5),
  discomfort text check (discomfort in ('none', 'mild', 'moderate', 'stop')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Demo Patient'), 'patient');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

alter table public.profiles enable row level security;
alter table public.exercise_sessions enable row level security;

create policy "profiles_read_self" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_read_therapist" on public.profiles for select to authenticated using (public.current_app_role() = 'therapist');

create policy "sessions_insert_self" on public.exercise_sessions for insert to authenticated
with check (user_id = auth.uid() and public.current_app_role() = 'patient');

create policy "sessions_read_self" on public.exercise_sessions for select to authenticated using (user_id = auth.uid());
create policy "sessions_read_therapist" on public.exercise_sessions for select to authenticated using (public.current_app_role() = 'therapist');

revoke all on table public.profiles from anon;
revoke all on table public.exercise_sessions from anon;
grant select on table public.profiles to authenticated;
grant select, insert on table public.exercise_sessions to authenticated;

-- Promote a therapist only through a trusted administrative channel:
-- update public.profiles
-- set role = 'therapist'
-- where id = (select id from auth.users where email = 'therapist@example.com');
