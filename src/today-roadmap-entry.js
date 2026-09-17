// Keeps the canonical roadmap-node selector attached to the visible session entry.
// Today intentionally hides the full Journey atlas, so the visible Start session button
// becomes the addressable roadmap-node control while Today is active. The underlying
// node regains the attribute when Journey is shown. This preserves one visible entry
// point without duplicating treatment/session logic.

function restoreJourneyNodes(root = document) {
  root.querySelectorAll('[data-ui-roadmap-node-id]').forEach((node) => {
    const id = node.dataset.uiRoadmapNodeId;
    if (id && !node.hasAttribute('data-roadmap-node')) node.setAttribute('data-roadmap-node', id);
    delete node.dataset.uiRoadmapNodeId;
  });
  root.querySelectorAll('[data-clinic-start-today][data-roadmap-node]').forEach((button) => {
    button.removeAttribute('data-roadmap-node');
  });
}

export function syncTodayRoadmapEntry() {
  const page = document.querySelector('.patient-portal.journey-page');
  if (!page) return;

  const section = document.documentElement.dataset.axionPatientSection || 'today';
  if (section === 'journey') {
    restoreJourneyNodes(page);
    return;
  }

  const start = page.querySelector('[data-clinic-start-today]');
  const nodeId = start?.dataset.clinicStartToday;
  if (!start || !nodeId) return;

  // Restore any prior mapping first so repeated render syncs remain finite.
  restoreJourneyNodes(page);

  const node = page.querySelector(`.journey-atlas [data-roadmap-node="${CSS.escape(nodeId)}"]`);
  if (!node) return;

  node.dataset.uiRoadmapNodeId = nodeId;
  node.removeAttribute('data-roadmap-node');
  start.setAttribute('data-roadmap-node', nodeId);
}
