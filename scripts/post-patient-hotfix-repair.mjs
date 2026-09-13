import fs from "node:fs";

function replaceOnce(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched ${label}`);
}

function appendOnce(path, marker, addition, label) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;
  fs.writeFileSync(path, `${source.trimEnd()}\n\n${addition.trim()}\n`);
  console.log(`patched ${label}`);
}

// The first hotfix pass scheduled presentation work from layout(), which executes
// before callers assign app.innerHTML. Remove that timing-sensitive hook.
replaceOnce(
  "src/main.js",
  `  const brandTarget = activeRole === "therapist" ? "therapist" : activeRole === "patient" ? "patient" : "home";\n  if (activeRole === "patient" && currentView === "patient") document.documentElement.dataset.axionPatientSection = "today";\n  queueMicrotask(() => window.__axionSyncPresentation?.());\n  return \``,
  `  const brandTarget = activeRole === "therapist" ? "therapist" : activeRole === "patient" ? "patient" : "home";\n  if (activeRole === "patient" && currentView === "patient") document.documentElement.dataset.axionPatientSection = "today";\n  return \``,
  "remove pre-mount presentation scheduling",
);

// bindEvents() is called after every app.innerHTML render. This is the deterministic
// render boundary: the new DOM exists and can be decorated once without polling.
replaceOnce(
  "src/main.js",
  `function bindEvents() {\n  document.querySelectorAll("[data-nav]").forEach((element) => element.addEventListener("click", () => {`,
  `function bindEvents() {\n  queueMicrotask(() => window.__axionSyncPresentation?.());\n  document.querySelectorAll("[data-nav]").forEach((element) => element.addEventListener("click", () => {`,
  "post-mount presentation scheduling",
);

// The Journey heading is structural content, not an optional enhancement. Render it
// with the patient page so it is present even before the presentation module runs.
replaceOnce(
  "src/main.js",
  `function sessionPathMarkup(workspace) {\n  return journeyMapMarkup(workspace, { escapeHtml, icon, missionMarkup: currentRoadmapSessionMarkup(workspace) });\n}`,
  `function sessionPathMarkup(workspace) {\n  const map = journeyMapMarkup(workspace, { escapeHtml, icon, missionMarkup: currentRoadmapSessionMarkup(workspace) });\n  return \`<div data-ui-journey-intro="true" class="ui-journey-intro"><div><span>JOURNEY</span><h2>Your recovery journey</h2><p>See where you are and what unlocks next.</p></div></div>\${map}\`;\n}`,
  "source-rendered Journey intro",
);

// A signed-in patient's workspace already contains their recent sessions and safety
// events. Use that data synchronously for Progress instead of tearing the page down
// for another async fetch. Therapist report loading remains unchanged.
replaceOnce(
  "src/main.js",
  `    if (target === "report") {\n      if (currentSession?.user && !currentSession.demo) {\n        try { await openRealReport(); }\n        catch (error) { showPortalError(error); }\n      } else reportView();\n    }`,
  `    if (target === "report") {\n      const workspace = currentProfile?.role === "patient" ? patientWorkspaceForCurrentSession() : null;\n      if (currentSession?.user && !currentSession.demo && workspace?.profile?.id) {\n        selectedPatient = workspace.profile;\n        reportSessions = [...(workspace.sessions || [])];\n        reportSafetyEvents = [...(workspace.safetyEvents || [])];\n        therapistNotes = [];\n        reportView();\n      } else if (currentSession?.user && !currentSession.demo) {\n        try { await openRealReport(); }\n        catch (error) { showPortalError(error); }\n      } else reportView();\n    }`,
  "synchronous patient Progress route",
);

// An authenticated patient with no completed sessions must still be on the Progress
// destination. Preserve the fail-closed empty state, but mark it semantically as a
// report page so nav state and story theming remain stable without synthetic data.
replaceOnce(
  "src/main.js",
  `  if (!latestRecorded) {\n    app.innerHTML = layout(\`\n      <main class="state-page container-wide">`,
  `  if (!latestRecorded) {\n    app.innerHTML = layout(\`\n      <main class="report-page report-page--empty state-page container-wide">`,
  "empty authenticated Progress page identity",
);

