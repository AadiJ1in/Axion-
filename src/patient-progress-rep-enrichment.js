import { supabase } from './supabase.js';

const finite = (value) => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const fmt = (value, digits = 0, suffix = '') => {
  const n = finite(value);
  return n === null ? '—' : `${n.toFixed(digits)}${suffix}`;
};
const activeLoads = new Set();

function normalizedRows(rows) {
  const usable = (rows || []).map((row) => {
    const signal = row?.metrics?.tracking_signal || null;
    const angle = finite(row.depth);
    const kneeBend = signal === 'knee_bend' && angle !== null ? Math.max(0, 180 - angle) : angle;
    return Object.freeze({
      index: Math.max(1, Number(row.rep_number) || 1),
      angle,
      bend: kneeBend,
      tempo: finite(row.tempo_seconds),
      symmetry: finite(row.symmetry_delta),
      confidence: finite(row.confidence),
      range: finite(row?.metrics?.movement_range),
      signal,
      unit: row?.metrics?.measurement_unit || '°',
    });
  }).filter((rep) => rep.index > 0);
  return usable.sort((a, b) => a.index - b.index);
}

function median(values) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function representativeScore(rep, reps) {
  // Rank by closeness to this session's own medians, not by a clinical ideal.
  // This is a descriptive within-session consistency index only.
  const medianBend = median(reps.map((item) => item.bend));
  const medianTempo = median(reps.map((item) => item.tempo));
  const medianSymmetry = median(reps.map((item) => item.symmetry));
  const bendPenalty = Number.isFinite(rep.bend) && Number.isFinite(medianBend) ? Math.min(24, Math.abs(rep.bend - medianBend) * .8) : 4;
  const tempoPenalty = Number.isFinite(rep.tempo) && Number.isFinite(medianTempo) ? Math.min(20, Math.abs(rep.tempo - medianTempo) * 10) : 4;
  const symmetryPenalty = Number.isFinite(rep.symmetry) && Number.isFinite(medianSymmetry) ? Math.min(20, Math.abs(rep.symmetry - medianSymmetry) * 2) : 4;
  return Math.round(clamp(96 - bendPenalty - tempoPenalty - symmetryPenalty, 45, 98));
}

function skeleton(rep) {
  const bend = clamp(rep?.bend ?? 55, 0, 120);
  const t = bend / 120;
  const hipY = 116 + t * 16;
  const kneeY = 170 + t * 15;
  const leftKneeX = 102 - t * 18;
  const rightKneeX = 158 + t * 18;
  return `<svg class="axp-replay-skeleton" viewBox="0 0 260 270" aria-label="Illustrative reconstruction from saved derived rep measurements"><g class="bones"><line x1="130" y1="52" x2="130" y2="${hipY}"/><line x1="92" y1="78" x2="168" y2="78"/><line x1="92" y1="78" x2="62" y2="122"/><line x1="168" y1="78" x2="198" y2="122"/><line x1="130" y1="${hipY}" x2="${leftKneeX}" y2="${kneeY}"/><line x1="130" y1="${hipY}" x2="${rightKneeX}" y2="${kneeY}"/><line x1="${leftKneeX}" y1="${kneeY}" x2="104" y2="230"/><line x1="${rightKneeX}" y1="${kneeY}" x2="156" y2="230"/></g><g class="joints"><circle cx="130" cy="40" r="18"/><circle cx="92" cy="78" r="7"/><circle cx="168" cy="78" r="7"/><circle cx="130" cy="${hipY}" r="8"/><circle cx="${leftKneeX}" cy="${kneeY}" r="8"/><circle cx="${rightKneeX}" cy="${kneeY}" r="8"/><circle cx="104" cy="230" r="7"/><circle cx="156" cy="230" r="7"/></g></svg>`;
}

function pattern(reps) {
  if (reps.length < 4) return 'The saved rep sequence is available. More repetitions are needed to describe an opening, middle, and closing pattern.';
  const scores = reps.map((rep) => representativeScore(rep, reps));
  const bestIndex = scores.indexOf(Math.max(...scores));
  const late = reps.slice(Math.max(0, reps.length - Math.ceil(reps.length / 3)));
  const early = reps.slice(0, Math.ceil(reps.length / 3));
  const earlyTempo = median(early.map((rep) => rep.tempo));
  const lateTempo = median(late.map((rep) => rep.tempo));
  const tempo = Number.isFinite(earlyTempo) && Number.isFinite(lateTempo)
    ? lateTempo > earlyTempo + .2 ? ' Tempo slowed across the later repetitions.' : lateTempo < earlyTempo - .2 ? ' Tempo became quicker across the later repetitions.' : ' Tempo stayed relatively similar across the set.'
    : '';
  return `Rep ${reps[bestIndex].index} was closest to this session’s own median movement pattern.${tempo}`;
}

