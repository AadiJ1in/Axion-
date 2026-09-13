import fs from "node:fs";

const generatorPath = "scripts/patient-ui-stability-hotfix.mjs";
let source = fs.readFileSync(generatorPath, "utf8");
const bad = '    await expect(patientNav.locator(\\\\`[data-nav="\\\\${target}"]\\\\`)).toBeVisible();';
const good = `    await expect(patientNav.locator('[data-nav="' + target + '"]')).toBeVisible();`;
if (!source.includes(bad)) throw new Error("Expected nested-template selector not found");
source = source.replace(bad, good);
fs.writeFileSync(generatorPath, source);

const smokePath = "scripts/smoke-test.mjs";
let smoke = fs.readFileSync(smokePath, "utf8");
const oldNav = '[["patient", "Roadmap", "map"], ["lab", "Movement Lab", "activity"], ["patient-profile", "Profile", "users"], ["report", "Progress", "trophy"], ["patient-report", "Report", "report"]]';
const newNav = '[["patient", "Today", "home"], ["lab", "Journey", "map"], ["report", "Progress", "trophy"], ["patient-report", "Report", "report"], ["patient-profile", "Profile", "users"]]';
if (!smoke.includes(oldNav)) throw new Error("Expected legacy patient navigation smoke contract not found");
smoke = smoke.replace(oldNav, newNav);
fs.writeFileSync(smokePath, smoke);

console.log("fixed hotfix generator quoting and updated patient navigation smoke contract");
