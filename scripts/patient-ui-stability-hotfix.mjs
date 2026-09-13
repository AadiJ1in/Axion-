import fs from "node:fs";

function replaceOnce(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched ${label}`);
}

function appendOnce(path, marker, addition) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;
  fs.writeFileSync(path, `${source.trimEnd()}\n\n${addition.trim()}\n`);
}

// 1) Make patient navigation truthful in source markup so it never flashes old labels.
replaceOnce(
  "src/main.js",
  `? [["patient", "Roadmap", "map"], ["lab", "Movement Lab", "activity"], ["patient-profile", "Profile", "users"], ["report", "Progress", "trophy"], ["patient-report", "Report", "report"]]`,
  `? [["patient", "Today", "home"], ["lab", "Journey", "map"], ["report", "Progress", "trophy"], ["patient-report", "Report", "report"], ["patient-profile", "Profile", "users"]]`,
  "stable patient nav labels and order",
);

replaceOnce(
  "src/main.js",
  `  const brandTarget = activeRole === "therapist" ? "therapist" : activeRole === "patient" ? "patient" : "home";\n  return \``,
  `  const brandTarget = activeRole === "therapist" ? "therapist" : activeRole === "patient" ? "patient" : "home";\n  if (activeRole === "patient" && currentView === "patient") document.documentElement.dataset.axionPatientSection = "today";\n  queueMicrotask(() => window.__axionSyncPresentation?.());\n  return \``,
  "event-driven presentation sync after render",
);

// 2) Restore Report and enforce exactly one active patient destination.
replaceOnce(
  "src/ui-hierarchy.js",
  `function simplifyPatientNavigation() {`,
  `function setPatientNavActive(view) {\n  const nav = document.querySelector(".topbar .nav");\n  if (!nav?.querySelector('[data-nav="patient"]')) return;\n  nav.querySelectorAll("button[data-nav]").forEach((button) => {\n    const active = button.dataset.nav === view;\n    button.classList.toggle("active", active);\n    if (active) button.setAttribute("aria-current", "page");\n    else button.removeAttribute("aria-current");\n  });\n}\n\nfunction simplifyPatientNavigation() {`,
  "single active patient destination helper",
);

replaceOnce(
  "src/ui-hierarchy.js",
  `  buttonLabel(progress, "Progress");\n  buttonLabel(profile, "Profile");\n  if (journey) journey.dataset.uiPatientJourney = "true";\n  if (report) {\n    report.hidden = true;\n    report.setAttribute("aria-hidden", "true");\n    report.tabIndex = -1;\n  }\n\n  if (today) today.style.order = "1";\n  if (journey) journey.style.order = "2";\n  if (progress) progress.style.order = "3";\n  if (profile) profile.style.order = "4";`,
  `  buttonLabel(progress, "Progress");\n  buttonLabel(report, "Report");\n  buttonLabel(profile, "Profile");\n  if (journey) journey.dataset.uiPatientJourney = "true";\n  if (report) {\n    report.hidden = false;\n    report.removeAttribute("aria-hidden");\n    report.tabIndex = 0;\n  }\n\n  if (today) today.style.order = "1";\n  if (journey) journey.style.order = "2";\n  if (progress) progress.style.order = "3";\n  if (report) report.style.order = "4";\n  if (profile) profile.style.order = "5";\n\n  const activeView = document.querySelector(".patient-report-page") ? "patient-report"\n    : document.querySelector(".patient-profile-page") ? "patient-profile"\n      : document.querySelector(".report-page") ? "report"\n        : document.querySelector(".patient-portal") && document.documentElement.dataset.axionPatientSection === "journey" ? "lab"\n          : "patient";\n  setPatientNavActive(activeView);`,
  "restore Report and stable patient navigation",
);

replaceOnce(
  "src/ui-hierarchy.js",
  `  else if (document.querySelector(".patient-profile-page")) body.dataset.axionUiScreen = "patient-profile";\n  else if (document.querySelector(".report-page")) body.dataset.axionUiScreen = "report";`,
  `  else if (document.querySelector(".patient-profile-page")) body.dataset.axionUiScreen = "patient-profile";\n  else if (document.querySelector(".patient-report-page")) body.dataset.axionUiScreen = "patient-report";\n  else if (document.querySelector(".report-page")) body.dataset.axionUiScreen = "report";`,
  "patient report screen identity",
);

replaceOnce(
  "src/ui-hierarchy.js",
  `function openPatientJourney() {\n  const atlas = document.querySelector("#patient-journey, .journey-atlas");`,
  `function openPatientJourney() {\n  document.documentElement.dataset.axionPatientSection = "journey";\n  setPatientNavActive("lab");\n  const atlas = document.querySelector("#patient-journey, .journey-atlas");`,
  "Journey active state",
);

