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
}`,
  "browser test starts the exact assignment through the real roadmap modal",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  '  await expect(page.getByText("RC Patient B").first()).toBeVisible();',
  '  await expect(page.locator("main.patient-portal")).toBeVisible();',
  "patient B isolation test waits for the patient portal rather than presentation copy",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  '  await expect(page.getByText("RC Patient A")).toHaveCount(0);',
  '  await expect(page.getByText("RC1 exact identity plan")).toHaveCount(0);',
  "patient B isolation test asserts patient A treatment data is absent",
);

console.log("RC1 roadmap identity repair applied successfully.");