function workspace(reps, selectedIndex = 0) {
  const selected = reps[Math.min(selectedIndex, reps.length - 1)] || reps[0];
  const ranked = [...reps].sort((a, b) => representativeScore(b, reps) - representativeScore(a, reps));
  const best = ranked[0];
  const shift = ranked.at(-1);
  const measureLabel = selected.signal === 'knee_bend' ? 'KNEE BEND' : 'MEASURED ANGLE';
  return `<section class="axp-rep-workspace" data-axp-rep-enriched="true">
    <aside class="axp-rep-rail"><div class="axp-section-head"><div><span class="axp-kicker">SESSION TIMELINE</span><h3>Rep sequence</h3></div><span>${reps.length} reps</span></div><div class="axp-rep-list">${reps.map((rep, index) => `<button type="button" class="${index === selectedIndex ? 'selected' : ''}" data-axp-persisted-rep="${index}"><span>${String(rep.index).padStart(2,'0')}</span><div><b>Rep ${rep.index}</b><small>${fmt(rep.bend,0,rep.unit)} · ${fmt(rep.tempo,1,'s')} · Δ ${fmt(rep.symmetry,1,rep.unit)}</small></div><i style="--rep-score:${representativeScore(rep,reps)}%"></i></button>`).join('')}</div></aside>
    <article class="axp-replay-card"><div class="axp-section-head"><div><span class="axp-kicker">SKELETON REPLAY</span><h3>Rep ${selected.index}</h3></div><span class="axp-pill">SAVED REP DATA</span></div><div class="axp-replay-stage">${skeleton(selected)}<div class="axp-replay-metrics"><span><small>${measureLabel}</small><b>${fmt(selected.bend,0,selected.unit)}</b></span><span><small>TEMPO</small><b>${fmt(selected.tempo,1,'s')}</b></span><span><small>SYMMETRY Δ</small><b>${fmt(selected.symmetry,1,selected.unit)}</b></span></div><p>Illustrative reconstruction from derived rep measurements · no raw video or landmarks.</p></div><div class="axp-replay-footer"><button type="button" class="axp-play" data-axp-persisted-play aria-label="Animate illustrative replay">▶</button><span>REP ${selected.index} / ${reps.length}</span></div></article>
    <aside class="axp-insights"><article class="axp-highlight best"><span>✦ BEST REP</span><h3>#${best.index}</h3><p class="axp-rep-definition">Closest to this session’s median bend, tempo, and symmetry pattern.</p><div><span>${best.signal === 'knee_bend' ? 'Bend' : 'Angle'} <b>${fmt(best.bend,0,best.unit)}</b></span><span>Consistency <b>${representativeScore(best,reps)}</b></span><span>Tempo <b>${fmt(best.tempo,1,'s')}</b></span></div></article><article class="axp-highlight shift"><span>PERFORMANCE SHIFT</span><h3>#${shift.index}</h3><p>This rep varied most from the session’s own median pattern. That is descriptive, not a clinical-quality grade.</p><div><span>${shift.signal === 'knee_bend' ? 'Bend' : 'Angle'} <b>${fmt(shift.bend,0,shift.unit)}</b></span><span>Consistency <b>${representativeScore(shift,reps)}</b></span></div></article><article class="axp-pattern"><span class="axp-kicker">SESSION PATTERN</span><p>${pattern(reps)}</p></article></aside>
  </section>`;
}

function bind(host, reps) {
  host.querySelectorAll('[data-axp-persisted-rep]').forEach((button) => button.addEventListener('click', () => {
    host.innerHTML = workspace(reps, Number(button.dataset.axpPersistedRep) || 0);
    bind(host, reps);
  }));
  host.querySelector('[data-axp-persisted-play]')?.addEventListener('click', (event) => {
    const skeletonNode = host.querySelector('.axp-replay-skeleton');
    skeletonNode?.classList.remove('playing');
    void skeletonNode?.offsetWidth;
    skeletonNode?.classList.add('playing');
    event.currentTarget.textContent = '↻';
  });
}

async function loadLatestPersistedReps(main) {
  const host = main.querySelector('[data-axp-rep-host]');
  if (!host || host.querySelector('[data-axp-rep-enriched]') || !host.querySelector('.axp-rep-empty')) return;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId || activeLoads.has(userId)) return;
  activeLoads.add(userId);
  try {
    const { data: sessions, error: sessionError } = await supabase.from('exercise_sessions')
      .select('id,patient_id,completed_at,created_at')
      .eq('patient_id', userId)
      .order('completed_at', { ascending: false })
      .limit(1);
    if (sessionError || !sessions?.[0]?.id) return;
    const session = sessions[0];
    const { data: rows, error: repError } = await supabase.from('rep_metrics')
      .select('rep_number,depth,tempo_seconds,symmetry_delta,confidence,metrics')
      .eq('session_id', session.id)
      .order('rep_number', { ascending: true });
    if (repError || !rows?.length || !document.documentElement.contains(main)) return;
    const reps = normalizedRows(rows);
    if (!reps.length) return;
    host.innerHTML = workspace(reps, 0);
    bind(host, reps);
  } catch (error) {
    console.warn('Persisted Progress rep detail unavailable', error);
  } finally {
    activeLoads.delete(userId);
  }
}

export function syncPatientProgressRepEnrichment() {
  const main = document.querySelector('main.axp-progress-page[data-axion-progress-enhanced="true"]');
  if (!main) return;
  void loadLatestPersistedReps(main);
}
