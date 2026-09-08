import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/campaign-map.css', import.meta.url), 'utf8');

assert.ok(css.includes("url('/axion-kingdom-world.webp')"), 'professional map must restore the original Axion kingdom artwork');
assert.ok(css.includes('.campaign-atlas .journey-legend{display:none!important}'), 'extra roadmap legend strip should stay removed');
assert.ok(css.includes('height:clamp(690px,78vh,920px)!important'), 'desktop roadmap should use a larger map viewport');
assert.ok(css.includes('background:linear-gradient(145deg,#66836b'), 'default mission nodes should use the restored green/stone palette');
assert.ok(css.includes('background:linear-gradient(145deg,#7ba27b'), 'current mission node should stay green rather than orange');
assert.ok(!css.includes('#ff8f2c') && !css.includes('#df5a19') && !css.includes('#b33e14'), 'orange arcade node palette must not return');
assert.ok(css.includes('perspective(480px)'), 'landmark depth treatment should retain a lightweight isometric/3D presentation');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'), 'roadmap animations must respect reduced-motion accessibility');

console.log('Professional kingdom roadmap styling, original artwork, non-orange nodes, larger viewport and accessibility checks passed.');
