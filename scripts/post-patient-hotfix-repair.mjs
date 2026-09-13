import fs from "node:fs";

function replaceOnce(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
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

console.log("post-hotfix render and Progress sequencing repaired");
