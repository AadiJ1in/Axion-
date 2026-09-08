import fs from 'node:fs';

const js = fs.readFileSync('src/region-restoration.js', 'utf8');
const css = fs.readFileSync('src/region-restoration.css', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

const need = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Missing ${label}: ${text}`);
};

need(js, "node.classList.contains('complete')", 'clinical roadmap completion as visual input');
need(js, 'region-restoration-status', 'regional restoration status');
need(js, 'region-restoration-world', 'world restoration layer');
need(js, '--region-restored', 'progress-driven visual variable');
need(js, "if (status.textContent !== statusText) status.textContent = statusText", 'idempotent restoration status writes');
need(js, 'observer?.disconnect()', 'observer disconnect before decorative writes');
need(js, 'finally {\n      observe();\n    }', 'observer reconnect after decorative writes');
need(js, 'requestAnimationFrame(run)', 'paint-friendly restoration scheduling');
need(css, '.restoration-beacon', 'regional beacon');
need(css, '.restoration-settlement', 'settlement restoration');
need(css, '.restoration-grove', 'vegetation restoration');
need(css, '.restoration-stream', 'river restoration');
need(css, '.restoration-fireflies', 'ambient restored-world effect');
need(css, '@media(prefers-reduced-motion:reduce)', 'reduced motion support');
need(index, './src/region-restoration.css', 'restoration stylesheet loading');
need(index, './src/region-restoration.js', 'restoration module loading');

if (js.includes('queueMicrotask(() => {') && js.includes('applyRegionRestoration();')) {
  throw new Error('Region restoration must not continuously re-enter itself through a microtask observer loop.');
}

if (/REP_COMPLETE|HOLD_COMPLETE|clinicalCount\s*=|target_repetitions\s*=|roadmap_node_id\s*=/.test(js)) {
  throw new Error('Region restoration must not mutate clinical movement or roadmap state.');
}

console.log('Region restoration regression passed, including observer-loop protection.');
