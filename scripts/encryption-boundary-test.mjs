import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const config = read('src/config.js');
const supabase = read('src/supabase.js');
const netlify = read('netlify.toml');
const vercel = read('vercel.json');
const gitignore = read('.gitignore');

assert.match(config, /SUPABASE_URL\s*=\s*"https:\/\//, 'Supabase API endpoint must use HTTPS');
assert.match(config, /SUPABASE_ANON_KEY\s*=\s*"sb_publishable_/, 'browser may contain only a publishable Supabase key');
assert.ok(!/SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/.test(config), 'service-role or secret keys must never be browser code');
assert.ok(!/sb_secret_[A-Za-z0-9_-]+/.test(config), 'Supabase secret keys must never be browser code');
assert.ok(!/postgres(?:ql)?:\/\//i.test(config), 'direct database credentials must never be browser code');

assert.ok(supabase.includes('SUPABASE_URL.startsWith("https://")'), 'client must reject non-HTTPS Supabase endpoints');
assert.ok(supabase.includes('flowType: "pkce"'), 'authentication must use PKCE');
assert.ok(supabase.includes('storage: window.sessionStorage'), 'auth tokens must be limited to the browser tab session');
assert.ok(!supabase.includes('window.localStorage'), 'auth tokens must not use persistent localStorage');

for (const [host, content] of [['Netlify', netlify], ['Vercel', vercel]]) {
  assert.ok(content.includes('Strict-Transport-Security'), `${host} must send HSTS`);
  assert.ok(content.includes('max-age=63072000'), `${host} HSTS must cover two years`);
  assert.ok(content.includes('upgrade-insecure-requests'), `${host} CSP must upgrade insecure subrequests`);
  assert.ok(content.includes('https://qjcxelpzcfmcsrpsnlrs.supabase.co'), `${host} CSP must allow only the HTTPS Supabase API`);
  assert.ok(content.includes('wss://qjcxelpzcfmcsrpsnlrs.supabase.co'), `${host} CSP must allow encrypted Supabase realtime`);
  assert.ok(content.includes('no-referrer'), `${host} must not leak authenticated paths in referrers`);
  assert.ok(content.includes('private, no-store, max-age=0'), `${host} must prevent caching authenticated entry pages`);
}

const runtimeFiles = [];
const collect = (relative) => {
  const absolute = join(root, relative);
  for (const name of readdirSync(absolute)) {
    const childRelative = join(relative, name);
    const child = join(root, childRelative);
    if (statSync(child).isDirectory()) collect(childRelative);
    else if (/\.(?:js|mjs|html|css|json)$/i.test(name)) runtimeFiles.push(childRelative);
  }
};
collect('src');
collect('public');
for (const rootFile of ['index.html', 'playtest.html', 'qa.html']) runtimeFiles.push(rootFile);

// W3C XML namespace identifiers are URI identifiers embedded in SVG markup; they
// are not fetched over the network. Ignore only these exact standards-defined
// namespace strings, then reject every remaining plaintext transport endpoint.
const stripNonNetworkNamespaces = (content) => content
  .replaceAll('http://www.w3.org/2000/svg', 'urn:axion:w3c-svg-namespace')
  .replaceAll('http://www.w3.org/1999/xlink', 'urn:axion:w3c-xlink-namespace');

for (const path of runtimeFiles) {
  const content = read(path);
  const networkRelevant = stripNonNetworkNamespaces(content);
  assert.ok(!/\bhttp:\/\//i.test(networkRelevant), `${path} contains a plaintext HTTP endpoint`);
  assert.ok(!/\bws:\/\//i.test(networkRelevant), `${path} contains a plaintext WebSocket endpoint`);
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content), `${path} contains private key material`);
  assert.ok(!/sb_secret_[A-Za-z0-9_-]+/.test(content), `${path} contains a Supabase secret key`);
  assert.ok(!/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i.test(content), `${path} contains database credentials`);
}

for (const required of ['.env', '.env.*', '.vercel/', '.netlify/', '*.key', '*.pem', '*.p12', '*.pfx']) {
  assert.ok(gitignore.includes(required), `.gitignore must exclude ${required}`);
}

console.log(`Encryption boundary checks passed across ${runtimeFiles.length} runtime files.`);
