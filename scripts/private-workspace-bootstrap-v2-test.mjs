import fs from "node:fs";

const loader = fs.readFileSync(new URL("../src/patient-workspace-loader-v2.js", import.meta.url), "utf8");
const wrapper = fs.readFileSync(new URL("../src/portal-v2.js", import.meta.url), "utf8");
const vite = fs.readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
const watchdog = fs.readFileSync(new URL("../src/workspace-loading-watchdog.js", import.meta.url), "utf8");

const required = [
  [loader.includes("get_patient_roadmap_node_assignments"), "workspace assignments must use the patient-scoped RPC"],
  [loader.includes("hydrateOptionalWorkspaceData"), "secondary workspace history must hydrate after core bootstrap"],
  [loader.includes("CORE_TIMEOUT_MS"), "core workspace reads must have a hard timeout"],
  [loader.includes("profile?.role !== \"patient\""), "bootstrap must reject non-patient roles"],
  [loader.includes("workspace.plan.patient_id !== userId"), "active plan must be bound to the signed-in patient"],
  [!loader.includes('.from("roadmap_node_assignments")'), "browser must not scan roadmap_node_assignments directly"],
  [wrapper.includes('export { loadPatientWorkspace } from "./patient-workspace-loader-v2.js"'), "portal v2 must explicitly export the new loader"],
  [vite.includes('axion-patient-workspace-bootstrap-v2'), "production bundle must route main.js through portal v2"],
  [watchdog.includes("if (armedForLoadingState) return"), "watchdog must not reset on unrelated DOM mutations"],
];

for (const [ok, message] of required) {
  if (!ok) throw new Error(message);
}

console.log("private workspace bootstrap v2 regression passed");
