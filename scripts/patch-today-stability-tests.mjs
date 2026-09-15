import fs from "node:fs";

const criticalPath = "tests/e2e/rc1-critical.spec.js";
const oldTodayPath = "tests/e2e/today-stability.spec.js";
const newTodayPath = "tests/e2e/rc1-today-stability.spec.js";

const critical = fs.readFileSync(criticalPath, "utf8");
const anchor = `test("Recovery journey hierarchy stays finite across recurring UI syncs", async ({ page }) => {\n  await boot(page);\n  await seedPlan(page);\n  await signInPatientA(page);\n  const intros = page.locator("[data-ui-journey-intro]");`;
const replacement = `test("Recovery journey hierarchy stays finite across recurring UI syncs", async ({ page }) => {\n  await boot(page);\n  await seedPlan(page);\n  await signInPatientA(page);\n  await page.locator('.topbar .nav [data-nav="lab"]').click();\n  await expect(page.locator(".patient-portal.journey-page")).toHaveAttribute("data-axion-stable-section", "journey");\n  const intros = page.locator("[data-ui-journey-intro]");`;

if (!critical.includes(anchor)) {
  throw new Error("Journey hierarchy test anchor was not found exactly once.");
}
if (critical.split(anchor).length !== 2) {
  throw new Error("Journey hierarchy test anchor matched more than once.");
}
fs.writeFileSync(criticalPath, critical.replace(anchor, replacement));

if (!fs.existsSync(oldTodayPath)) {
  throw new Error(`${oldTodayPath} is missing.`);
}
if (fs.existsSync(newTodayPath)) {
  throw new Error(`${newTodayPath} already exists.`);
}
fs.renameSync(oldTodayPath, newTodayPath);

console.log("Patched Journey test context and enabled Today stability spec for RC1 Playwright discovery.");
