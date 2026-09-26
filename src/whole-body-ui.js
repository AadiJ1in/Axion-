const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}[char]));

const REGION_POINTS = Object.freeze({
  head_neck: [90, 42],
  left_upper_limb: [48, 104],
  right_upper_limb: [132, 104],
  trunk: [90, 120],
  pelvis: [90, 174],
  left_lower_limb: [65, 236],
  right_lower_limb: [115, 236],
  base_of_support: [90, 294],
});

function stateClass(region) {
  if (!region || region.status !== "available") return "wbf-unavailable";
  if (!region.persistent || !Number.isFinite(region.standardizedShift)) return "wbf-stable";
  if (region.direction > 0) return "wbf-increase";
  if (region.direction < 0) return "wbf-decrease";
  return "wbf-stable";
}

function stateLabel(region) {
  if (!region || region.status !== "available") return "Insufficient data";
  if (!region.persistent || !Number.isFinite(region.standardizedShift)) return "No persistent shift";
  if (region.direction > 0) return "Increased deviation from early reference";
  if (region.direction < 0) return "Decreased deviation from early reference";
  return "No persistent shift";
}

function scoreText(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)} SD` : "—";
}

function bodySvg(regions) {
  const nodes = Object.entries(REGION_POINTS).map(([key, [x, y]]) => {
    const region = regions.get(key);
    return `<g class="wbf-region-node ${stateClass(region)}" data-wbf-region="${escapeHtml(key)}">
      <circle cx="${x}" cy="${y}" r="12" />
      <text x="${x}" y="${y + 3}" text-anchor="middle">${Number.isFinite(region?.standardizedShift) ? Math.round(Math.abs(region.standardizedShift) * 10) / 10 : "·"}</text>
    </g>`;
  }).join("");

  return `<svg class="wbf-body-map" viewBox="0 0 180 330" role="img" aria-label="Whole-body descriptive movement change map">
    <circle class="wbf-body-outline" cx="90" cy="32" r="22" />
    <path class="wbf-body-outline" d="M90 54v112M52 84l38 18 38-18M52 84 30 146M128 84l22 62M90 166 61 226M90 166 119 226M61 226 48 304M119 226l13 78M43 304h18M123 304h18" />
    ${nodes}
  </svg>`;
}

function migrationMarkup(candidates) {
  if (!candidates?.length) {
    return `<div class="wbf-empty-pattern"><b>No persistent redistribution candidate</b><p>No cross-region inverse-change pattern met the current descriptive threshold.</p></div>`;
  }
  return candidates.slice(0, 3).map((candidate, index) => `<article class="wbf-migration-card">
    <span>Pattern ${index + 1}</span>
    <h4>${escapeHtml(candidate.fromLabel)} → ${escapeHtml(candidate.toLabel)}</h4>
    <p>${escapeHtml(candidate.description)}</p>
    <div><small>${escapeHtml(candidate.fromLabel)}</small><b>${scoreText(candidate.sourceShift)}</b></div>
    <i aria-hidden="true">→</i>
    <div><small>${escapeHtml(candidate.toLabel)}</small><b>${scoreText(candidate.destinationShift)}</b></div>
  </article>`).join("");
}

function regionRows(regionShifts) {
  return regionShifts.map((region) => `<button class="wbf-region-row ${stateClass(region)}" type="button" data-wbf-region-row="${escapeHtml(region.region)}">
    <span class="wbf-region-dot" aria-hidden="true"></span>
    <span><b>${escapeHtml(region.label)}</b><small>${escapeHtml(stateLabel(region))}</small></span>
    <strong>${scoreText(region.standardizedShift)}</strong>
  </button>`).join("");
}

function driftRows(drift) {
  if (!drift?.length) return `<p class="wbf-muted">No rep-to-rep drift summary is available for the latest session.</p>`;
  return drift.slice(0, 4).map((item) => `<div class="wbf-drift-row">
    <span>${escapeHtml(item.label)}</span>
    <b>${Number.isFinite(item.normalizedSlopePerRep) ? `${item.normalizedSlopePerRep > 0 ? "+" : ""}${item.normalizedSlopePerRep.toFixed(2)} SD/rep` : "—"}</b>
    <small>${escapeHtml(item.strongestFeature?.feature || "")}</small>
  </div>`).join("");
}

export function wholeBodyAnalysisMarkup(analysis, { title = "Whole-Body Movement Analysis" } = {}) {
  if (!analysis || analysis.status !== "available") {
    const reason = analysis?.reason ? String(analysis.reason).replaceAll("_", " ") : "No analysis available";
    return `<section class="wbf-panel wbf-panel--unavailable" data-wbf-analysis>
      <div class="wbf-panel-head"><div><span>AXION WBF</span><h2>${escapeHtml(title)}</h2></div><em>DESCRIPTIVE</em></div>
      <div class="wbf-empty-pattern"><b>Whole-body trend not ready</b><p>${escapeHtml(reason)}. WBF requires repeated quality-gated sessions of the same exercise for the same patient.</p></div>
    </section>`;
  }

  const regions = new Map((analysis.regionShifts || []).map((region) => [region.region, region]));
  const strongestIncrease = analysis.strongestIncreaseFromEarlyReference;
  const strongestDecrease = analysis.strongestDecreaseFromEarlyReference;

  return `<section class="wbf-panel" data-wbf-analysis>
    <div class="wbf-panel-head">
      <div><span>AXION WBF · WHOLE-BODY FEATURE</span><h2>${escapeHtml(title)}</h2><p>Within-person comparison of repeated ${escapeHtml(analysis.exerciseKey)} sessions. Region changes are descriptive and quality-gated.</p></div>
      <em>DESCRIPTIVE · UNVALIDATED</em>
    </div>
    <div class="wbf-grid">
      <article class="wbf-map-card">
        <div class="wbf-card-head"><div><span>BODY MAP</span><h3>Where movement changed</h3></div><small>${analysis.sessionCount} sessions</small></div>
        <div class="wbf-map-layout">${bodySvg(regions)}<div class="wbf-region-list">${regionRows(analysis.regionShifts || [])}</div></div>
        <div class="wbf-legend"><span class="wbf-increase"><i></i>Increased deviation</span><span class="wbf-decrease"><i></i>Decreased deviation</span><span class="wbf-stable"><i></i>No persistent shift</span></div>
      </article>
      <article class="wbf-summary-card">
        <div class="wbf-card-head"><div><span>COMPENSATION MIGRATION</span><h3>Cross-region redistribution candidates</h3></div></div>
        <div class="wbf-callouts">
          <div><small>Largest increase</small><b>${escapeHtml(strongestIncrease?.label || "—")}</b><span>${scoreText(strongestIncrease?.standardizedShift)}</span></div>
          <div><small>Largest decrease</small><b>${escapeHtml(strongestDecrease?.label || "—")}</b><span>${scoreText(strongestDecrease?.standardizedShift)}</span></div>
        </div>
        <div class="wbf-migrations">${migrationMarkup(analysis.migrationCandidates)}</div>
        <div class="wbf-drift"><span>LATEST SESSION · REP-TO-REP DRIFT</span>${driftRows(analysis.latestSessionRepDrift)}</div>
      </article>
    </div>
    <div class="wbf-explainer"><b>How to read this</b><p>${escapeHtml(analysis.interpretation)}</p><small>WBF does not diagnose injury, estimate tissue load, establish causation, or autonomously change treatment. A therapist reviews these descriptive movement patterns in context.</small></div>
  </section>`;
}