replaceOnce(
  "src/ui-hierarchy.js",
  `  document.addEventListener("click", (event) => {\n    const target = event.target.closest?.("[data-ui-patient-journey], [data-ui-open-journey], [data-ui-therapist-account], [data-ui-detail-target]");`,
  `  document.addEventListener("click", (event) => {\n    const today = event.target.closest?.('.topbar .nav [data-nav="patient"]');\n    if (today) document.documentElement.dataset.axionPatientSection = "today";\n    const target = event.target.closest?.("[data-ui-patient-journey], [data-ui-open-journey], [data-ui-therapist-account], [data-ui-detail-target]");`,
  "Today/Journey section state",
);

// 3) Stop mutating the whole UI every 250ms. Keep the timer only for the rest countdown.
replaceOnce(
  "src/patient-game-polish.js",
  `import { syncUiHierarchyP1 } from "./ui-hierarchy-p1.js";`,
  `import { syncUiHierarchyP1 } from "./ui-hierarchy-p1.js";\nimport { syncUiStability } from "./ui-stability.js";`,
  "stability module import",
);

replaceOnce(
  "src/patient-game-polish.js",
  `function syncRestExperience() {\n  // Reuse this existing lightweight interval for presentation hierarchy too.\n  // Both hierarchy layers are idempotent and do not observe or write clinical state.\n  syncUiHierarchy();\n  syncUiHierarchyP1();\n\n  const overlay = document.querySelector('#set-rest-overlay');`,
  `function syncPresentationHierarchy() {\n  syncUiHierarchy();\n  syncUiHierarchyP1();\n  syncUiStability();\n}\n\nlet presentationFrame = 0;\nfunction schedulePresentationHierarchy() {\n  if (presentationFrame) return;\n  presentationFrame = window.requestAnimationFrame(() => {\n    presentationFrame = 0;\n    syncPresentationHierarchy();\n  });\n}\n\nwindow.__axionSyncPresentation = schedulePresentationHierarchy;\n\nfunction syncRestExperience() {\n  const overlay = document.querySelector('#set-rest-overlay');`,
  "remove hierarchy mutation from 250ms rest timer",
);

replaceOnce(
  "src/patient-game-polish.js",
  `// Four lightweight selector checks per second only while the page is open. No\n// recursive DOM watching and no clinical-state writes.\nconst polishTimer = window.setInterval(syncRestExperience, 250);\nwindow.addEventListener('pagehide', () => window.clearInterval(polishTimer), { once:true });\ndocument.addEventListener('visibilitychange', () => { if (!document.hidden) syncRestExperience(); });\nsyncRestExperience();`,
  `// The 250ms timer is now rest-overlay only. Presentation hierarchy is event-driven\n// after a render, so signed-in navigation and cards cannot flicker four times/second.\nconst polishTimer = window.setInterval(syncRestExperience, 250);\nwindow.addEventListener('pagehide', () => {\n  window.clearInterval(polishTimer);\n  if (presentationFrame) window.cancelAnimationFrame(presentationFrame);\n}, { once:true });\nwindow.addEventListener('pageshow', schedulePresentationHierarchy);\ndocument.addEventListener('visibilitychange', () => {\n  if (!document.hidden) {\n    syncRestExperience();\n    schedulePresentationHierarchy();\n  }\n});\ndocument.addEventListener('click', () => window.setTimeout(schedulePresentationHierarchy, 0));\nsyncPresentationHierarchy();\nsyncRestExperience();`,
  "event-driven hierarchy lifecycle",
);

