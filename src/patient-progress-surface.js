import { supabase } from './supabase.js';
import { assignmentDetails, loadMovementReport } from './portal.js';

const STYLE_ID = 'axion-patient-progress-surface-css';
const ENHANCED_ATTR = 'data-axion-progress-enhanced';
const loadingPatients = new Set();

const html = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[char]));
const finite = (value) => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const average = (values) => {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
};
const fmt = (value, digits = 0, suffix = '') => {
  const n = finite(value);
  if (n === null) return '—';
  return `${n.toFixed(digits)}${suffix}`;
};
const signed = (value, digits = 1, suffix = '') => {
  const n = finite(value);
  if (n === null) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}${suffix}`;
};

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./patient-progress-surface.css', import.meta.url).href;
  document.head.appendChild(link);
}

function sessionStats(session) {
  const summary = session?.movement_summary || {};
  return Object.freeze({
    consistency: finite(summary.movement_consistency ?? session?.quality_score),
    kneeBend: finite(summary.average_knee_bend_degrees),
    jointAngle: finite(summary.average_joint_angle_degrees ?? summary.average_depth_angle),
    movementRange: finite(summary.average_joint_movement_range_degrees),
    tempo: finite(summary.average_tempo_seconds),
    symmetry: finite(summary.average_symmetry_delta),
    trackedJoint: summary.tracked_joint || 'knee',
    repetitions: finite(session?.repetitions) ?? 0,
    targetRepetitions: finite(summary.prescribed_reps_per_set) && finite(summary.prescribed_sets)
      ? finite(summary.prescribed_reps_per_set) * finite(summary.prescribed_sets)
      : null,
    difficulty: finite(session?.difficulty),
    discomfort: session?.discomfort || null,
  });
}

function normalizedRepSummaries(session) {
  const raw = session?.movement_summary?.rep_summaries;
  if (!Array.isArray(raw)) return [];
  return raw.map((rep, index) => {
    const jointAngle = finite(rep.jointAngle ?? rep.joint_angle ?? rep.depthAngle ?? rep.depth_angle);
    const kneeBend = finite(rep.kneeBendDegrees ?? rep.knee_bend_degrees)
      ?? (jointAngle === null ? null : Math.max(0, 180 - jointAngle));
    return Object.freeze({
      index: Number(rep.index) || index + 1,
      jointAngle,
      kneeBend,
      movementRange: finite(rep.movementRangeDegrees ?? rep.movement_range_degrees),
      tempo: finite(rep.tempo ?? rep.tempoSeconds ?? rep.tempo_seconds),
      symmetry: finite(rep.symmetryDelta ?? rep.symmetry_delta),
      consistency: finite(rep.consistency),
    });
  }).filter((rep) => rep.index > 0);
}

function chronologicalSameExercise(sessions, exerciseKey) {
  return sessions
    .filter((session) => session.exercise_key === exerciseKey)
    .sort((a, b) => new Date(a.completed_at || a.created_at) - new Date(b.completed_at || b.created_at));
}

function chooseCheckpoints(sessions, count = 4) {
  if (sessions.length <= count) return sessions;
  const indexes = new Set([0, sessions.length - 1]);
  for (let i = 1; i < count - 1; i += 1) indexes.add(Math.round((i * (sessions.length - 1)) / (count - 1)));
  return [...indexes].sort((a, b) => a - b).map((index) => sessions[index]);
}

function scoreFor(session) {
  // The UI calls this a session score because that is the desired product language,
  // but the displayed value remains the recorded movement-consistency statistic.
  // It is not converted into a prognosis or clinical risk score.
  return Math.round(clamp(sessionStats(session).consistency ?? 0, 0, 100));
}

function metricDelta(current, baseline, key) {
  const now = finite(current?.[key]);
  const prior = finite(baseline?.[key]);
  return now === null || prior === null ? null : now - prior;
}

function chartPoints(values, width = 250, height = 82, padding = 9) {
  const usable = values.map(finite);
  const finiteValues = usable.filter(Number.isFinite);
  if (finiteValues.length < 2) return '';
  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const span = Math.max(max - min, 1);
  const count = usable.length;
  return usable.map((value, index) => {
    if (!Number.isFinite(value)) return null;
    const x = padding + (index / Math.max(1, count - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
}

function trendChart(sessions, key, { invert = false } = {}) {
  const values = sessions.map((session) => sessionStats(session)[key]);
  const points = chartPoints(values);
  if (!points) return `<div class="axp-chart-empty">More sessions needed for a trend.</div>`;
  const coords = points.split(' ').map((pair) => pair.split(',').map(Number));
  const final = coords.at(-1);
  return `<svg class="axp-sparkline${invert ? ' axp-sparkline--invert' : ''}" viewBox="0 0 250 82" aria-hidden="true"><defs><linearGradient id="axp-fill-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity=".22"/><stop offset="1" stop-opacity="0"/></linearGradient></defs><polyline class="axp-sparkline-shadow" points="${points}"/><polyline class="axp-sparkline-line" points="${points}"/><circle cx="${final[0]}" cy="${final[1]}" r="4.5"/></svg>`;
}

