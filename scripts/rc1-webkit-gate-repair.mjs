import fs from 'node:fs';

function replaceExactly(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match in ${path}, found ${count}`);
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`patched: ${label}`);
}

replaceExactly(
  'playwright.config.js',
  `  projects: [\n    { name: "chromium", use: { ...devices["Desktop Chrome"] } },\n  ],`,
  `  projects: [\n    { name: "chromium", use: { ...devices["Desktop Chrome"] } },\n    { name: "webkit", use: { ...devices["Desktop Safari"] } },\n  ],`,
  'add WebKit/Safari-engine RC1 project',
);

replaceExactly(
  '.github/workflows/rc1-e2e.yml',
  `  chromium-e2e:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15`,
  `  cross-browser-e2e:\n    runs-on: ubuntu-latest\n    timeout-minutes: 25`,
  'rename permanent RC1 job for cross-browser coverage',
);

replaceExactly(
  '.github/workflows/rc1-e2e.yml',
  `      - name: Install Chromium\n        run: npx playwright install --with-deps chromium`,
  `      - name: Install Chromium and WebKit\n        run: npx playwright install --with-deps chromium webkit`,
  'install both RC1 browser engines',
);

replaceExactly(
  '.github/workflows/rc1-e2e.yml',
  `      - name: RC1 browser critical paths\n        run: npx playwright test`,
  `      - name: RC1 cross-browser critical paths\n        run: npx playwright test`,
  'make permanent gate explicitly cross-browser',
);

console.log('RC1 WebKit/Safari-engine gate patch applied successfully.');
