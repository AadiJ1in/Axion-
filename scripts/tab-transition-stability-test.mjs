import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("src/tab-transition-stability.js", "utf8");
const css = readFileSync("src/tab-transition-stability.css", "utf8");
const polish = readFileSync("src/patient-game-polish.js", "utf8");
const index = readFileSync("index.html", "utf8");

assert.match(runtime, /appObserver\?\.observe\(app, \{ childList: true, subtree: true \}\)/, "transition observer must stay scoped to the app root");
assert.doesNotMatch(runtime, /setInterval/, "transition stability must never poll the DOM");
assert.match(runtime, /data-axion-transition-placeholder/, "Today transition must reserve async clinic layout space");
assert.match(runtime, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/, "top-level patient navigation must settle at a deterministic scroll origin");
assert.match(runtime, /window\.__axionSyncPresentation\?\.\(\)/, "late clinic insertion should use the existing coalesced presentation scheduler");
assert.match(css, /repeat\(5, minmax\(0, 1fr\)\)/, "patient navigation must remain five-wide during transition");
assert.match(css, /animation: none !important/, "transient route animations must be suppressed during DOM replacement");
assert.doesNotMatch(polish, /lateClinicTimer/, "patient polish must not continuously poll late clinic presentation");
assert.doesNotMatch(polish, /document\.addEventListener\('click', \(\) => window\.setTimeout\(schedulePresentationHierarchy/, "ordinary clicks must not cause a second presentation pass");
assert.match(polish, /import "\.\/tab-transition-stability\.js";/, "transition stability must load through patient-game-polish");
assert.ok(!index.includes("./src/tab-transition-stability.js"), "transition stability must not add a third top-level boot script");

console.log("Patient tab transition stability: event-driven route settling and async Today placeholders passed.");