function motionSignatureSvg(stats, id) {
  const consistency = clamp(stats.consistency ?? 65, 0, 100);
  const symmetry = clamp(stats.symmetry ?? 8, 0, 20);
  const tightness = 22 - (consistency / 100) * 12 + symmetry * .18;
  return `<svg class="axp-motion-signature" viewBox="0 0 300 112" role="img" aria-label="Descriptive movement signature"><defs><linearGradient id="sig-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-opacity=".35"/><stop offset=".5" stop-opacity="1"/><stop offset="1" stop-opacity=".35"/></linearGradient></defs><path d="M12 65 C52 ${45 - tightness / 2}, 84 ${78 + tightness / 3}, 121 57 S192 ${43 + tightness / 4}, 228 59 S270 ${72 + tightness / 4}, 290 47"/><path class="ghost" d="M12 69 C52 ${49 + tightness / 2}, 84 ${71 - tightness / 3}, 121 62 S192 ${51 - tightness / 4}, 228 65 S270 ${66 - tightness / 4}, 290 53"/><circle cx="121" cy="57" r="5"/><circle cx="228" cy="59" r="5"/></svg>`;
}

function descriptiveSkeleton(rep) {
  const bend = clamp(rep?.kneeBend ?? 55, 0, 120);
  const t = bend / 120;
  const hipY = 116 + t * 16;
  const kneeY = 170 + t * 15;
  const leftKneeX = 102 - t * 18;
  const rightKneeX = 158 + t * 18;
  const ankleY = 230;
  return `<svg class="axp-replay-skeleton" viewBox="0 0 260 270" aria-label="Illustrative reconstruction from derived joint summary"><g class="bones"><line x1="130" y1="52" x2="130" y2="${hipY}"/><line x1="92" y1="78" x2="168" y2="78"/><line x1="92" y1="78" x2="62" y2="122"/><line x1="168" y1="78" x2="198" y2="122"/><line x1="130" y1="${hipY}" x2="${leftKneeX}" y2="${kneeY}"/><line x1="130" y1="${hipY}" x2="${rightKneeX}" y2="${kneeY}"/><line x1="${leftKneeX}" y1="${kneeY}" x2="104" y2="${ankleY}"/><line x1="${rightKneeX}" y1="${kneeY}" x2="156" y2="${ankleY}"/></g><g class="joints"><circle cx="130" cy="40" r="18"/><circle cx="92" cy="78" r="7"/><circle cx="168" cy="78" r="7"/><circle cx="130" cy="${hipY}" r="8"/><circle cx="${leftKneeX}" cy="${kneeY}" r="8"/><circle cx="${rightKneeX}" cy="${kneeY}" r="8"/><circle cx="104" cy="${ankleY}" r="7"/><circle cx="156" cy="${ankleY}" r="7"/></g></svg>`;
}

function patternText(reps) {
  if (reps.length < 4) return 'Per-repetition movement detail will appear after a session saves detailed rep summaries.';
  const third = Math.max(1, Math.floor(reps.length / 3));
  const first = reps.slice(0, third);
  const middle = reps.slice(third, reps.length - third);
  const late = reps.slice(reps.length - third);
  const avgConsistency = (set) => average(set.map((rep) => rep.consistency));
  const firstC = avgConsistency(first);
  const midC = avgConsistency(middle);
  const lateC = avgConsistency(late);
  if ([firstC, midC, lateC].every(Number.isFinite)) {
    const bestWindow = midC >= firstC && midC >= lateC ? 'middle' : firstC >= lateC ? 'opening' : 'closing';
    const lateTempo = average(late.map((rep) => rep.tempo));
    const firstTempo = average(first.map((rep) => rep.tempo));
    const tempoCopy = Number.isFinite(lateTempo) && Number.isFinite(firstTempo)
      ? lateTempo > firstTempo + .2 ? ' Tempo slowed later in the set.' : lateTempo < firstTempo - .2 ? ' Tempo became quicker later in the set.' : ' Tempo stayed relatively similar.'
      : '';
    return `The ${bestWindow} repetitions were the most consistent.${tempoCopy}`;
  }
  return 'Rep-level descriptive values are shown in sequence so changes across the set can be reviewed without assigning a diagnosis.';
}

