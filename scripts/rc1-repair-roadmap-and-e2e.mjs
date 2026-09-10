import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  }
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  "src/main.js",
  `  modal.querySelectorAll("[data-start-node-assignment]").forEach((button) => button.addEventListener("click", () => {
    currentRoadmapNode = node;
    currentAssignment = workspace.assignments.find((item) => item.id === button.dataset.startNodeAssignment) || null;
    modal.remove();
    if (currentAssignment) labView();
  }));`,
  `  modal.querySelectorAll("[data-start-node-assignment]").forEach((button) => button.addEventListener("click", () => {
    currentRoadmapNode = node;
    currentAssignment = workspace.assignments.find((item) => item.id === button.dataset.startNodeAssignment) || null;
    modal.remove();
    if (!currentAssignment) {
      showSessionIdentityError(new SessionContextError(SESSION_CONTEXT_ERROR.MISMATCH));
      return;
    }
    if (currentSession?.demo) {
      labView();
      return;
    }
    try {
      beginVerifiedSessionContext(currentAssignment, node);
      labView();
    } catch (error) {
      showSessionIdentityError(error);
    }
  }));`,
  "roadmap modal creates verified session context before entering Movement Lab",
);

replaceExactly(
  "src/main.js",
  `    <main class="lab-page \${gameMapping ? "adventure-lab" : ""} \${gameMapping?.action === "duck" ? "ruins-runner-lab" : ""}">`,
  `    <main class="lab-page \${gameMapping ? "adventure-lab" : ""} \${gameMapping?.action === "duck" ? "ruins-runner-lab" : ""}" data-session-assignment-id="\${escapeHtml(activeSessionContext?.assignmentId || assignment.id || "")}" data-session-plan-id="\${escapeHtml(activeSessionContext?.planId || assignment.plan_id || "")}" data-session-roadmap-node-id="\${escapeHtml(activeSessionContext?.roadmapNodeId || currentRoadmapNode?.id || "")}">`,
  "lab DOM exposes immutable non-PHI session identifiers to enhancement layers",
);

replaceExactly(
  "src/main.js",
  `      if (!session) {
        currentProfile = null;
        stopPatientRealtime();
        stopTherapistRealtime();
      }
      if (event === "PASSWORD_RECOVERY") {`,
  `      if (!session) {
        currentProfile = null;
        stopPatientRealtime();
        stopTherapistRealtime();
        patientWorkspace = null;
        currentAssignment = null;
        currentRoadmapNode = null;
        clearClinicalSessionIdentity();
        if (event === "SIGNED_OUT" || currentView !== "home") authView();
        return;
      }
      if (event === "PASSWORD_RECOVERY") {`,
  "auth expiry clears clinical identity and returns to sign-in",
);

replaceExactly(
  "src/clinical-session-capture.js",
  `async function resolveAssignment() {
  if (state.assignment) return state.assignment;
  const session = await authSession();
  if (!session?.user) return null;
  if (!state.workspace) state.workspace = await loadPatientWorkspace(supabase, session.user.id);
  const title = document.querySelector(".lab-header h1")?.textContent?.trim();
  state.assignment = (state.workspace.assignments || []).find((item) => item.display_name === title)
    || state.workspace.assignments?.[0]
    || null;
  if (state.assignment) {
    state.profile = getMovementProfile(state.assignment.exercise_key, state.assignment.tracking_mode);
    if (state.profile.mode !== "hold") state.attemptTracker = createAttemptTracker(state.profile);
  }
  return state.assignment;
}`,
  `async function resolveAssignment() {
  if (state.assignment) return state.assignment;
  const session = await authSession();
  if (!session?.user) return null;
  if (!state.workspace) state.workspace = await loadPatientWorkspace(supabase, session.user.id);
  const lab = document.querySelector(".lab-page");
  const assignmentId = String(lab?.dataset.sessionAssignmentId || "").trim();
  const planId = String(lab?.dataset.sessionPlanId || "").trim();
  if (!assignmentId || !planId || state.workspace?.plan?.id !== planId) return null;
  state.assignment = (state.workspace.assignments || []).find((item) =>
    item.id === assignmentId && item.plan_id === planId && item.status === "active") || null;
  if (state.assignment) {
    state.profile = getMovementProfile(state.assignment.exercise_key, state.assignment.tracking_mode);
    if (state.profile.mode !== "hold") state.attemptTracker = createAttemptTracker(state.profile);
  }
  return state.assignment;
}`,
  "clinical capture resolves only the immutable verified assignment id",
);

