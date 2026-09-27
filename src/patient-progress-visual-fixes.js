const STYLE_ID = 'axion-patient-progress-visual-fixes-css';

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[char]));

function finite(value) {
  const match = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./patient-progress-visual-fixes.css', import.meta.url).href;
  document.head.appendChild(link);
}

function niceMax(value, minimum = 1) {
  const safe = Math.max(minimum, Number(value) || minimum);
  const power = 10 ** Math.floor(Math.log10(safe));
  const scaled = safe / power;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * power;
}

function axisLineChart(values, labels, options = {}) {
  const usable = values.map((value) => Number.isFinite(Number(value)) ? Number(value) : null);
  const finiteValues = usable.filter(Number.isFinite);
  if (!finiteValues.length) return '<div class="axpv-empty">Not enough recorded data for a chart.</div>';

  const compact = Boolean(options.compact);
  const width = compact ? 310 : 760;
  const height = compact ? 132 : 210;
  const margin = compact ? { left: 34, right: 12, top: 16, bottom: 28 } : { left: 50, right: 22, top: 24, bottom: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const unit = options.unit || '';
  let min = Number.isFinite(options.min) ? options.min : Math.min(...finiteValues);
  let max = Number.isFinite(options.max) ? options.max : Math.max(...finiteValues);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * .1, 1);
    min -= pad;
    max += pad;
  }
  const span = Math.max(max - min, .0001);
  const x = (index) => margin.left + (index / Math.max(1, usable.length - 1)) * plotWidth;
  const y = (value) => margin.top + ((max - value) / span) * plotHeight;
  const ticks = [max, min + span / 2, min];
  const path = usable.map((value, index) => Number.isFinite(value) ? `${x(index).toFixed(1)},${y(value).toFixed(1)}` : null).filter(Boolean).join(' ');
  const tickMarkup = ticks.map((tick) => {
    const ty = y(tick);
    const digits = Math.abs(tick) < 10 && unit !== '' ? 1 : 0;
    return `<line class="axpv-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${ty}" y2="${ty}"/><text class="axpv-axis-label" x="${margin.left - 8}" y="${ty + 4}" text-anchor="end">${tick.toFixed(digits)}${esc(unit)}</text>`;
  }).join('');
  const xMarkup = usable.map((value, index) => `<text class="axpv-axis-label axpv-axis-x" x="${x(index)}" y="${height - 8}" text-anchor="middle">${esc(labels[index] || `S${index + 1}`)}</text>`).join('');
  const pointMarkup = usable.map((value, index) => Number.isFinite(value)
    ? `<circle class="axpv-point" cx="${x(index)}" cy="${y(value)}" r="${compact ? 3.4 : 4.5}"/>${compact ? '' : `<text class="axpv-value" x="${x(index)}" y="${Math.max(14, y(value) - 10)}" text-anchor="middle">${value.toFixed(options.digits ?? 0)}${esc(unit)}</text>`}`
    : '').join('');

  return `<svg class="axpv-axis-chart${compact ? ' compact' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.ariaLabel || 'Recorded movement trend')}">${tickMarkup}<line class="axpv-axis" x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}"/><line class="axpv-axis" x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}"/>${path ? `<polyline class="axpv-line-shadow" points="${path}"/><polyline class="axpv-line" points="${path}"/>` : ''}${pointMarkup}${xMarkup}</svg>`;
}

function twoBarChart(label, baseline, today, unit) {
  const values = [baseline, today].filter(Number.isFinite);
  if (!values.length) return '';
  const max = niceMax(Math.max(...values) * 1.15, unit === 's' ? 1 : 10);
  const width = 250;
  const height = 170;
  const top = 18;
  const bottom = 36;
  const left = 42;
  const plotHeight = height - top - bottom;
  const y = (value) => top + (1 - Math.max(0, value) / max) * plotHeight;
  const ticks = [max, max / 2, 0];
  const bars = [
    { value: baseline, x: 76, label: 'Baseline', className: 'baseline' },
    { value: today, x: 158, label: 'Today', className: 'today' },
  ].map((item) => Number.isFinite(item.value) ? `<rect class="axpv-bar ${item.className}" x="${item.x}" y="${y(item.value)}" width="48" height="${top + plotHeight - y(item.value)}" rx="7"/><text class="axpv-bar-value" x="${item.x + 24}" y="${Math.max(14, y(item.value) - 7)}" text-anchor="middle">${item.value.toFixed(unit === 's' ? 1 : 1)}${esc(unit)}</text><text class="axpv-axis-label" x="${item.x + 24}" y="${height - 9}" text-anchor="middle">${item.label}</text>` : '').join('');
  const grid = ticks.map((tick) => {
    const ty = y(tick);
    return `<line class="axpv-grid" x1="${left}" x2="228" y1="${ty}" y2="${ty}"/><text class="axpv-axis-label" x="${left - 7}" y="${ty + 4}" text-anchor="end">${tick.toFixed(unit === 's' ? 1 : 0)}${esc(unit)}</text>`;
  }).join('');
  return `<article class="axpv-bar-card"><span>${esc(label)}</span><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} baseline versus today">${grid}<line class="axpv-axis" x1="${left}" x2="${left}" y1="${top}" y2="${top + plotHeight}"/><line class="axpv-axis" x1="${left}" x2="228" y1="${top + plotHeight}" y2="${top + plotHeight}"/>${bars}</svg></article>`;
}

function statFromCard(card, label) {
  const row = [...(card?.querySelectorAll('.axp-week-stats span') || [])].find((item) => (item.textContent || '').toLowerCase().includes(label.toLowerCase()));
  return finite(row?.querySelector('b')?.textContent);
}

