-- Defense in depth for the retained, disabled free-text message table.
-- Browser roles also lack table privileges; this explicit policy documents and
-- enforces the intended deny-all state if grants are changed accidentally.

create policy care_messages_browser_access_disabled
on public.care_messages
for all
to anon, authenticated
using (false)
with check (false);
