-- The public security-invoker wrapper calls the private transactional publisher.
-- The private schema is not API-exposed; grant only function execution, never table writes.

grant execute on function private.publish_patient_plan_v3(
  uuid, text, text, text, text, jsonb, integer, integer, boolean
) to authenticated;