function repScore(rep) {
  if (Number.isFinite(rep.consistency)) return Math.round(clamp(rep.consistency, 0, 100));
  const symmetryPenalty = Number.isFinite(rep.symmetry) ? clamp(rep.symmetry * 2, 0, 35) : 10;
  return Math.round(clamp(92 - symmetryPenalty, 45, 98));
}

function historyLabel(index, total) {
  if (index === 0) return 'Baseline';
  if (index === total - 1) return 'Today';
  return `Session ${index + 1}`;
}

function timelineCard(session, index, total) {
  const stats = sessionStats(session);
  const date = new Date(session.completed_at || session.created_at);
  return `<article class="axp-week${index === total - 1 ? ' current' : ''}"><span class="axp-week-node">${index + 1}</span><div class="axp-week-label"><small>${index === total - 1 ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small><b>${html(historyLabel(index, total))}</b></div>${motionSignatureSvg(stats, `week-${index}`)}<div class="axp-week-stats"><span>Consistency <b>${fmt(stats.consistency)}</b></span><span>Symmetry Δ <b>${fmt(stats.symmetry, 1, '°')}</b></span><span>Tempo <b>${fmt(stats.tempo, 1, 's')}</b></span></div><p>${index === 0 ? 'Starting reference for this exercise.' : index === total - 1 ? 'Most recent recorded movement summary.' : 'Recorded checkpoint from this exercise history.'}</p></article>`;
}

function flagCopy(baselineStats, latestStats) {
  const parts = [];
  if (Number.isFinite(baselineStats.consistency) && Number.isFinite(latestStats.consistency)) parts.push(`movement consistency ${Math.round(baselineStats.consistency)} → ${Math.round(latestStats.consistency)}`);
  if (Number.isFinite(baselineStats.symmetry) && Number.isFinite(latestStats.symmetry)) parts.push(`symmetry delta ${baselineStats.symmetry.toFixed(1)}° → ${latestStats.symmetry.toFixed(1)}°`);
  if (Number.isFinite(baselineStats.tempo) && Number.isFinite(latestStats.tempo)) parts.push(`tempo ${baselineStats.tempo.toFixed(1)}s → ${latestStats.tempo.toFixed(1)}s`);
  if (baselineStats.discomfort !== latestStats.discomfort && latestStats.discomfort) parts.push(`reported discomfort is now ${latestStats.discomfort}`);
  return parts.length ? `Axion surfaced this change because ${parts.join(', ')}.` : 'Axion is waiting for enough comparable descriptive measurements to explain a longitudinal change.';
}

