-- Free-text care messaging is disabled until Axion has an approved,
-- BAA-backed operational environment and a validated PHI communications policy.
-- Existing rows are retained for controlled administrative review; browser roles
-- cannot read, create, or modify them.

revoke all on table public.care_messages from public, anon, authenticated;

drop policy if exists care_messages_read_active_participant on public.care_messages;
drop policy if exists care_messages_insert_active_participant on public.care_messages;
drop policy if exists care_messages_recipient_marks_read on public.care_messages;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'care_messages'
  ) then
    alter publication supabase_realtime drop table public.care_messages;
  end if;
end
$$;

comment on table public.care_messages is
  'Free-text patient messaging disabled for browser roles pending formal PHI communication controls and compliance approval.';