// 4) Add a persistent story-theme/stability layer.
fs.writeFileSync("src/ui-stability.js", `import "./ui-stability.css";\nimport { getActiveBeaconStory } from "./beacon-story.js";\n\nconst PATIENT_VIEWS = new Set(["patient", "lab", "report", "patient-report", "patient-profile"]);\n\nfunction visiblePatientView() {\n  if (document.querySelector(".patient-report-page")) return "patient-report";\n  if (document.querySelector(".patient-profile-page")) return "patient-profile";\n  if (document.querySelector(".report-page") && document.querySelector('.topbar .nav [data-nav="patient"]')) return "report";\n  if (document.querySelector(".lab-page")) return "lab";\n  if (document.querySelector(".patient-portal")) return document.documentElement.dataset.axionPatientSection === "journey" ? "lab" : "patient";\n  return null;\n}\n\nexport function syncUiStability() {\n  const root = document.documentElement;\n  const patientNav = document.querySelector('.topbar .nav [data-nav="patient"]')?.closest("nav");\n  const view = visiblePatientView();\n  root.dataset.axionPatientSurface = patientNav ? "true" : "false";\n\n  if (patientNav) {\n    const report = patientNav.querySelector('[data-nav="patient-report"]');\n    if (report) {\n      report.hidden = false;\n      report.removeAttribute("aria-hidden");\n      report.tabIndex = 0;\n    }\n    if (view && PATIENT_VIEWS.has(view)) {\n      patientNav.querySelectorAll("button[data-nav]").forEach((button) => {\n        const active = button.dataset.nav === view;\n        button.classList.toggle("active", active);\n        if (active) button.setAttribute("aria-current", "page");\n        else button.removeAttribute("aria-current");\n      });\n    }\n  }\n\n  try {\n    const story = getActiveBeaconStory();\n    root.dataset.axionStory = story?.kind || "beacon";\n  } catch {\n    root.dataset.axionStory = "beacon";\n  }\n}\n\nsyncUiStability();\n`);

