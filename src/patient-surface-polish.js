import "./patient-surface-polish.css";

const MAX_JOURNEY_MISSIONS_PER_REGION = 8;
const MIN_JOURNEY_MISSIONS_PER_REGION = 3;

function balancedJourneyChunkSizes(total) {
  if (total <= MAX_JOURNEY_MISSIONS_PER_REGION) return [total];
  let parts = Math.ceil(total / MAX_JOURNEY_MISSIONS_PER_REGION);
  while (parts > 1 && Math.floor(total / parts) < MIN_JOURNEY_MISSIONS_PER_REGION) parts -= 1;
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
}

function splitStoryTitles(baseTitle, count) {
  const returnLike = /return|home|final|finish/i.test(baseTitle || '');
  if (returnLike && count === 2) return ['The Return Road', 'Home Stretch'];
  if (returnLike && count === 3) return ['The Return Road', 'Reclaim the Valley', 'Beacon Summit'];
  const numerals = ['I', 'II', 'III', 'IV'];
  return Array.from({ length: count }, (_, index) => `${baseTitle || 'Recovery'} · ${numerals[index] || index + 1}`);
}

function splitStoryDetails(count) {
  if (count === 2) {
    return [
      'Build steady confidence across a shorter set of recovery missions.',
      'Bring the movement skills together on the final approach to your goal.',
    ];
  }
  if (count === 3) {
    return [
      'Re-establish rhythm with a focused set of repeatable missions.',
      'Carry that control through the middle stretch as the valley comes back to life.',
      'Finish with a compact final chapter leading to the Beacon.',
    ];
  }
  return Array.from({ length: count }, (_, index) => `Chapter ${index + 1} keeps this part of the recovery journey focused and achievable.`);
}

function journeyRegionState(region) {
  const nodes = [...region.querySelectorAll('.journey-node')];
  if (nodes.some((node) => node.classList.contains('current') || node.classList.contains('override'))) return 'current';
  if (nodes.length && nodes.every((node) => node.classList.contains('complete'))) return 'complete';
  if (nodes.some((node) => node.classList.contains('complete'))) return 'visited';
  return 'future';
}

function applyJourneyRegionState(region) {
  [...region.classList].filter((name) => name.startsWith('state-')).forEach((name) => region.classList.remove(name));
  region.classList.add(`state-${journeyRegionState(region)}`);
}

