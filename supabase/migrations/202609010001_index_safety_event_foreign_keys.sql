-- Cover safety-event and therapist-alert foreign keys used by review workflows.
create index if not exists patient_safety_events_session_idx
  on public.patient_safety_events (session_id)
  where session_id is not null;

create index if not exists therapist_alerts_patient_created_idx
  on public.therapist_alerts (patient_id, created_at desc);