fs.writeFileSync("src/ui-stability.css", `/* Stable patient shell and story-aware patient surfaces. Presentation only. */\n:root{\n  --story-paper:#eee6d1;--story-paper-2:#d9c9a5;--story-ink:#23352d;--story-muted:#64736a;\n  --story-deep:#17382f;--story-deep-2:#254c3c;--story-accent:#5f7e69;--story-highlight:#c5a965;--story-line:rgba(73,88,72,.24);\n}\n:root[data-axion-story="path"]{--story-paper:#e9e2cd;--story-paper-2:#ccbfa0;--story-deep:#24372d;--story-accent:#687961;--story-highlight:#b99c65}\n:root[data-axion-story="bridge"]{--story-paper:#eee4c9;--story-paper-2:#d5c092;--story-deep:#153a33;--story-deep-2:#2e584c;--story-accent:#55786b;--story-highlight:#bf9f5f}\n:root[data-axion-story="mill"]{--story-paper:#eadfc7;--story-paper-2:#cfb98e;--story-deep:#3b3928;--story-accent:#7a6848;--story-highlight:#bf8e4c}\n:root[data-axion-story="village"]{--story-paper:#efe1c9;--story-paper-2:#d5ba8f;--story-deep:#3e3526;--story-accent:#80624b;--story-highlight:#c58a55}\n:root[data-axion-story="gate"]{--story-paper:#e4e0c7;--story-paper-2:#bfc4a0;--story-deep:#193a2c;--story-accent:#526f55;--story-highlight:#a9985a}\n:root[data-axion-story="garden"]{--story-paper:#e7e3c8;--story-paper-2:#c0c89e;--story-deep:#174033;--story-accent:#4f7f66;--story-highlight:#b0a55e}\n:root[data-axion-story="climb"]{--story-paper:#e6e3d6;--story-paper-2:#c1c0ae;--story-deep:#263a39;--story-accent:#637b78;--story-highlight:#aaa06b}\n:root[data-axion-story="signal"],:root[data-axion-story="finale"]{--story-paper:#ece5cf;--story-paper-2:#d5c28f;--story-deep:#183830;--story-accent:#65765c;--story-highlight:#d0b65e}\n\nhtml[data-axion-patient-surface="true"],html[data-axion-patient-surface="true"] body{overflow-x:clip}\n.topbar .nav[data-ui-patient-nav="true"]{flex-wrap:nowrap;align-items:center;min-width:0}\n.topbar .nav[data-ui-patient-nav="true"] button{transition:background-color .12s ease,color .12s ease,border-color .12s ease;transform:none!important;white-space:nowrap}\n.topbar .nav[data-ui-patient-nav="true"] [data-nav="patient-report"]{display:flex!important}\n.topbar .nav[data-ui-patient-nav="true"] button.active{color:var(--mint-2);background:rgba(110,240,177,.1)}\n\n/* Never expose an empty black map when the roadmap is shorter than the old fixed viewport. */\n.campaign-world{background:var(--story-deep)!important}\n.campaign-scroll{\n  height:auto!important;min-height:520px!important;max-height:min(70vh,680px)!important;\n  background:\n    linear-gradient(180deg,rgba(15,39,31,.12),rgba(12,33,26,.36)),\n    url('/axion-kingdom-world.webp') center/cover no-repeat,var(--story-deep)!important;\n  scroll-behavior:auto!important;\n}\n.campaign-region{min-height:520px!important;transition:none!important}\n.campaign-scenery{transition:none!important}\n.campaign-cloud{animation:none!important}\n\n/* Progress and Report belong to the active story world instead of the generic dark dashboard. */\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"],\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"]{\n  --text:var(--story-ink);--muted:var(--story-muted);--line:var(--story-line);--line-strong:rgba(72,91,76,.38);\n  --surface:rgba(248,243,228,.9);--surface-2:rgba(239,231,207,.92);--surface-3:rgba(222,210,177,.88);\n  --mint:var(--story-accent);--mint-2:var(--story-deep);--ink:#f8f3e3;\n  color:var(--story-ink);\n  background:\n    linear-gradient(105deg,rgba(243,236,215,.94),rgba(224,210,176,.88)),\n    url('/axion-kingdom-world.webp') center 28%/cover fixed!important;\n}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] :is(.report-header,.ui-progress-intro,.pulse-banner,.report-metrics,.longitudinal-card,.session-rail,.rep-highlight,.ai-note,.heatmap-card,.review-card),\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] :is(.patient-report-hero,.patient-checkin-card,.patient-report-side>article){\n  color:var(--story-ink)!important;border-color:var(--story-line)!important;background:rgba(248,243,228,.88)!important;box-shadow:0 12px 32px rgba(55,49,34,.08)!important;\n}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] :is(p,small,span,dt),\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] :is(p,small,label){color:var(--story-muted)}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] :is(h1,h2,h3,b,strong,dd),\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] :is(h1,h2,h3,b,strong){color:var(--story-ink)}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] .section-kicker,\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] .section-kicker{color:var(--story-accent)!important}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="report"] .back-link{color:var(--story-muted)}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] :is(select,textarea){background:rgba(255,252,242,.8)!important;color:var(--story-ink)!important;border-color:var(--story-line)!important}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] .patient-report-types span{background:rgba(255,252,242,.75);color:var(--story-muted);border-color:var(--story-line)}\nhtml[data-axion-patient-surface="true"] body[data-axion-ui-screen="patient-report"] .patient-report-types input:checked+span{background:color-mix(in srgb,var(--story-highlight) 24%,white);color:var(--story-ink);border-color:var(--story-highlight)}\n\n/* Profile stays inside the viewport and uses the same world palette. */\n.patient-profile-page{max-width:100%;min-width:0;overflow-x:clip;color:var(--story-ink)}\n.patient-profile-page :is(.profile-hero-card,.profile-dashboard-grid,.avatar-picker-card,.profile-progress-card,.achievement-card,.profile-settings-link,.avatar-choice-grid,.achievement-grid){min-width:0;max-width:100%}\n.patient-profile-page .profile-hero-card{background:linear-gradient(105deg,color-mix(in srgb,var(--story-paper) 94%,transparent),color-mix(in srgb,var(--story-paper-2) 88%,transparent)),url('/axion-kingdom-world.webp') center 18%/cover!important}\n.patient-profile-page .profile-progress-card{background:linear-gradient(130deg,color-mix(in srgb,var(--story-deep) 96%,transparent),color-mix(in srgb,var(--story-deep-2) 90%,transparent)),url('/axion-kingdom-world.webp') center 66%/cover!important}\n.patient-profile-page .avatar-picker-card,.patient-profile-page .achievement-card,.patient-profile-page .profile-settings-link{background:color-mix(in srgb,var(--story-paper) 92%,white)!important}\n\n@media(max-width:1000px){\n  .topbar .nav[data-ui-patient-nav="true"] button{padding:.6rem .62rem}\n  .campaign-scroll{min-height:480px!important;max-height:640px!important}\n  .campaign-region{min-height:480px!important}\n}\n@media(max-width:680px){\n  .campaign-scroll{min-height:430px!important;max-height:560px!important}\n  .campaign-region{min-height:430px!important}\n}\n@media(prefers-reduced-motion:reduce){.campaign-region,.campaign-scenery,.topbar .nav button{transition:none!important}}\n`);