function renderRepWorkspace(reps, selectedIndex = 0) {
  if (!reps.length) {
    return `<section class="axp-rep-empty"><div><span class="axp-kicker">SESSION TIMELINE</span><h3>Rep sequence</h3><p>This completed session predates detailed per-rep summary storage. Axion will not invent a rep timeline or skeleton replay for an older record.</p></div><span>Aggregate session statistics above remain available.</span></section>`;
  }
  const selected = reps[Math.min(selectedIndex, reps.length - 1)] || reps[0];
  const ranked = [...reps].sort((a, b) => repScore(b) - repScore(a));
  const best = ranked[0];
  const shift = ranked.at(-1);
  return `<section class="axp-rep-workspace" data-axp-rep-workspace>
    <aside class="axp-rep-rail"><div class="axp-section-head"><div><span class="axp-kicker">SESSION TIMELINE</span><h3>Rep sequence</h3></div><span>${reps.length} reps</span></div><div class="axp-rep-list">${reps.map((rep, index) => `<button type="button" class="${index === selectedIndex ? 'selected' : ''}" data-axp-rep="${index}"><span>${String(rep.index).padStart(2, '0')}</span><div><b>Rep ${rep.index}</b><small>${fmt(rep.kneeBend, 0, '°')} bend · ${fmt(rep.tempo, 1, 's')} · Δ ${fmt(rep.symmetry, 1, '°')}</small></div><i style="--rep-score:${repScore(rep)}%"></i></button>`).join('')}</div></aside>
    <article class="axp-replay-card"><div class="axp-section-head"><div><span class="axp-kicker">SKELETON REPLAY</span><h3>Rep ${selected.index}</h3></div><span class="axp-pill">DERIVED SUMMARY</span></div><div class="axp-replay-stage">${descriptiveSkeleton(selected)}<div class="axp-replay-metrics"><span><small>KNEE BEND</small><b>${fmt(selected.kneeBend, 0, '°')}</b></span><span><small>TEMPO</small><b>${fmt(selected.tempo, 1, 's')}</b></span><span><small>SYMMETRY Δ</small><b>${fmt(selected.symmetry, 1, '°')}</b></span></div><p>Illustrative reconstruction from saved derived joint summaries · no raw video.</p></div><div class="axp-replay-footer"><button type="button" class="axp-play" aria-label="Animate illustrative replay" data-axp-play>▶</button><span>REP ${selected.index} / ${reps.length}</span></div></article>
    <aside class="axp-insights"><article class="axp-highlight best"><span>✦ BEST REP</span><h3>#${best.index}</h3><div><span>Bend <b>${fmt(best.kneeBend, 0, '°')}</b></span><span>Consistency <b>${repScore(best)}</b></span><span>Tempo <b>${fmt(best.tempo, 1, 's')}</b></span></div></article><article class="axp-highlight shift"><span>PERFORMANCE SHIFT</span><h3>#${shift.index}</h3><p>Movement values varied most here. Review the sequence before drawing a conclusion.</p><div><span>Bend <b>${fmt(shift.kneeBend, 0, '°')}</b></span><span>Consistency <b>${repScore(shift)}</b></span></div></article><article class="axp-pattern"><span class="axp-kicker">SESSION PATTERN</span><p>${html(patternText(reps))}</p></article></aside>
  </section>`;
}