function timelineData(page) {
  return [...page.querySelectorAll('.axp-week')].map((card, index) => ({
    card,
    label: card.querySelector('.axp-week-label b')?.textContent?.trim() || `Session ${index + 1}`,
    shortLabel: card.querySelector('.axp-week-label small')?.textContent?.trim() || `S${index + 1}`,
    consistency: statFromCard(card, 'Consistency'),
    symmetry: statFromCard(card, 'Symmetry'),
    tempo: statFromCard(card, 'Tempo'),
  }));
}

function metricFromComparison(article, index) {
  const span = article?.querySelectorAll('.axp-mini-metrics span')?.[index];
  return {
    label: span?.childNodes?.[0]?.textContent?.trim() || '',
    value: finite(span?.querySelector('b')?.textContent),
  };
}

function fixScore(page) {
  const ring = page.querySelector('.axp-score-ring');
  if (!ring || ring.dataset.axpvFixed === 'true') return;
  const inner = ring.querySelector('span');
  const label = inner?.querySelector('small');
  if (label) {
    label.remove();
    label.className = 'axpv-score-label';
    ring.appendChild(label);
  }
  ring.dataset.axpvFixed = 'true';
}

function fixComparison(page, timeline) {
  const section = page.querySelector('.axp-comparison');
  const grid = section?.querySelector('.axp-comparison-grid');
  if (!section || !grid || section.querySelector('[data-axpv-comparison]')) return;

  grid.querySelectorAll('article .axp-sparkline, article .axp-chart-empty').forEach((node) => node.remove());
  const labels = timeline.map((item, index) => item.shortLabel === 'Today' ? 'Today' : `S${index + 1}`);
  const consistencies = timeline.map((item) => item.consistency);
  const trend = document.createElement('div');
  trend.dataset.axpvComparison = 'true';
  trend.className = 'axpv-comparison-trend';
  trend.innerHTML = `<div class="axpv-chart-heading"><div><span>CONSISTENCY OVER TIME</span><b>Recorded session consistency</b></div><small>Score</small></div>${axisLineChart(consistencies, labels, { min: 0, max: 100, ariaLabel: 'Movement consistency by session' })}`;
  grid.before(trend);

  const baseline = grid.querySelector('article:not(.today)');
  const today = grid.querySelector('article.today');
  const metricGrid = document.createElement('div');
  metricGrid.className = 'axpv-metric-grid';
  const units = ['°', '°', 's'];
  metricGrid.innerHTML = [0, 1, 2].map((index) => {
    const before = metricFromComparison(baseline, index);
    const after = metricFromComparison(today, index);
    return twoBarChart(after.label || before.label || `Metric ${index + 1}`, before.value, after.value, units[index]);
  }).join('');
  grid.after(metricGrid);
}

function fixTimeline(page, timeline) {
  const allConsistency = timeline.map((item) => item.consistency);
  timeline.forEach((item, index) => {
    const existing = item.card.querySelector('.axp-motion-signature');
    if (!existing || item.card.querySelector('.axpv-timeline-chart')) return;
    const holder = document.createElement('div');
    holder.className = 'axpv-timeline-chart';
    holder.innerHTML = `<span>Consistency through this checkpoint</span>${axisLineChart(allConsistency.slice(0, index + 1), timeline.slice(0, index + 1).map((_, i) => `S${i + 1}`), { min: 0, max: 100, compact: true, ariaLabel: `Consistency through ${item.label}` })}`;
    existing.replaceWith(holder);
  });
}

function fixDetails(page, timeline) {
  const details = page.querySelector('.axp-details');
  if (!details || details.dataset.axpvFixed === 'true') return;
  const labels = timeline.map((item, index) => item.shortLabel === 'Today' ? 'Now' : `S${index + 1}`);
  const map = {
    'MOTION SIGNATURE': { values: timeline.map((item) => item.consistency), min: 0, max: 100, unit: '', digits: 0, ariaLabel: 'Consistency at selected checkpoints' },
    'SYMMETRY TREND': { values: timeline.map((item) => item.symmetry), min: 0, max: niceMax(Math.max(...timeline.map((item) => item.symmetry).filter(Number.isFinite), 1) * 1.15, 5), unit: '°', digits: 1, ariaLabel: 'Symmetry delta at selected checkpoints' },
    'TEMPO TREND': { values: timeline.map((item) => item.tempo), min: 0, max: niceMax(Math.max(...timeline.map((item) => item.tempo).filter(Number.isFinite), 1) * 1.15, 1), unit: 's', digits: 1, ariaLabel: 'Tempo at selected checkpoints' },
  };
  details.querySelectorAll('.axp-details-grid article').forEach((article) => {
    const key = article.querySelector('.axp-kicker')?.textContent?.trim();
    const config = map[key];
    const old = article.querySelector('.axp-sparkline, .axp-chart-empty');
    if (!config || !old) return;
    const holder = document.createElement('div');
    holder.className = 'axpv-details-chart';
    holder.innerHTML = axisLineChart(config.values, labels, config);
    old.replaceWith(holder);
    const copy = article.querySelector('p');
    if (copy) copy.textContent = 'Selected timeline checkpoints shown with labeled axes and recorded values.';
  });
  details.dataset.axpvFixed = 'true';
}

function fixDarkCopy(page) {
  page.querySelectorAll('.axp-flag, .axp-pt-card, .axp-boundary').forEach((node) => node.classList.add('axpv-dark-copy'));
}

export function syncPatientProgressVisualFixes() {
  const page = document.querySelector('.axp-progress-page');
  if (!page) return false;
  ensureStyles();
  const timeline = timelineData(page);
  fixScore(page);
  fixComparison(page, timeline);
  fixTimeline(page, timeline);
  fixDetails(page, timeline);
  fixDarkCopy(page);
  page.dataset.axpvVisualFixes = 'true';
  return true;
}
