import fs from "node:fs";
const path = "scripts/patient-ui-stability-hotfix.mjs";
let source = fs.readFileSync(path, "utf8");
const bad = '    await expect(patientNav.locator(\\\\`[data-nav="\\\\${target}"]\\\\`)).toBeVisible();';
const good = `    await expect(patientNav.locator('[data-nav="' + target + '"]')).toBeVisible();`;
if (!source.includes(bad)) throw new Error("Expected nested-template selector not found");
source = source.replace(bad, good);
fs.writeFileSync(path, source);
console.log("fixed hotfix generator quoting");