// 5) Regression tests: no interval-driven hierarchy, Report restored, story theme present.
replaceOnce(
  "scripts/ui-hierarchy-test.mjs",
  `const polish = fs.readFileSync(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");`,
  `const polish = fs.readFileSync(new URL("../src/patient-game-polish.js", import.meta.url), "utf8");\nconst stability = fs.readFileSync(new URL("../src/ui-stability.js", import.meta.url), "utf8");\nconst stabilityCss = fs.readFileSync(new URL("../src/ui-stability.css", import.meta.url), "utf8");`,
  "stability regression fixtures",
);
replaceOnce(
  "scripts/ui-hierarchy-test.mjs",
  `assert.match(polish, /window\\.setInterval\\(syncRestExperience, 250\\)/);`,
  `assert.match(polish, /window\\.setInterval\\(syncRestExperience, 250\\)/);\nconst restFunction = polish.slice(polish.indexOf("function syncRestExperience"), polish.indexOf("document.addEventListener('click'"));\nassert.doesNotMatch(restFunction, /syncUiHierarchy\\(|syncUiHierarchyP1\\(/, "250ms rest timer must never mutate global UI hierarchy");\nassert.match(polish, /function syncPresentationHierarchy\\(\\)/);\nassert.match(stability, /getActiveBeaconStory/);\nassert.match(stabilityCss, /axion-kingdom-world\\.webp/);\nassert.match(stabilityCss, /campaign-cloud\\{animation:none!important/);`,
  "no recurring hierarchy mutation regression",
);
replaceOnce(
  "scripts/ui-hierarchy-test.mjs",
  `for (const label of ["Today", "Journey", "Progress", "Profile"])`,
  `for (const label of ["Today", "Journey", "Progress", "Report", "Profile"])`,
  "Report navigation regression",
);

replaceOnce(
  "package.json",
  `node --check src/ui-hierarchy-p1.js && node --check src/adventure-definitions.js`,
  `node --check src/ui-hierarchy-p1.js && node --check src/ui-stability.js && node --check src/adventure-definitions.js`,
  "syntax-check stability module",
);

const e2ePath = "tests/e2e/rc1-critical.spec.js";
let e2e = fs.readFileSync(e2ePath, "utf8");
if (!e2e.includes("patient shell stays stable, restores Report, and carries story theme")) {
  const marker = `test("exact assignment id survives duplicate display titles and saves the performed exercise", async ({ page }) => {`;
  if (!e2e.includes(marker)) throw new Error("E2E insertion marker missing");
  const testBlock = `test("patient shell stays stable, restores Report, and carries story theme", async ({ page }) => {\n  await boot(page);\n  await seedPlan(page);\n  await signInPatientA(page);\n\n  const patientNav = page.locator(".topbar .nav");\n  for (const target of ["patient", "lab", "report", "patient-report", "patient-profile"]) {\n    await expect(patientNav.locator(\\`[data-nav="\\${target}"]\\`)).toBeVisible();\n  }\n  await expect(patientNav.locator('[data-nav="patient-report"]')).toContainText("Report");\n  expect(await patientNav.locator("button.active").count()).toBe(1);\n\n  await page.waitForTimeout(1_250);\n  expect(await patientNav.locator("button.active").count()).toBe(1);\n  await expect(patientNav.locator('[data-nav="patient-report"]')).toBeVisible();\n\n  await patientNav.locator('[data-nav="lab"]').click();\n  await expect(page.locator(".patient-portal.journey-page")).toBeVisible();\n  await expect(patientNav.locator('[data-nav="lab"]')).toHaveClass(/active/);\n  expect(await patientNav.locator("button.active").count()).toBe(1);\n  const mapStyle = await page.locator(".campaign-scroll").evaluate((node) => ({\n    backgroundImage: getComputedStyle(node).backgroundImage,\n    height: node.getBoundingClientRect().height,\n  }));\n  expect(mapStyle.backgroundImage).toContain("axion-kingdom-world.webp");\n  expect(mapStyle.height).toBeGreaterThanOrEqual(420);\n  expect(mapStyle.height).toBeLessThanOrEqual(700);\n\n  await patientNav.locator('[data-nav="patient-report"]').click();\n  await expect(page.locator(".patient-report-page")).toBeVisible();\n  await expect(page.locator("html")).toHaveAttribute("data-axion-story", /.+/);\n  await expect(page.locator("body")).toHaveAttribute("data-axion-ui-screen", "patient-report");\n\n  await page.locator('.topbar .nav [data-nav="report"]').click();\n  await expect(page.locator(".report-page")).toBeVisible();\n  await expect(page.locator("body")).toHaveAttribute("data-axion-ui-screen", "report");\n  const progressBackground = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundImage);\n  expect(progressBackground).toContain("axion-kingdom-world.webp");\n  expect(await page.locator(".topbar .nav button.active").count()).toBe(1);\n\n  await page.locator('.topbar .nav [data-nav="patient-profile"]').click();\n  await expect(page.locator(".patient-profile-page")).toBeVisible();\n  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);\n  expect(overflow).toBeLessThanOrEqual(2);\n  expect(await page.locator(".topbar .nav button.active").count()).toBe(1);\n});\n\n`;
  e2e = e2e.replace(marker, testBlock + marker);
  fs.writeFileSync(e2ePath, e2e);
}

console.log("Patient UI stability hotfix applied.");
