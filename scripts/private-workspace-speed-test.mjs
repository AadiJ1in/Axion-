import fs from 'node:fs';

const loader = fs.readFileSync('src/portal-fast.js', 'utf8');
const vite = fs.readFileSync('vite.config.js', 'utf8');

const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Missing ${label}: ${text}`);
};

requireText(loader, 'const workspaceLoads = new Map()', 'single-flight workspace request map');
requireText(loader, 'Promise.all([\n    profileQuery,\n    relationshipQuery,\n    sessionsQuery,\n    safetyEventsQuery', 'parallel first request wave');
requireText(loader, 'Promise.all([therapistPromise, planPromise])', 'parallel therapist and plan wave');
requireText(loader, 'roadmap_nodes!inner(plan_id)', 'plan-scoped roadmap assignment join');
requireText(loader, '.eq("roadmap_nodes.plan_id", plan.id)', 'active-plan roadmap assignment filter');
requireText(loader, 'if (existing) return existing', 'duplicate workspace load coalescing');
requireText(vite, 'optimized-patient-workspace-loader', 'production loader wiring');
requireText(vite, 'resolve("src/portal-fast.js")', 'optimized loader entry');

if (loader.includes('localStorage') || loader.includes('sessionStorage')) {
  throw new Error('Private workspace optimization must not cache patient workspace data in browser storage.');
}

console.log('Private workspace speed regression passed.');