appendOnce(
  "src/ui-stability.css",
  ".report-page--empty .empty-state{",
  `html[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] .report-page--empty .empty-state{\n  max-width:760px;margin:clamp(2rem,6vh,5rem) auto;padding:clamp(1.5rem,3vw,2.5rem);\n  color:var(--story-ink)!important;background:rgba(248,243,228,.9)!important;\n  border:1px solid var(--story-line)!important;box-shadow:0 16px 40px rgba(55,49,34,.09)!important;\n}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] .report-page--empty .empty-state :is(h2,b,strong){color:var(--story-ink)!important}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] .report-page--empty .empty-state :is(p,small){color:var(--story-muted)!important}`,
  "story-aware empty Progress card",
);

// Do not reparent major Journey sections after render. The legacy presentation layer
// moved a page-level support card into the atlas and then attempted to move the atlas
// around that descendant. That creates browser-dependent ordering and visible flicker.
// Keep only the copy/visibility enhancements and let source markup own structure.
replaceOnce(
  "src/ui-hierarchy.js",
  `  if (support && support.dataset.uiMoved !== "true") {\n    support.dataset.uiMoved = "true";\n    today.after(support);\n    const reward = support.querySelector(".reward-card");`,
  `  if (support && support.dataset.uiMoved !== "true") {\n    support.dataset.uiMoved = "true";\n    const reward = support.querySelector(".reward-card");`,
  "remove support-card reparenting",
);

replaceOnce(
  "src/ui-hierarchy.js",
  `    const intro = ensureJourneyIntro(page);\n    const anchor = support || today;\n    if (intro && anchor && intro.previousElementSibling !== anchor) anchor.after(intro);\n    if (intro && atlas.previousElementSibling !== intro) intro.after(atlas);\n    if (phases && phases.previousElementSibling !== atlas) atlas.after(phases);`,
  `    ensureJourneyIntro(page);`,
  "remove Journey atlas reparenting",
);

// Update the static regression to protect the new rule: presentation helpers may
// decorate Journey, but must not move its major sections after render.
replaceOnce(
  "scripts/ui-hierarchy-test.mjs",
  `assert.match(ui, /intro\\.previousElementSibling !== anchor/, "journey intro moves only when ordering is wrong");\nassert.match(ui, /atlas\\.previousElementSibling !== intro/, "journey atlas moves only when ordering is wrong");`,
  `assert.doesNotMatch(ui, /today\\.after\\(support\\)/, "journey support must stay in source order");\nassert.doesNotMatch(ui, /anchor\\.after\\(intro\\)|intro\\.after\\(atlas\\)|atlas\\.after\\(phases\\)/, "journey presentation must not reparent major sections");`,
  "Journey no-reparent static regression",
);

// The stable source order is intro -> atlas -> support. Assert that order instead of
// requiring the old DOM-shuffling behavior that caused the cross-browser race.
replaceOnce(
  "tests/e2e/rc1-critical.spec.js",
  `    return Boolean(support && intro && atlas && support.nextElementSibling === intro && intro.nextElementSibling === atlas);`,
  `    return Boolean(support && intro && atlas && intro.nextElementSibling === atlas && atlas.nextElementSibling === support);`,
  "Journey stable source-order assertion",
);

// Starting an exercise is asynchronous. WebKit occasionally delivered the synthetic
// rep before the UI had completed the Begin Exercise transition. Wait for the same
// explicit movement-tracking state the patient sees, then emit exactly one rep.
replaceOnce(
  "tests/e2e/rc1-critical.spec.js",
  `  if (await recovery.isVisible()) return;\n  await begin.click();\n}`,
  `  if (await recovery.isVisible()) return;\n  await begin.click();\n  await expect.poll(async () => {\n    const status = await page.locator("#capture-status").textContent().catch(() => "");\n    const beginText = await begin.textContent().catch(() => "");\n    return /MOVEMENT TRACKING/i.test(status || "") || /Exercise started/i.test(beginText || "");\n  }, { timeout: 8_000 }).toBe(true);\n}`,
  "cross-browser exercise-start readiness",
);

console.log("post-hotfix render, Journey structure, Progress, and browser readiness repaired");
