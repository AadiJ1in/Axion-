import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'src/main.js',
  `function showSchemaCompatibilityError(error = null) {`,
  `function renderSafeBlockingState({ title, message, actionLabel, navTarget = null, reload = false }) {
  const shell = document.createElement("div");
  shell.className = "app-shell";

  const main = document.createElement("main");
  main.className = "state-page container-wide";

  const state = document.createElement("div");
  state.className = "error-state";

  const marker = document.createElement("span");
  marker.className = "state-safe-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = "AX";

  const heading = document.createElement("h2");
  heading.textContent = String(title || "Axion unavailable");

  const copy = document.createElement("p");
  copy.textContent = String(message || "The secure workspace is temporarily unavailable.");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--primary";
  button.textContent = String(actionLabel || "Continue");
  if (reload) button.dataset.reload = "";
  else if (navTarget) button.dataset.nav = String(navTarget);

  state.append(marker, heading, copy, button);
  main.append(state);
  shell.append(main);
  app.replaceChildren(shell);
  bindEvents();
}

function showSchemaCompatibilityError(error = null) {`,
  'add safe DOM-only blocking-state renderer',
);

replaceExactly(
  'src/main.js',
  `  app.innerHTML = layout(\`<main class="state-page container-wide"><div class="error-state"><span>\${icon("shield",26)}</span><h2>Axion update in progress</h2><p>\${escapeHtml(SCHEMA_UNAVAILABLE_MESSAGE)}</p><button class="button button--primary" data-reload>Try again</button></div></main>\`);
  bindEvents();`,
  `  renderSafeBlockingState({
    title: "Axion update in progress",
    message: SCHEMA_UNAVAILABLE_MESSAGE,
    actionLabel: "Try again",
    reload: true,
  });`,
  'remove schema-error innerHTML sink',
);

replaceExactly(
  'src/main.js',
  `  app.innerHTML = layout(\`<main class="state-page container-wide"><div class="error-state"><span>\${icon("shield",26)}</span><h2>Session verification required</h2><p>\${escapeHtml(SESSION_CONTEXT_USER_MESSAGE)}</p><button class="button button--primary" data-nav="patient">Return to treatment plan</button></div></main>\`);
  bindEvents();`,
  `  renderSafeBlockingState({
    title: "Session verification required",
    message: SESSION_CONTEXT_USER_MESSAGE,
    actionLabel: "Return to treatment plan",
    navTarget: "patient",
  });`,
  'remove session-verification innerHTML sink',
);

const regression = `import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

function functionBody(name, nextName) {
  const start = source.indexOf(\`function \${name}\`);
  const end = source.indexOf(\`function \${nextName}\`, start + 1);
  assert.ok(start >= 0 && end > start, \`Could not isolate \${name}\`);
  return source.slice(start, end);
}

const renderer = functionBody("renderSafeBlockingState", "showSchemaCompatibilityError");
assert.match(renderer, /app\\.replaceChildren\\(shell\\)/, "blocking error state must replace DOM nodes safely");
assert.match(renderer, /textContent = String\\(message/, "runtime error copy must use textContent");
assert.doesNotMatch(renderer, /innerHTML|outerHTML|insertAdjacentHTML|document\\.write/, "safe blocking renderer must not parse HTML");

const schema = functionBody("showSchemaCompatibilityError", "showSessionIdentityError");
assert.match(schema, /renderSafeBlockingState/, "schema mismatch must use safe blocking renderer");
assert.doesNotMatch(schema, /innerHTML|insertAdjacentHTML/, "schema mismatch must not use an HTML sink");

const session = functionBody("showSessionIdentityError", "requireActiveSessionContext");
assert.match(session, /renderSafeBlockingState/, "session identity failure must use safe blocking renderer");
assert.doesNotMatch(session, /innerHTML|insertAdjacentHTML/, "session identity failure must not use an HTML sink");

console.log("CodeQL blocking-state DOM XSS regression: safe DOM-only rendering passed.");
`;
fs.writeFileSync('scripts/dom-safe-blocking-state-test.mjs', regression);

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const marker = 'node scripts/schema-compatibility-test.mjs';
if (!pkg.scripts.check.includes('node scripts/dom-safe-blocking-state-test.mjs')) {
  if (!pkg.scripts.check.includes(marker)) throw new Error('package check marker missing');
  pkg.scripts.check = pkg.scripts.check.replace(marker, `node scripts/dom-safe-blocking-state-test.mjs && ${marker}`);
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

console.log('RC1 CodeQL DOM XSS repair applied successfully.');
