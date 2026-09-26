const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[char]));

const pct = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
const signedPct = (value) => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)} pp` : "—";
const signed = (value, suffix = "") => Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}` : "—";

function expectationPills(expectation) {
  const pill = (region, type) => `<span class="wbf-dist-pill wbf-dist-pill--${type}">${escapeHtml(region.replaceAll("_", " "))}</span>`;
  return `<div class="wbf-dist-expectation">
    <div><b>Primary movement</b>${(expectation?.primaryRegions || []).map((region) => pill(region, "primary")).join("")}</div>
    <div><b>Expected support</b>${(expectation?.supportRegions || []).map((region) => pill(region, "support")).join("")}</div>
    <div><b>Other observed regions</b>${(expectation?.outsideRegions || []).map((region) => pill(region, "outside")).join("")}</div>
  </div>`;
}

function distributionBars(distribution) {
  const primary = distribution?.descriptiveStatistics?.primaryMovementShare?.median;
  const support = distribution?.descriptiveStatistics?.supportMovementShare?.median;
  const outside = distribution?.descriptiveStatistics?.outsideMovementShare?.median;
  return `<div class="wbf-dist-bars" aria-label="Median observed movement distribution">
    <div><span><b>Primary</b><em>${pct(primary)}</em></span><i><u style="width:${Number.isFinite(primary) ? Math.max(0, Math.min(100, primary * 100)) : 0}%"></u></i></div>
    <div><span><b>Support</b><em>${pct(support)}</em></span><i><u style="width:${Number.isFinite(support) ? Math.max(0, Math.min(100, support * 100)) : 0}%"></u></i></div>
    <div><span><b>Outside primary/support</b><em>${pct(outside)}</em></span><i><u style="width:${Number.isFinite(outside) ? Math.max(0, Math.min(100, outside * 100)) : 0}%"></u></i></div>
  </div>`;
}

function statCard(label, stats, formatter = pct) {
  if (!stats) return `<article class="wbf-dist-stat"><span>${escapeHtml(label)}</span><b>—</b><small>Insufficient data</small></article>`;
  return `<article class="wbf-dist-stat">
    <span>${escapeHtml(label)}</span><b>${formatter(stats.median)}</b>
    <small>mean ${formatter(stats.mean)} · IQR ${formatter(stats.iqr)} · slope ${signed(stats.slopePerRep)}</small>
  </article>`;
}

function regionRows(distribution) {
  const expectation = distribution?.expectation;
  const outside = expectation?.outsideRegions || [];
  return outside.map((region) => {
    const stats = distribution?.regionContributionShare?.[region];
    return `<div class="wbf-dist-region-row">
      <span>${escapeHtml(region.replaceAll("_", " "))}</span>
      <b>${pct(stats?.median)}</b>
      <small>${Number.isFinite(stats?.slopePerRep) ? `${signed(stats.slopePerRep * 100, " pp/rep")}` : "—"}</small>
    </div>`;
  }).join("");
}

function longitudinalMarkup(history) {
  if (!history || history.status !== "available") {
    return `<div class="wbf-dist-longitudinal"><span>LONGITUDINAL DISTRIBUTION</span><h4>More repeated sessions needed</h4><p>WBF needs quality-gated sessions of the same exercise before comparing movement distribution over time.</p></div>`;
  }
  const primary = history.distributionShifts?.primaryShare;
  const outside = history.distributionShifts?.outsideShare;
  const late = history.distributionShifts?.lateSetOutsideChange;
  const candidate = history.redistributionCandidate;
  return `<div class="wbf-dist-longitudinal">
    <span>LONGITUDINAL DISTRIBUTION · ${history.sessionCount} SESSIONS</span>
    <div class="wbf-dist-long-grid">
      <div><small>Primary share</small><b>${pct(primary?.earlyMedian)} → ${pct(primary?.recentMedian)}</b><em>${signedPct(primary?.delta)}</em></div>
      <div><small>Outside share</small><b>${pct(outside?.earlyMedian)} → ${pct(outside?.recentMedian)}</b><em>${signedPct(outside?.delta)}</em></div>
      <div><small>Late-set outside change</small><b>${pct(late?.earlyMedian)} → ${pct(late?.recentMedian)}</b><em>${signedPct(late?.delta)}</em></div>
    </div>
    ${candidate ? `<div class="wbf-dist-candidate"><b>Observed redistribution candidate</b><p>${escapeHtml(candidate.description)}</p><small>Destination: ${escapeHtml(candidate.destinationRegion.replaceAll("_", " "))} · ${signed(candidate.destinationRegionShift, " SD")}</small></div>` : `<div class="wbf-dist-candidate wbf-dist-candidate--quiet"><b>No persistent distribution shift met the research rule</b><p>Continue collecting same-exercise sessions to improve the within-person reference.</p></div>`}
  </div>`;
}

