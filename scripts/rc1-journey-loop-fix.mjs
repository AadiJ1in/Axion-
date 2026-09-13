import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched ${label}`);
}

replaceExactly(
  "src/ui-hierarchy.js",
`function ensureJourneyIntro(atlas) {
  if (!atlas || atlas.previousElementSibling?.matches("[data-ui-journey-intro]")) return;
  const intro = document.createElement("div");
  intro.dataset.uiJourneyIntro = "true";
  intro.className = "ui-journey-intro";
  intro.innerHTML = \`<div><span>JOURNEY</span><h2>Your recovery journey</h2><p>See where you are and what unlocks next.</p></div>\`;
  atlas.before(intro);
}`,
`function ensureJourneyIntro(page) {
  if (!page) return null;
  const existing = [...page.querySelectorAll("[data-ui-journey-intro]")];
  const intro = existing.shift() || document.createElement("div");
  existing.forEach((node) => node.remove());
  intro.dataset.uiJourneyIntro = "true";
  intro.className = "ui-journey-intro";
  if (!intro.firstElementChild) {
    intro.innerHTML = \`<div><span>JOURNEY</span><h2>Your recovery journey</h2><p>See where you are and what unlocks next.</p></div>\`;
  }
  return intro;
}`,
  "single recovery journey intro",
);

replaceExactly(
  "src/ui-hierarchy.js",
`  if (atlas) {
    atlas.id = "patient-journey";
    atlas.dataset.uiJourneyHero = "true";
    support?.after(atlas);
    ensureJourneyIntro(atlas);
    if (phases) atlas.after(phases);
  }`,
`  if (atlas) {
    atlas.id = "patient-journey";
    atlas.dataset.uiJourneyHero = "true";
    const intro = ensureJourneyIntro(page);
    const anchor = support || today;
    if (intro && anchor && intro.previousElementSibling !== anchor) anchor.after(intro);
    if (intro && atlas.previousElementSibling !== intro) intro.after(atlas);
    if (phases && phases.previousElementSibling !== atlas) atlas.after(phases);
  }`,
  "idempotent recovery journey ordering",
);

const staticTest = "scripts/ui-hierarchy-test.mjs";
let staticSource = fs.readFileSync(staticTest, "utf8");
const staticMarker = `assert.doesNotMatch(ui, /MutationObserver/);`;
if (!staticSource.includes("journey hierarchy must be idempotent")) {
  if (!staticSource.includes(staticMarker)) throw new Error("UI hierarchy regression marker missing");
  staticSource = staticSource.replace(staticMarker, `${staticMarker}\nassert.match(ui, /function ensureJourneyIntro\\(page\\)/, "journey hierarchy must be idempotent");\nassert.match(ui, /page\\.querySelectorAll\\(\\\"\\[data-ui-journey-intro\\]\\\"\\)/, "duplicate journey intros must be collapsed");\nassert.doesNotMatch(ui, /support\\?\\.after\\(atlas\\)/, "journey atlas must not be unconditionally moved on every sync tick");\nassert.match(ui, /intro\\.previousElementSibling !== anchor/, "journey intro moves only when ordering is wrong");\nassert.match(ui, /atlas\\.previousElementSibling !== intro/, "journey atlas moves only when ordering is wrong");`);
  fs.writeFileSync(staticTest, staticSource);
}

const e2e = "tests/e2e/rc1-critical.spec.js";
let e2eSource = fs.readFileSync(e2e, "utf8");
const firstTest = `test("exact assignment id survives duplicate display titles and saves the performed exercise", async ({ page }) => {`;
if (!e2eSource.includes("Recovery journey hierarchy stays finite")) {
  if (!e2eSource.includes(firstTest)) throw new Error("RC1 E2E insertion marker missing");
  const journeyTest = `test("Recovery journey hierarchy stays finite across recurring UI syncs", async ({ page }) => {\n  await boot(page);\n  await seedPlan(page);\n  await signInPatientA(page);\n  const portal = page.locator(".patient-portal.journey-page");\n  const intros = page.locator("[data-ui-journey-intro]");\n  await expect(intros).toHaveCount(1);\n  const initialChildren = await portal.locator(":scope > *").count();\n  await page.waitForTimeout(1_250);\n  await expect(intros).toHaveCount(1);\n  expect(await portal.locator(":scope > *").count()).toBe(initialChildren);\n  expect(await page.getByRole("heading", { name: "Your recovery journey" }).count()).toBe(1);\n  const stableOrder = await page.evaluate(() => {\n    const pageRoot = document.querySelector(".patient-portal.journey-page");\n    const support = pageRoot?.querySelector(".roadmap-support-grid");\n    const intro = pageRoot?.querySelector("[data-ui-journey-intro]");\n    const atlas = pageRoot?.querySelector(".journey-atlas");\n    return Boolean(support && intro && atlas && support.nextElementSibling === intro && intro.nextElementSibling === atlas);\n  });\n  expect(stableOrder).toBe(true);\n});\n\n`;
  e2eSource = e2eSource.replace(firstTest, journeyTest + firstTest);
  fs.writeFileSync(e2e, e2eSource);
}

console.log("RC1 Recovery journey infinite-loop repair applied.");
