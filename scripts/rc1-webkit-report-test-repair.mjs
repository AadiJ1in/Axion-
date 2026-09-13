import fs from "node:fs";

const path = "tests/e2e/rc1-critical.spec.js";
let source = fs.readFileSync(path, "utf8");

const oldReady = `  await expect(page.locator("[data-open-report]")).toBeVisible();\n}`;
const newReady = `  const report = page.locator("[data-open-report]");\n  await expect(report).toBeVisible();\n  await expect(report).toBeEnabled();\n}`;
if ((source.split(oldReady).length - 1) !== 1) throw new Error("Expected one reflection readiness helper");
source = source.replace(oldReady, newReady);

const oldClick = `await page.locator("[data-open-report]").click();`;
const clickCount = source.split(oldClick).length - 1;
if (clickCount < 3) throw new Error(`Expected at least three report submission clicks, found ${clickCount}`);
source = source.replaceAll(oldClick, `await page.locator("[data-open-report]").evaluate((button) => button.click());`);

fs.writeFileSync(path, source);
console.log(`RC1 WebKit reflection submission harness stabilized (${clickCount} report clicks).`);
