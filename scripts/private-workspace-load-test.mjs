import fs from 'node:fs';
import assert from 'node:assert/strict';

const portal = fs.readFileSync(new URL('../src/portal.js', import.meta.url), 'utf8');
const watchdog = fs.readFileSync(new URL('../src/workspace-loading-watchdog.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(portal, /\.in\("roadmap_node_id", nodeIds\)/, 'Roadmap-node assignments must be scoped to the signed-in patient roadmap.');
assert.doesNotMatch(portal, /client\.from\("roadmap_node_assignments"\)\.select\("roadmap_node_id, assignment_id, sequence"\)\.order\("sequence"\)/, 'Do not scan the entire roadmap-node assignment table during patient sign-in.');
assert.match(portal, /Promise\.all\(\[/, 'Independent patient workspace reads should run concurrently.');
assert.match(watchdog, /WATCHDOG_MS = 10000/, 'Private workspace loading must have a visible recovery path.');
assert.match(watchdog, /data-workspace-retry/, 'The stalled loading state must expose a retry action.');
assert.match(index, /workspace-loading-watchdog\.js/, 'The loading watchdog must ship in production.');

console.log('private workspace load regression: ok');
