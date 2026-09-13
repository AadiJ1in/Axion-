import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

assert.ok(main.includes("const loadedWorkspace = await loadPatientWorkspace(supabase, patientUserId);"));
assert.ok(main.includes("currentSession?.user?.id !== patientUserId"));
assert.ok(main.includes("const loadedConnections = await loadTherapistConnections(supabase, therapistUserId);"));
assert.ok(main.includes("currentSession?.user?.id !== therapistUserId"));
assert.ok(main.includes("assignedPatients = [];\n        therapistConnections = [];"));
assert.ok(main.includes("recommendations: [], roadmapNodes: [], roadmapCompletions: []"));

console.log("RC1 auth/workspace race contract: ok");