export function wholeBodyDistributionMarkup(distribution, history = null) {
  if (!distribution || distribution.status !== "available") {
    return `<section class="wbf-dist-panel" data-wbf-distribution><div class="wbf-dist-head"><div><span>AXION WBF</span><h3>Movement Distribution</h3></div><em>DESCRIPTIVE</em></div><p>Movement-distribution statistics are not available for this session.</p></section>`;
  }
  const primaryStats = distribution.descriptiveStatistics?.primaryMovementShare;
  const supportStats = distribution.descriptiveStatistics?.supportMovementShare;
  const outsideStats = distribution.descriptiveStatistics?.outsideMovementShare;
  const ratioStats = distribution.descriptiveStatistics?.outsideToPrimaryRatio;
  const earlyLate = distribution.earlyLateComparison || {};
  const dominant = distribution.dominantOutsideRegion;

  return `<section class="wbf-dist-panel" data-wbf-distribution>
    <div class="wbf-dist-head"><div><span>AXION WBF · MOVEMENT DISTRIBUTION</span><h3>Where did the movement occur?</h3><p>${escapeHtml(distribution.expectation?.movementLabel || distribution.expectation?.signal || "Exercise")} · ${distribution.measuredReps} measured reps</p></div><em>DESCRIPTIVE · UNVALIDATED</em></div>
    ${expectationPills(distribution.expectation)}
    ${distributionBars(distribution)}
    <div class="wbf-dist-stats">
      ${statCard("Primary share", primaryStats)}
      ${statCard("Expected-support share", supportStats)}
      ${statCard("Outside-region share", outsideStats)}
      ${statCard("Outside : primary ratio", ratioStats, (value) => Number.isFinite(value) ? value.toFixed(2) : "—")}
    </div>
    <div class="wbf-dist-detail-grid">
      <article><span>EARLY → LATE SET</span><h4>Does movement spread as the set continues?</h4><div><small>Outside share</small><b>${pct(earlyLate.earlyOutsideShare)} → ${pct(earlyLate.lateOutsideShare)}</b><em>${signedPct(earlyLate.outsideShareChange)}</em></div><div><small>Primary share</small><b>${pct(earlyLate.earlyPrimaryShare)} → ${pct(earlyLate.latePrimaryShare)}</b><em>${signedPct(earlyLate.primaryShareChange)}</em></div></article>
      <article><span>OUTSIDE-REGION BREAKDOWN</span><h4>${dominant ? `Largest median contribution: ${escapeHtml(dominant.label)}` : "No dominant outside region"}</h4><div class="wbf-dist-region-list">${regionRows(distribution)}</div></article>
    </div>
    ${longitudinalMarkup(history)}
    <div class="wbf-dist-foot"><b>Interpretation boundary</b><p>${escapeHtml(distribution.interpretation)}</p><small>Percentages are normalized shares of derived pose-feature excursion, not percentages of force, joint load, muscle activation, or injury risk.</small></div>
  </section>`;
}
