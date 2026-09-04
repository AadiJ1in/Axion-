-- The public security-invoker wrapper calls the privileged implementation.
-- Direct API exposure remains blocked because the private schema is not exposed;
-- the implementation still enforces the live therapist AAL2 role and active
-- therapist/patient relationship through publish_patient_plan_v3/v2.
grant execute on function private.publish_patient_plan_v4(uuid,text,text,text,text,jsonb,integer,integer,boolean)
  to authenticated;
