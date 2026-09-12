import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `Could not isolate ${name}`);
  return source.slice(start, end);
}

const renderer = functionBody("renderSafeBlockingState", "showSchemaCompatibilityError");
assert.match(renderer, /app\.replaceChildren\(shell\)/, "blocking error state must replace DOM nodes safely");
assert.match(renderer, /textContent = String\(message/, "runtime error copy must use textContent");
assert.doesNotMatch(renderer, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, "safe blocking renderer must not parse HTML");

const schema = functionBody("showSchemaCompatibilityError", "showSessionIdentityError");
assert.match(schema, /renderSafeBlockingState/, "schema mismatch must use safe blocking renderer");
assert.doesNotMatch(schema, /innerHTML|insertAdjacentHTML/, "schema mismatch must not use an HTML sink");

const session = functionBody("showSessionIdentityError", "requireActiveSessionContext");
assert.match(session, /renderSafeBlockingState/, "session identity failure must use safe blocking renderer");
assert.doesNotMatch(session, /innerHTML|insertAdjacentHTML/, "session identity failure must not use an HTML sink");

console.log("CodeQL blocking-state DOM XSS regression: safe DOM-only rendering passed.");
