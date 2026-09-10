import fs from "node:fs";

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  "tests/e2e/fake-supabase-browser.js",
  `  let forceSchemaVersion = "202609100004";
  let poseModelFailure = false;`,
  `  let forceSchemaVersion = "202609100004";
  let poseModelFailure = false;
  const tableDelays = new Map();`,
  "fake backend supports deterministic table delays",
);

replaceExactly(
  "tests/e2e/fake-supabase-browser.js",
  `    async execute() {
      const table = getTable(this.table);`,
  `    async execute() {
      const delayMs = Math.max(0, Number(tableDelays.get(this.table) || 0));
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const table = getTable(this.table);`,
  "fake query can emulate slow network/database reads",
);

replaceExactly(
  "tests/e2e/fake-supabase-browser.js",
  `    failNextSessionSave() { failNextSessionSave = true; },
    setSchemaVersion(value) { forceSchemaVersion = String(value); },`,
  `    failNextSessionSave() { failNextSessionSave = true; },
    setTableDelay(table, milliseconds) { tableDelays.set(String(table), Math.max(0, Number(milliseconds) || 0)); },
    setSchemaVersion(value) { forceSchemaVersion = String(value); },`,
  "browser controls expose deterministic backend delay",
);

replaceExactly(
  "tests/e2e/rc1-critical.spec.js",
  `test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {`,
  `test("slow patient workspace response cannot restore clinical data after session expiry", async ({ page }) => {
  await boot(page);
  await seedPlan(page);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.setTableDelay("exercise_plans", 500));
  await signIn(page, "patienta@axion.test");
  await page.waitForTimeout(75);
  await page.evaluate(() => window.__AXION_E2E_CONTROL__.expireSession());
  await expect(page.locator("#auth-form")).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.locator("#auth-form")).toBeVisible();
  await expect(page.locator(\`[data-roadmap-node="\${IDS.node}"]\`)).toHaveCount(0);
  await expect(page.getByText("RC1 exact identity plan")).toHaveCount(0);
});

test("expired session returns to sign-in and clears clinical workspace", async ({ page }) => {`,
  "real browser regression covers delayed patient workspace response after logout",
);

console.log("RC1 auth race browser regression added successfully.");