function syncJourneyRegionChapters() {
  const atlas = document.querySelector('.journey-atlas.campaign-atlas');
  const scroll = atlas?.querySelector('[data-session-path-scroll]');
  const nav = atlas?.querySelector('.campaign-region-nav');
  if (!atlas || !scroll || !nav || atlas.dataset.axionRegionChapters === 'true') return;
  atlas.dataset.axionRegionChapters = 'true';

  let changed = false;
  const initialRegions = [...scroll.querySelectorAll(':scope > [data-map-region]')];
  initialRegions.forEach((region) => {
    const grid = region.querySelector('.journey-node-grid');
    const steps = [...(grid?.children || [])];
    const chunkSizes = balancedJourneyChunkSizes(steps.length);
    if (!grid || chunkSizes.length <= 1) return;

    changed = true;
    const baseId = region.dataset.mapRegion || `region-${initialRegions.indexOf(region) + 1}`;
    const baseTitle = region.querySelector(':scope > header h3')?.textContent?.trim() || 'Recovery';
    const titles = splitStoryTitles(baseTitle, chunkSizes.length);
    const details = splitStoryDetails(chunkSizes.length);
    let cursor = 0;
    let insertionAnchor = region;

    chunkSizes.forEach((size, partIndex) => {
      const target = partIndex === 0 ? region : region.cloneNode(true);
      const targetGrid = target.querySelector('.journey-node-grid');
      targetGrid.replaceChildren();
      steps.slice(cursor, cursor + size).forEach((step) => targetGrid.appendChild(step));
      cursor += size;

      target.dataset.mapRegion = `${baseId}-${partIndex + 1}`;
      target.dataset.axionStoryChapter = String(partIndex + 1);
      const title = target.querySelector(':scope > header h3');
      const detail = target.querySelector(':scope > header p') || document.createElement('p');
      if (title) title.textContent = titles[partIndex];
      detail.textContent = details[partIndex];
      if (!detail.parentElement) target.querySelector(':scope > header')?.appendChild(detail);
      applyJourneyRegionState(target);

      if (partIndex > 0) {
        insertionAnchor.after(target);
        insertionAnchor = target;
      }
    });
  });

  if (!changed) return;

  const regions = [...scroll.querySelectorAll(':scope > [data-map-region]')];
  regions.forEach((region, index) => {
    const regionNumber = String(index + 1).padStart(2, '0');
    const header = region.querySelector(':scope > header');
    const label = header?.querySelector('small');
    const count = header?.querySelector('span');
    const nodes = [...region.querySelectorAll('.journey-node')];
    const completed = nodes.filter((node) => node.classList.contains('complete')).length;
    if (label) label.textContent = `REGION ${regionNumber}`;
    if (count) count.textContent = `${completed} / ${nodes.length} missions`;
    [...region.classList].filter((name) => name.startsWith('terrain-')).forEach((name) => region.classList.remove(name));
    region.classList.add(`terrain-${index % 4}`);
    const scenery = region.querySelector('.campaign-scenery');
    if (scenery) scenery.className = `campaign-scenery scenery-${index % 4}`;
    applyJourneyRegionState(region);
  });

  const currentNode = scroll.querySelector('.journey-node.current, .journey-node.override');
  const currentRegion = currentNode?.closest('[data-map-region]') || regions.find((region) => journeyRegionState(region) === 'current') || regions[0];
  if (currentRegion) {
    scroll.dataset.currentRegion = currentRegion.dataset.mapRegion;
    scroll.dataset.focusedRegion = currentRegion.dataset.mapRegion;
  }

  nav.replaceChildren(...regions.map((region, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.journeyRegion = region.dataset.mapRegion;
    button.setAttribute('aria-pressed', String(region === currentRegion));
    const number = document.createElement('small');
    number.textContent = String(index + 1).padStart(2, '0');
    button.append(number, document.createTextNode(region.querySelector(':scope > header h3')?.textContent?.trim() || `Region ${index + 1}`));
    return button;
  }));

  window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function syncPatientReportChoices() {
  const form = document.querySelector('#patient-report-form');
  const options = form?.querySelector('.patient-report-types');
  if (!form || !options) return;

  const painScale = form.querySelector('.patient-pain-scale');
  const painRange = form.querySelector('#patient-pain-score');
  const painOutput = form.querySelector('#patient-pain-output');
  const note = form.querySelector('#patient-report-comment');

  const applySelection = () => {
    const selected = options.querySelector('[name="patient-report-type"]:checked');
    const noPain = selected?.dataset.axionNoPain === 'true';
    const activePain = selected?.value === 'pain' && !noPain;
    if (painScale) painScale.hidden = !activePain;
    if (noPain && painRange) painRange.value = '0';
    if (noPain && painOutput) painOutput.textContent = '0 / 10';
    if (note) {
      note.placeholder = noPain
        ? 'Optional: add a note about how the movement felt today.'
        : activePain
          ? 'Describe when the pain happened and what you felt.'
          : selected?.value === 'felt_wrong'
            ? 'Describe what felt wrong during this exercise.'
            : 'Describe what felt different during this exercise.';
    }
  };

  if (options.dataset.axionPositiveChoice !== 'true') {
    options.dataset.axionPositiveChoice = 'true';
    const painLabel = options.querySelector('input[value="pain"]')?.closest('label');
    if (painLabel && !options.querySelector('[data-axion-no-pain-option]')) {
      const positiveLabel = document.createElement('label');
      positiveLabel.dataset.axionNoPainOption = 'true';
      const positiveInput = document.createElement('input');
      positiveInput.type = 'radio';
      positiveInput.name = 'patient-report-type';
      positiveInput.value = 'pain';
      positiveInput.dataset.axionNoPain = 'true';
      const positiveText = document.createElement('span');
      positiveText.textContent = 'No pain';
      positiveLabel.append(positiveInput, positiveText);
      options.querySelectorAll('input').forEach((input) => { input.checked = false; });
      positiveInput.checked = true;
      painLabel.before(positiveLabel);
    }
    const step = options.previousElementSibling;
    const heading = step?.querySelector('b');
    const help = step?.querySelector('small');
    if (heading) heading.textContent = 'How did the exercise feel?';
    if (help) help.textContent = 'Choose the option that fits best.';
    options.addEventListener('change', applySelection);
  }

  applySelection();
}

function syncPatientReportCards() {
  document.querySelectorAll('.recent-patient-reports .safety-event-list article').forEach((article) => {
    const label = article.querySelector('b');
    if (!label) return;
    if (/^Pain\s+0\s*\/\s*10$/i.test(label.textContent.trim())) {
      label.textContent = 'No pain';
      article.dataset.reportPositive = 'true';
    }
  });
}

export function syncPatientSurfacePolish() {
  syncJourneyRegionChapters();
  syncPatientReportChoices();
  syncPatientReportCards();
}

syncPatientSurfacePolish();
