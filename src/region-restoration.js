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
  region.dataset.restoration = tier.key;
  region.style.setProperty('--region-restored', String(percent / 100));
  region.style.setProperty('--region-index', String(index));

  if (!region.querySelector('.region-restoration-world')) {
    region.append(createWorldLayer());
  }

  const header = region.querySelector(':scope > header');
  if (header) {
    let status = header.querySelector('.region-restoration-status');
    if (!status) {
      status = document.createElement('strong');
      status.className = 'region-restoration-status';
      header.append(status);
    }
    status.textContent = `${percent}% restored · ${tier.label}`;
    status.setAttribute('aria-label', `Region ${percent} percent restored, ${tier.label}`);
  }
}

function applyRegionRestoration() {
  document.querySelectorAll('.campaign-atlas .campaign-region').forEach(decorateRegion);
}

const app = document.querySelector('#app');
if (app) {
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyRegionRestoration();
    });
  };
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
}

export { restorationTier, restorationPercent, applyRegionRestoration };
