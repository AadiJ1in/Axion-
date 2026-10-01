const BASE_STYLE_ID = 'axion-patient-progress-surface-css';
const DEMO_ATTR = 'data-axion-demo-progress-mirrored';
const ENHANCED_ATTR = 'data-axion-progress-enhanced';

const checkpoints = Object.freeze([
  Object.freeze({ date: 'Aug 26', label: 'Baseline', consistency: 78, range: 69, symmetry: 6.2, tempo: 1.5, note: 'Starting reference for this exercise.' }),
  Object.freeze({ date: 'Aug 30', label: 'Session 2', consistency: 89, range: 73, symmetry: 6.8, tempo: 2.0, note: 'Recorded checkpoint from this exercise history.' }),
  Object.freeze({ date: 'Sep 7', label: 'Session 3', consistency: 88, range: 77, symmetry: 7.5, tempo: 2.6, note: 'Recorded checkpoint from this exercise history.' }),
  Object.freeze({ date: 'Today', label: 'Today', consistency: 86, range: 80, symmetry: 8.3, tempo: 3.0, note: 'Most recent recorded movement summary.' }),
]);

function ensureBaseStyles() {
  if (document.getElementById(BASE_STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = BASE_STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./patient-progress-surface.css', import.meta.url).href;
  document.head.appendChild(link);
}

function isPatientDemoProgress(page) {
  if (!page || page.hasAttribute(DEMO_ATTR)) return false;
  const patientBackLink = page.querySelector('.report-header .back-link[data-nav="patient"]');
  const syntheticStory = [...page.querySelectorAll('.info-pill')]
    .some((node) => /synthetic story/i.test(node.textContent || ''));
  return Boolean(patientBackLink && syntheticStory && page.querySelector('.progress-comparison'));
}

function comparisonMarkup() {
  return `
    <section class="axp-comparison" data-axion-demo-chart-section>
      <div class="axp-comparison-head">
        <div>
          <span class="axp-kicker">BASELINE VS TODAY</span>
          <h2>Movement changed measurably.</h2>
          <p>Your movement trajectory, knee bend, and left/right variation are summarized from your own completed sessions.</p>
        </div>
        <span class="axp-window">4-WEEK VIEW</span>
      </div>
      <div class="axp-comparison-grid">
        <article>
          <div class="axp-session-title"><span>BASELINE</span><b>Consistency 78</b></div>
          <div class="axp-mini-metrics">
            <span>Range<b>69°</b></span>
            <span>Symmetry Δ<b>6.2°</b></span>
            <span>Tempo<b>1.5s</b></span>
          </div>
        </article>
        <div class="axp-comparison-arrow"><span>→</span><small>32 days</small></div>
        <article class="today">
          <div class="axp-session-title"><span>TODAY · SESSION 5</span><b>Consistency 86</b></div>
          <div class="axp-mini-metrics">
            <span>Range<b>80°</b><em>+11°</em></span>
            <span>Symmetry Δ<b>8.3°</b><em>+2.1°</em></span>
            <span>Tempo<b>3.0s</b><em>+1.5s</em></span>
          </div>
        </article>
      </div>
    </section>`;
}

function timelineCard(point, index) {
  return `
    <article class="axp-week${index === checkpoints.length - 1 ? ' current' : ''}">
      <span class="axp-week-node">${index + 1}</span>
      <div class="axp-week-label"><small>${point.date}</small><b>${point.label}</b></div>
      <svg class="axp-motion-signature" viewBox="0 0 300 80" aria-hidden="true"></svg>
      <div class="axp-week-stats">
        <span>Consistency <b>${point.consistency}</b></span>
        <span>Symmetry Δ <b>${point.symmetry.toFixed(1)}°</b></span>
        <span>Tempo <b>${point.tempo.toFixed(1)}s</b></span>
      </div>
      <p>${point.note}</p>
    </article>`;
}

function longitudinalMarkup() {
  return `
    <section class="axp-longitudinal" data-axion-demo-chart-section>
      <div class="axp-section-head">
        <div>
          <span class="axp-kicker">THERAPIST DRILL-DOWN</span>
          <h3>Four-week movement timeline</h3>
          <p>One coherent view of adherence context and descriptive movement changes for this exercise.</p>
        </div>
        <span class="axp-pill">PATIENT DATA</span>
      </div>
      <div class="axp-weeks">${checkpoints.map(timelineCard).join('')}</div>
      <div class="axp-flag">
        <span class="axp-flag-icon">✦</span>
        <div>
          <span class="axp-kicker">WHY AXION FLAGGED THIS</span>
          <p><b>Movement change for review:</b> Axion surfaced this change because movement consistency 78 → 86, symmetry delta 6.2° → 8.3°, tempo 1.5s → 3.0s.</p>
        </div>
      </div>
    </section>`;
}

function replaceCharts(page) {
  const comparison = page.querySelector('.progress-comparison');
  if (!comparison) return false;
  comparison.outerHTML = comparisonMarkup();

  const longitudinal = page.querySelector('.longitudinal-card');
  if (longitudinal) longitudinal.outerHTML = longitudinalMarkup();

  const analysis = page.querySelector('.analysis-grid');
  if (analysis) {
    analysis.querySelector('.signature-panel')?.remove();
    analysis.querySelector('.heatmap-card')?.remove();
    if (!analysis.children.length) analysis.remove();
  }

  page.classList.add('axp-progress-page');
  page.setAttribute(DEMO_ATTR, 'true');
  page.setAttribute(ENHANCED_ATTR, 'true');
  return true;
}

export function syncPatientDemoProgress() {
  const page = document.querySelector('main.report-page');
  if (!isPatientDemoProgress(page)) return false;
  ensureBaseStyles();
  if (!replaceCharts(page)) return false;

  void import('./patient-progress-visual-fixes.js')
    .then((module) => module.syncPatientProgressVisualFixes?.())
    .catch((error) => console.warn('Patient demo progress chart polish unavailable', error));
  return true;
}
