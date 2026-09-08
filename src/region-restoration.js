const TIERS = [
  { max: 0, key: 'dormant', label: 'Dormant' },
  { max: 34, key: 'awakening', label: 'Awakening' },
  { max: 67, key: 'recovering', label: 'Recovering' },
  { max: 99, key: 'rekindled', label: 'Rekindled' },
  { max: 100, key: 'restored', label: 'Restored' },
];

function restorationTier(percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return TIERS.find((tier) => value <= tier.max) || TIERS.at(-1);
}

function restorationPercent(region) {
  const nodes = [...region.querySelectorAll('.journey-node')];
  if (!nodes.length) return 0;
  const complete = nodes.filter((node) => node.classList.contains('complete')).length;
  return Math.round((complete / nodes.length) * 100);
}

function createWorldLayer() {
  const layer = document.createElement('div');
  layer.className = 'region-restoration-world';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <span class="restoration-beacon"><i></i><b></b></span>
    <span class="restoration-settlement settlement-a"><i></i><i></i><i></i></span>
    <span class="restoration-settlement settlement-b"><i></i><i></i></span>
    <span class="restoration-grove grove-a"><i></i><i></i><i></i><i></i></span>
    <span class="restoration-grove grove-b"><i></i><i></i><i></i></span>
    <span class="restoration-stream"></span>
    <span class="restoration-fireflies"><i></i><i></i><i></i><i></i><i></i></span>`;
  return layer;
}

function decorateRegion(region, index) {
  const percent = restorationPercent(region);
  const tier = restorationTier(percent);
  const restoredValue = String(percent / 100);
  const regionIndex = String(index);

  if (region.dataset.restoration !== tier.key) region.dataset.restoration = tier.key;
  if (region.style.getPropertyValue('--region-restored') !== restoredValue) region.style.setProperty('--region-restored', restoredValue);
  if (region.style.getPropertyValue('--region-index') !== regionIndex) region.style.setProperty('--region-index', regionIndex);

  if (!region.querySelector('.region-restoration-world')) {
    region.append(createWorldLayer());
  }

  const header = region.querySelector(':scope > header');
  if (!header) return;

  let status = header.querySelector('.region-restoration-status');
  if (!status) {
    status = document.createElement('strong');
    status.className = 'region-restoration-status';
    header.append(status);
  }

  const statusText = `${percent}% restored · ${tier.label}`;
  const ariaLabel = `Region ${percent} percent restored, ${tier.label}`;
  if (status.textContent !== statusText) status.textContent = statusText;
  if (status.getAttribute('aria-label') !== ariaLabel) status.setAttribute('aria-label', ariaLabel);
}

function applyRegionRestoration() {
  document.querySelectorAll('.campaign-atlas .campaign-region').forEach(decorateRegion);
}

const app = document.querySelector('#app');
if (app) {
  let scheduled = false;
  let scheduledHandle = null;
  let observer = null;

  const observe = () => observer?.observe(app, { childList: true, subtree: true });
  const run = () => {
    scheduled = false;
    scheduledHandle = null;
    // Do not observe our own decorative writes. They must never schedule another pass.
    observer?.disconnect();
    try {
      applyRegionRestoration();
    } finally {
      observe();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') scheduledHandle = requestAnimationFrame(run);
    else scheduledHandle = setTimeout(run, 0);
  };

  observer = new MutationObserver(schedule);
  observe();
  schedule();

  window.addEventListener('pagehide', () => {
    observer?.disconnect();
    if (scheduledHandle !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scheduledHandle);
      else clearTimeout(scheduledHandle);
    }
    scheduled = false;
    scheduledHandle = null;
  });
}

export { restorationTier, restorationPercent, applyRegionRestoration };