function renderProgress(main, { patient, sessions }) {
  if (!sessions.length) return;
  const latest = sessions[0];
  const latestStats = sessionStats(latest);
  const exercise = assignmentDetails({ exercise_key: latest.exercise_key }).display_name;
  const sameExercise = chronologicalSameExercise(sessions, latest.exercise_key);
  const baseline = sameExercise[0] || latest;
  const baselineStats = sessionStats(baseline);
  const checkpoints = chooseCheckpoints(sameExercise, 4);
  const reps = normalizedRepSummaries(latest);
  const sessionScore = scoreFor(latest);
  const initials = (patient.display_name || 'Patient').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const target = latestStats.targetRepetitions || Math.max(latestStats.repetitions, 1);
  const completion = Math.round(clamp((latestStats.repetitions / Math.max(target, 1)) * 100, 0, 100));
  const consistencyDelta = metricDelta(latestStats, baselineStats, 'consistency');
  const symmetryDelta = metricDelta(latestStats, baselineStats, 'symmetry');
  const tempoDelta = metricDelta(latestStats, baselineStats, 'tempo');
  const depthKey = Number.isFinite(latestStats.movementRange) ? 'movementRange' : Number.isFinite(latestStats.kneeBend) ? 'kneeBend' : 'jointAngle';
  const depthLabel = depthKey === 'movementRange' ? 'Range' : depthKey === 'kneeBend' ? 'Knee bend' : 'Joint angle';
  const depthDelta = metricDelta(latestStats, baselineStats, depthKey);
  const historyWindowDays = sameExercise.length > 1 ? Math.round((new Date(latest.completed_at || latest.created_at) - new Date(baseline.completed_at || baseline.created_at)) / 86400000) : 0;
  const historyWindowLabel = historyWindowDays >= 21 && historyWindowDays <= 42 ? '4-WEEK VIEW' : sameExercise.length > 1 ? `${sameExercise.length}-SESSION VIEW` : 'LATEST SESSION';

  main.className = 'report-page axp-progress-page container-wide';
  main.setAttribute(ENHANCED_ATTR, 'true');
  main.innerHTML = `
    <header class="axp-progress-header"><div><span class="axp-kicker">PROGRESS</span><h1>Your Progress</h1><p>${html(exercise)} · Latest completed session</p></div><div class="axp-header-actions"><span class="axp-avatar">${html(initials)}</span><button type="button" class="axp-export" data-axp-export>Export summary</button></div></header>
    <section class="axp-intro"><span class="axp-kicker">YOUR RECOVERY</span><h2>Recent progress at a glance</h2><p>Start with the key trends. Open movement details only when you want them.</p></section>
    <section class="axp-score-card"><div class="axp-score-ring" style="--score:${sessionScore}"><svg viewBox="0 0 112 112"><circle cx="56" cy="56" r="46"/><circle class="progress" cx="56" cy="56" r="46" pathLength="100"/></svg><span><b>${sessionScore || '—'}</b><small>SESSION SCORE</small></span></div><div class="axp-score-copy"><span class="axp-kicker">SESSION SUMMARY</span><h2>Movement consistency at a glance.</h2><p>A session-level summary of completion, movement consistency, measured range, and your reported difficulty. It is not a medical prognosis.</p></div><div class="axp-score-factors"><div><span>REPETITIONS</span><b>${latestStats.repetitions}/${target}</b><small>Completed</small></div><div><span>AVG. KNEE BEND</span><b>${fmt(latestStats.kneeBend, 0, '°')}</b><small>Descriptive range</small></div><div><span>AVG. TEMPO</span><b>${fmt(latestStats.tempo, 1, 's')}</b><small>${Number.isFinite(tempoDelta) && tempoDelta < -.15 ? 'Quicker than baseline' : 'Recorded tempo'}</small></div></div></section>
    <section class="axp-comparison"><div class="axp-comparison-head"><div><span class="axp-kicker">BASELINE VS TODAY</span><h2>${sameExercise.length > 1 ? 'Movement changed measurably.' : 'Your latest movement summary.'}</h2><p>Your movement trajectory, knee bend, and left/right variation are summarized from your own completed sessions.</p></div><span class="axp-window">${historyWindowLabel}</span></div><div class="axp-comparison-grid"><article><div class="axp-session-title"><span>${sameExercise.length > 1 ? 'BASELINE' : 'LATEST SESSION'}</span><b>Consistency ${fmt(baselineStats.consistency)}</b></div>${trendChart(checkpoints, 'consistency')}<div class="axp-mini-metrics"><span>${depthLabel}<b>${fmt(baselineStats[depthKey], 0, '°')}</b></span><span>Symmetry Δ<b>${fmt(baselineStats.symmetry, 1, '°')}</b></span><span>Tempo<b>${fmt(baselineStats.tempo, 1, 's')}</b></span></div></article><div class="axp-comparison-arrow"><span>→</span><small>${historyWindowDays ? `${historyWindowDays} days` : 'latest'}</small></div><article class="today"><div class="axp-session-title"><span>TODAY · ${sameExercise.length > 1 ? `SESSION ${sameExercise.length}` : 'LATEST'}</span><b>Consistency ${fmt(latestStats.consistency)}</b></div>${trendChart(checkpoints, 'consistency')}<div class="axp-mini-metrics"><span>${depthLabel}<b>${fmt(latestStats[depthKey], 0, '°')}</b><em>${signed(depthDelta, 0, '°')}</em></span><span>Symmetry Δ<b>${fmt(latestStats.symmetry, 1, '°')}</b><em>${signed(symmetryDelta, 1, '°')}</em></span><span>Tempo<b>${fmt(latestStats.tempo, 1, 's')}</b><em>${signed(tempoDelta, 1, 's')}</em></span></div></article></div></section>
    <div data-axp-rep-host>${renderRepWorkspace(reps, 0)}</div>
    <section class="axp-longitudinal"><div class="axp-section-head"><div><span class="axp-kicker">THERAPIST DRILL-DOWN</span><h3>${historyWindowDays >= 21 && historyWindowDays <= 42 ? 'Four-week movement timeline' : 'Movement timeline'}</h3><p>One coherent view of adherence context and descriptive movement changes for this exercise.</p></div><span class="axp-pill">PATIENT DATA</span></div><div class="axp-weeks">${checkpoints.map((session, index) => timelineCard(session, index, checkpoints.length)).join('')}</div><div class="axp-flag"><span class="axp-flag-icon">✦</span><div><span class="axp-kicker">WHY AXION FLAGGED THIS</span><p><b>${sameExercise.length > 1 ? 'Movement change for review:' : 'More history needed:'}</b> ${html(flagCopy(baselineStats, latestStats))}</p></div></div></section>
    <details class="axp-details"><summary><span>More movement details</span><small>Open descriptive analytics</small></summary><div class="axp-details-grid"><article><span class="axp-kicker">MOTION SIGNATURE</span><h3>Consistency across sessions</h3>${trendChart(sameExercise.slice(-12), 'consistency')}<p>Recorded movement-consistency values for this same exercise.</p></article><article><span class="axp-kicker">SYMMETRY TREND</span><h3>Left/right variation</h3>${trendChart(sameExercise.slice(-12), 'symmetry', { invert: true })}<p>Descriptive symmetry delta only. Smaller is not automatically equivalent to clinical recovery.</p></article><article><span class="axp-kicker">TEMPO TREND</span><h3>Movement timing</h3>${trendChart(sameExercise.slice(-12), 'tempo')}<p>Recorded average tempo from each comparable session.</p></article></div></details>
    <section class="axp-pt-card"><div><span class="axp-kicker">SHARE CONTEXT WITH YOUR CARE TEAM</span><h3>Tell your physical therapist what you noticed.</h3><p>Movement data cannot explain pain, effort, confidence, or symptoms by itself. Your report adds the context your therapist needs.</p></div><button type="button" data-axp-open-report>Open patient report</button></section>
    <section class="axp-boundary"><b>Descriptive statistics only.</b><span>Axion summarizes authorized session measurements. It does not diagnose an injury, predict recovery, or autonomously change your treatment plan. Raw camera video is not stored.</span></section>`;

  bindProgressEvents(main, { patient, sessions, latest, reps });
}

