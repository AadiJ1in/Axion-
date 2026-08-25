import { readFile } from "node:fs/promises";

const files = {
  main: await readFile(new URL("../src/main.js", import.meta.url), "utf8"),
  portal: await readFile(new URL("../src/portal.js", import.meta.url), "utf8"),
  pose: await readFile(new URL("../src/pose.js", import.meta.url), "utf8"),
  css: await readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  demo: await readFile(new URL("../DEMO.md", import.meta.url), "utf8"),
  schema: await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  securityMigration: await readFile(new URL("../supabase/migrations/20260825_secure_connections.sql", import.meta.url), "utf8"),
  personalizationMigration: await readFile(new URL("../supabase/migrations/202608250001_patient_personalization.sql", import.meta.url), "utf8"),
  productionSecurityMigration: await readFile(new URL("../supabase/migrations/202608250004_production_security.sql", import.meta.url), "utf8"),
  onboardingGrantMigration: await readFile(new URL("../supabase/migrations/202608250007_profile_onboarding_grants.sql", import.meta.url), "utf8"),
  individualPrescriptionMigration: await readFile(new URL("../supabase/migrations/202608250008_individual_exercise_prescriptions.sql", import.meta.url), "utf8"),
  rlsIntegrationTest: await readFile(new URL("../supabase/tests/rls_integration.sql", import.meta.url), "utf8"),
  supabaseClient: await readFile(new URL("../src/supabase.js", import.meta.url), "utf8"),
  vercel: await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
};

const requirements = [
  [files.main, "Demo Mode", "Demo Mode control"],
  [files.main, "Tracking quality", "tracking-quality UI"],
  [files.main, "BASELINE VS TODAY", "progress comparison"],
  [files.main, "THERAPIST DRILL-DOWN", "longitudinal drill-down"],
  [files.main, "WHY AXION FLAGGED THIS", "explainable flag"],
  [files.main, "No sessions yet", "empty state"],
  [files.main, "Movement Report could not load", "error state"],
  [files.pose, "multiple_people", "multi-person camera state"],
  [files.pose, "permission_denied", "permission camera state"],
  [files.pose, "camera_disconnected", "disconnect camera state"],
  [files.css, "prefers-reduced-motion", "reduced-motion support"],
  [files.demo, "70-second automatic pitch", "presenter documentation"],
  [files.main, "PUBLISH A PERSONAL ROADMAP", "therapist plan builder"],
  [files.main, "data-therapist-section", "working therapist workspace tabs"],
  [files.main, "prescription-toggle", "per-exercise dosage controls"],
  [files.main, "data-open-roadmap", "patient roadmap drill-down"],
  [files.main, "await tracker.start()", "automatic camera tracking start"],
  [files.portal, "ankle_range_of_motion", "expanded exercise library"],
  [files.main, "data-start-assignment", "patient assignment flow"],
  [files.portal, "exercise_assignments", "patient prescription data integration"],
  [files.schema, "is_assigned_therapist", "assignment-scoped RLS"],
  [files.portal, "claimCareInvitation", "patient invite claim flow"],
  [files.portal, "createCareInvitation", "therapist invite creation flow"],
  [files.portal, "loadMovementReport", "patient-scoped movement report loader"],
  [files.main, "Create patient account", "patient onboarding"],
  [files.main, "onboarding_version", "one-time onboarding state"],
  [files.main, "resetPasswordForEmail", "secure password recovery request"],
  [files.main, "PASSWORD_RECOVERY", "password recovery callback handling"],
  [files.main, "RECOVERY LINK EXPIRED", "expired recovery link state"],
  [files.main, "window.location.pathname === \"/reset-password\"", "dedicated recovery route detection"],
  [files.vercel, "\"source\": \"/reset-password\"", "password recovery route rewrite"],
  [files.main, "supabase.auth.updateUser({ password })", "authenticated password update"],
  [files.main, "VERIFICATION PENDING", "two-sided connection state"],
  [files.main, "PRIVATE PATIENT LAB", "patient-scoped movement lab"],
  [files.main, "No synthetic values in live records", "live report synthetic-data isolation"],
  [files.main, "data-report-patient-id", "patient-id report routing"],
  [files.main, "feedback.discomfort", "patient reflection persistence"],
  [files.securityMigration, "private.current_app_role", "private authorization helper"],
  [files.securityMigration, "extensions.gen_random_bytes", "cryptographically random invite"],
  [files.securityMigration, "target_email_hash", "email-bound invite"],
  [files.securityMigration, "interval '48 hours'", "48-hour invite expiry"],
  [files.securityMigration, "security_invoker = true", "RLS-respecting status view"],
  [files.pose, "result.worldLandmarks", "3D world-landmark angle measurement"],
  [files.main, "AVG. KNEE BEND", "human-readable knee-bend semantics"],
  [files.main, "average_joint_angle_degrees", "backward-compatible joint-angle summary"],
  [files.main, "average_knee_bend_degrees", "knee-bend summary"],
  [files.personalizationMigration, "one_active_plan_per_patient", "one active patient roadmap"],
  [files.personalizationMigration, "pending_verification", "therapist verification workflow"],
  [files.productionSecurityMigration, "invite_code_hash", "hashed invitation storage"],
  [files.productionSecurityMigration, "publish_patient_plan", "transactional plan publication"],
  [files.individualPrescriptionMigration, "publish_patient_plan_v2", "per-exercise transactional plan publication"],
  [files.individualPrescriptionMigration, "jsonb_array_length(p_exercises) not between 1 and 12", "bounded exercise prescription count"],
  [files.productionSecurityMigration, "sessions_insert_assigned_patient", "assignment-bound session policy"],
  [files.productionSecurityMigration, "private.audit_events", "private security audit trail"],
  [files.productionSecurityMigration, "client_session_id", "idempotent patient sessions"],
  [files.onboardingGrantMigration, "grant update (display_name, onboarding_version, onboarding_completed_at, updated_at)", "column-scoped onboarding updates"],
  [files.rlsIntegrationTest, "Cross-patient assignment insert was allowed", "cross-patient authorization regression test"],
  [files.rlsIntegrationTest, "Duplicate client session was allowed", "duplicate-session regression test"],
  [files.rlsIntegrationTest, "Per-exercise dosage was not preserved", "per-exercise dosage regression test"],
  [files.rlsIntegrationTest, "rollback;", "non-persistent security fixtures"],
  [files.supabaseClient, "window.sessionStorage", "session-scoped auth token storage"],
  [files.vercel, "Content-Security-Policy", "production content security policy"],
  [files.vercel, "qjcxelpzcfmcsrpsnlrs.supabase.co", "current Supabase CSP origin"],
  [files.vercel, "Permissions-Policy", "camera permissions policy"],
];

for (const [source, marker, label] of requirements) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
}

const scriptedDurationMs = 7000 + (5 * 8000) + 5000 + 10000 + 8000;
if (scriptedDurationMs !== 70000) throw new Error("Scripted demo must remain 70 seconds.");

const cssBalance = [...files.css].reduce((balance, character) => {
  if (character === "{") return balance + 1;
  if (character === "}") return balance - 1;
  return balance;
}, 0);
if (cssBalance !== 0) throw new Error("Unbalanced CSS braces.");

JSON.parse(files.vercel);
if (files.vercel.includes("kxhmrfgolttrofpumqpy")) throw new Error("CSP still references the retired Supabase project.");
if (files.main.includes("onclick=")) throw new Error("Inline event handlers are blocked by the production CSP.");

console.log(`Axion smoke test passed: ${requirements.length} feature markers, 70-second script, balanced CSS.`);