replaceExactly(
  "src/styles.css",
  `.reflection-card{width:min(520px,100%);padding:2rem;border:1px solid var(--line-strong);border-radius:18px;background:#0d1916;box-shadow:0 40px 100px rgba(0,0,0,.5)}`,
  `.reflection-card{width:min(520px,100%);max-height:calc(100vh - 2rem);overflow-y:auto;overscroll-behavior:contain;padding:2rem;border:1px solid var(--line-strong);border-radius:18px;background:#0d1916;box-shadow:0 40px 100px rgba(0,0,0,.5)}`,
  "reflection modal remains usable when clinical context expands its height",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  '  await expect(page.locator(`[data-start-assignment="${IDS.assignmentA}"]`)).toBeVisible();',
  '  await expect(page.locator(`[data-roadmap-node="${IDS.node}"]`)).toBeVisible();',
  "patient sign-in waits for the visible prescribed roadmap node",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  `async function startAssignment(page, assignmentId = IDS.assignmentA) {
  await page.locator(\`[data-start-assignment="\${assignmentId}"]\`).click();
  await expect(page.locator("#finish-session")).toBeVisible();
}`,
  `async function startAssignment(page, assignmentId = IDS.assignmentA) {
  await page.locator(\`[data-roadmap-node="\${IDS.node}"]\`).click();
  const startButton = page.locator(\`[data-start-node-assignment="\${assignmentId}"]\`);
  await expect(startButton).toBeVisible();
  await startButton.click();
  await expect(page.locator("#finish-session")).toBeVisible();

  const beforePain = page.locator("#session-pain-before");
  await expect(beforePain).toBeVisible();
  await beforePain.evaluate((input) => {
    input.value = "0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-before-confidence] [data-value="4"]').click();
  const begin = page.locator("#clinic-begin-exercise");
  const recovery = page.locator("#camera-recovery");
  await expect.poll(async () => {
    if (await recovery.isVisible()) return "recovery";
    if (await begin.isEnabled()) return "ready";
    return "waiting";
  }, { timeout: 8_000 }).not.toBe("waiting");
  if (await recovery.isVisible()) return;
  await begin.click();
}`,
  "browser test follows the clinical gate while allowing intentional recovery-state tests",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  `async function openReflection(page) {
  await page.locator("#finish-session").click();
  await expect(page.locator("[data-open-report]")).toBeVisible();
}`,
  `async function openReflection(page) {
  await page.locator("#finish-session").click();
  const afterPain = page.locator("#session-pain-after");
  await expect(afterPain).toBeVisible();
  await afterPain.evaluate((input) => {
    input.value = "0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-after-confidence] [data-value="4"]').click();
  await expect(page.locator("[data-open-report]")).toBeVisible();
}`,
  "browser test completes required post-session patient context before report save",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  '  await expect(page.getByText("RC Patient B").first()).toBeVisible();',
  '  await expect(page.locator("#auth-form")).toHaveCount(0);',
  "patient B isolation waits for authenticated state without assuming an active plan layout",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  '  await expect(page.getByText("RC Patient A")).toHaveCount(0);',
  `  await expect(page.getByText("RC1 exact identity plan")).toHaveCount(0);
  await expect(page.locator(\`[data-roadmap-node="\${IDS.node}"]\`)).toHaveCount(0);`,
  "patient B isolation asserts patient A plan and roadmap data are absent",
);

console.log("RC1 roadmap identity and clinical workflow repair applied successfully.");
