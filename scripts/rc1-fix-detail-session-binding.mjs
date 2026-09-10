import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  "src/main.js",
  `data-session-roadmap-node-id="\${escapeHtml(activeSessionContext?.roadmapNodeId || currentRoadmapNode?.id || "")}">`,
  `data-session-roadmap-node-id="\${escapeHtml(activeSessionContext?.roadmapNodeId || currentRoadmapNode?.id || "")}" data-session-client-id="\${escapeHtml(activeSessionContext?.clientSessionId || sessionClientId || "")}">`,
  "Movement Lab exposes exact client session id to the capture enhancer",
);

replaceExactly(
  "src/clinical-session-capture.js",
  `  persistedSessionId: null,
  reviewSessionId: null,`,
  `  persistedSessionId: null,
  clientSessionId: null,
  reviewSessionId: null,`,
  "capture state retains client session identity",
);

replaceExactly(
  "src/clinical-session-capture.js",
  `  state.persistedSessionId = null;
}`,
  `  state.persistedSessionId = null;
  state.clientSessionId = String(root?.dataset.sessionClientId || "").trim() || null;
}`,
  "capture state snapshots client session id from the verified lab",
);

replaceExactly(
  "src/clinical-session-capture.js",
  `  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  if (!assignmentId || !planId || state.workspace?.plan?.id !== planId) return null;`,
  `  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  const clientSessionId = String(lab?.dataset.sessionClientId || "").trim();
  if (!assignmentId || !planId || !clientSessionId || state.workspace?.plan?.id !== planId) return null;
  if (state.clientSessionId && state.clientSessionId !== clientSessionId) return null;
  state.clientSessionId = clientSessionId;`,
  "assignment enhancer requires all immutable lab identifiers",
);

replaceExactly(
  "src/clinical-session-capture.js",
  `async function newestSavedSession() {
  const session = await authSession();
  if (!session?.user || !state.assignment || !state.startedAt) return null;
  const earliest = new Date(state.startedAt - 120000).toISOString();
  const { data, error } = await supabase.from("exercise_sessions")
    .select("id, patient_id, assignment_id, exercise_key, repetitions, started_at, completed_at, created_at")
    .eq("patient_id", session.user.id)
    .eq("assignment_id", state.assignment.id)
    .gte("created_at", earliest)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return null;
  const finalizeFloor = (state.finalizingAt || Date.now()) - 120000;
  return (data || []).find((item) => new Date(item.completed_at || item.created_at).getTime() >= finalizeFloor) || data?.[0] || null;
}`,
  `async function newestSavedSession() {
  const session = await authSession();
  if (!session?.user || !state.assignment || !state.clientSessionId) return null;
  const { data, error } = await supabase.from("exercise_sessions")
    .select("id, patient_id, assignment_id, client_session_id, exercise_key, repetitions, started_at, completed_at, created_at")
    .eq("patient_id", session.user.id)
    .eq("assignment_id", state.assignment.id)
    .eq("client_session_id", state.clientSessionId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.patient_id !== session.user.id
      || data.assignment_id !== state.assignment.id
      || data.client_session_id !== state.clientSessionId
      || data.exercise_key !== state.assignment.exercise_key) return null;
  return data;
}`,
  "patient context binds to the exact saved client session instead of a time-window heuristic",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  `test("duplicate browser submission is idempotent and cannot double-award progress", async ({ page }) => {`,
  `test("session detail binds to the exact client session even with a newer same-assignment decoy", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await signInPatientA(page);
  await startAssignment(page);
  const clientSessionId = await page.locator(".lab-page").getAttribute("data-session-client-id");
  expect(clientSessionId).toBeTruthy();
  await page.evaluate(({ ids }) => {
    const { db } = window.__AXION_E2E_CONTROL__;
    const later = new Date(Date.now() + 60_000).toISOString();
    db.exercise_sessions.push({
      id: "60000000-0000-4000-8000-000000000099",
      patient_id: ids.patientA,
      plan_id: ids.plan,
      assignment_id: ids.assignmentA,
      roadmap_node_id: null,
      client_session_id: "70000000-0000-4000-8000-000000000099",
      exercise_key: "bodyweight_squat",
      repetitions: 1,
      duration_seconds: 1,
      movement_summary: {},
      started_at: later,
      completed_at: later,
      created_at: later,
    });
  }, { ids: IDS });
  await emitRep(page);
  await openReflection(page);
  await page.locator("[data-open-report]").click();
  await expect.poll(async () => (await snapshot(page)).session_capture_context.length).toBe(1);
  const state = await snapshot(page);
  const actual = state.exercise_sessions.find((row) => row.client_session_id === clientSessionId);
  expect(actual).toBeTruthy();
  expect(state.session_capture_context[0].session_id).toBe(actual.id);
  expect(state.session_capture_context[0].session_id).not.toBe("60000000-0000-4000-8000-000000000099");
});

test("duplicate browser submission is idempotent and cannot double-award progress", async ({ page }) => {`,
  "browser regression prevents cross-tab/session detail misbinding",
);

console.log("RC1 exact session-detail binding repair applied successfully.");