function bindProgressEvents(main, context) {
  main.querySelectorAll('[data-axp-rep]').forEach((button) => button.addEventListener('click', () => {
    const host = main.querySelector('[data-axp-rep-host]');
    if (!host) return;
    host.innerHTML = renderRepWorkspace(context.reps, Number(button.dataset.axpRep) || 0);
    bindProgressEvents(main, context);
  }));
  main.querySelector('[data-axp-play]')?.addEventListener('click', (event) => {
    const skeleton = main.querySelector('.axp-replay-skeleton');
    skeleton?.classList.remove('playing');
    void skeleton?.offsetWidth;
    skeleton?.classList.add('playing');
    event.currentTarget.textContent = '↻';
  });
  main.querySelector('[data-axp-export]')?.addEventListener('click', () => {
    const stats = sessionStats(context.latest);
    const lines = [
      'AXION PATIENT PROGRESS SUMMARY',
      'Descriptive statistics only',
      '',
      `Patient: ${context.patient.display_name || 'Patient'}`,
      `Exercise: ${assignmentDetails({ exercise_key: context.latest.exercise_key }).display_name}`,
      `Completed: ${new Date(context.latest.completed_at || context.latest.created_at).toLocaleString()}`,
      `Repetitions: ${stats.repetitions}`,
      `Movement consistency: ${stats.consistency ?? 'Not recorded'}`,
      `Average knee bend: ${stats.kneeBend ?? 'Not recorded'}°`,
      `Average tempo: ${stats.tempo ?? 'Not recorded'}s`,
      `Symmetry delta: ${stats.symmetry ?? 'Not recorded'}°`,
      '',
      'This export contains no raw camera video and is not a diagnosis, prognosis, or treatment recommendation.',
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `axion-progress-${new Date(context.latest.completed_at || context.latest.created_at).toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  main.querySelector('[data-axp-open-report]')?.addEventListener('click', () => {
    const existing = document.querySelector('[data-nav="patient-report"]');
    if (existing && !main.contains(existing)) existing.click();
  });
}

async function enhanceAuthenticatedPatientProgress(main) {
  if (!supabase || main.hasAttribute(ENHANCED_ATTR)) return;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user?.id || loadingPatients.has(user.id)) return;
  loadingPatients.add(user.id);
  try {
    const profileResult = await supabase.from('profiles').select('id,display_name,role').eq('id', user.id).maybeSingle();
    if (profileResult.error || profileResult.data?.role !== 'patient') return;
    const sessions = await loadMovementReport(supabase, user.id);
    if (!sessions.length) return;
    if (!document.documentElement.contains(main) || !main.classList.contains('report-page')) return;
    ensureStyles();
    renderProgress(main, { patient: profileResult.data, sessions });
  } catch (error) {
    console.warn('Patient progress enhancement unavailable', error);
  } finally {
    loadingPatients.delete(user.id);
  }
}

export function syncPatientProgressSurface() {
  const main = document.querySelector('main.report-page:not(.report-page--empty)');
  if (!main || main.hasAttribute(ENHANCED_ATTR)) return;
  void enhanceAuthenticatedPatientProgress(main);
}
