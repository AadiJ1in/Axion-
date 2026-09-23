import { supabase } from "./supabase.js";

const FORBIDDEN_RESULT_KEYS = /(^|_)(raw|video|image|frame|landmark|bitmap|blob|base64|data_url)($|_)/i;

function assertDerivedOnly(value, path = "result") {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDerivedOnly(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_RESULT_KEYS.test(key)) throw new Error(`Clinical evaluation result contains prohibited raw capture field: ${path}.${key}`);
    assertDerivedOnly(child, `${path}.${key}`);
  });
}

export function buildClinicalEvaluationRecord({
  patientId,
  therapistId,
  evaluationType,
  result,
  captureContext = {},
  completedAt = new Date().toISOString(),
  protocolVersion = 1,
}) {
  if (!patientId || !therapistId || !evaluationType) throw new Error("Patient, therapist and evaluation type are required.");
  assertDerivedOnly(result || {});
  assertDerivedOnly(captureContext || {}, "capture_context");
  return Object.freeze({
    patient_id: patientId,
    therapist_id: therapistId,
    evaluation_type: evaluationType,
    protocol_version: protocolVersion,
    result: result || {},
    capture_context: captureContext || {},
    completed_at: completedAt,
  });
}

export async function listAuthorizedEvaluationPatients() {
  if (!supabase) return [];
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) throw userError || new Error("Therapist session is unavailable.");
  const therapistId = userData.user.id;
  const { data: relationships, error: relationshipError } = await supabase
    .from("therapist_patients")
    .select("patient_id")
    .eq("therapist_id", therapistId)
    .eq("status", "active");
  if (relationshipError) throw relationshipError;
  const ids = [...new Set((relationships || []).map((row) => row.patient_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", ids)
    .order("display_name", { ascending: true });
  if (profileError) throw profileError;
  return (profiles || []).map((profile) => Object.freeze({ id: profile.id, displayName: profile.display_name || "Patient" }));
}

export async function saveClinicalEvaluationResult({ patientId, evaluationType, result, captureContext = {}, completedAt }) {
  if (!supabase) throw new Error("Clinical evaluation storage is unavailable.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) throw userError || new Error("Therapist session is unavailable.");
  const record = buildClinicalEvaluationRecord({
    patientId,
    therapistId: userData.user.id,
    evaluationType,
    result,
    captureContext,
    completedAt,
  });
  const { data, error } = await supabase
    .from("clinical_evaluation_results")
    .insert(record)
    .select("id,patient_id,therapist_id,evaluation_type,protocol_version,result,capture_context,completed_at,created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function listClinicalEvaluationResults(patientId, { evaluationType = null, limit = 50 } = {}) {
  if (!supabase || !patientId) return [];
  let query = supabase
    .from("clinical_evaluation_results")
    .select("id,patient_id,therapist_id,evaluation_type,protocol_version,result,capture_context,completed_at,created_at")
    .eq("patient_id", patientId)
    .order("completed_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));
  if (evaluationType) query = query.eq("evaluation_type", evaluationType);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Read derived movement summaries already authorized by exercise_sessions RLS.
 * The therapist-facing longitudinal view never requests raw camera media or raw
 * pose landmarks. RLS remains the source of truth for patient access.
 */
export async function listPatientBiomechanicsSessions(patientId, { exerciseKey = null, limit = 120 } = {}) {
  if (!supabase || !patientId) return [];
  let query = supabase
    .from("exercise_sessions")
    .select("id,patient_id,exercise_key,movement_summary,started_at,completed_at,created_at,session_identity_context")
    .eq("patient_id", patientId)
    .not("movement_summary", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(Math.max(1, Math.min(300, Number(limit) || 120)));
  if (exerciseKey) query = query.eq("exercise_key", exerciseKey);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((row) => row?.movement_summary?.biomechanics_v2 || row?.movement_summary?.biomechanics_v1);
}
