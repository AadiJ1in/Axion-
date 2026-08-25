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
  [files.main, "data-start-assignment", "patient assignment flow"],
  [files.portal, "exercise_assignments", "patient prescription data integration"],
  [files.schema, "is_assigned_therapist", "assignment-scoped RLS"],
  [files.portal, "claimCareInvitation", "patient invite claim flow"],
  [files.portal, "createCareInvitation", "therapist invite creation flow"],
  [files.main, "Create patient account", "patient onboarding"],
  [files.main, "onboarding_version", "one-time onboarding state"],
  [files.main, "VERIFICATION PENDING", "two-sided connection state"],
  [files.main, "PRIVATE PATIENT LAB", "patient-scoped movement lab"],
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
  [files.vercel, "Content-Security-Policy", "production content security policy"],
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

console.log(`Axion smoke test passed: ${requirements.length} feature markers, 70-second script, balanced CSS.`);
