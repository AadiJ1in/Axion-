const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function bounded(value, min, max) {
  const number = finite(value);
  if (number === null || number < min || number > max) return null;
  return number;
}

export function normalizeReviewTarget(input = {}, fallbackUnit = null) {
  const unit = input.range_unit || fallbackUnit;
  const rangeUnit = unit === "percent" || unit === "%" ? "percent" : unit === "deg" || unit === "°" ? "deg" : null;
  const maxRange = rangeUnit === "percent" ? 100 : 180;
  let rangeMin = bounded(input.target_range_min, 0, maxRange);
  let rangeMax = bounded(input.target_range_max, 0, maxRange);
  if (rangeMin !== null && rangeMax !== null && rangeMin > rangeMax) [rangeMin, rangeMax] = [rangeMax, rangeMin];
  let tempoMin = bounded(input.target_tempo_min_seconds, 0.2, 120);
  let tempoMax = bounded(input.target_tempo_max_seconds, 0.2, 120);
  if (tempoMin !== null && tempoMax !== null && tempoMin > tempoMax) [tempoMin, tempoMax] = [tempoMax, tempoMin];
  return {
    range_unit: rangeUnit,
    target_range_min: rangeMin,
    target_range_max: rangeMax,
    target_tempo_min_seconds: tempoMin,
    target_tempo_max_seconds: tempoMax,
    target_difficulty_max: bounded(input.target_difficulty_max, 1, 5),
    pain_review_threshold: bounded(input.pain_review_threshold, 0, 10),
    notes: String(input.notes || "").trim().replace(/\s+/g, " ").slice(0, 1000) || null,
  };
}

function rangeStatus(value, min, max) {
  const observed = finite(value);
  if (observed === null || (min === null && max === null)) return null;
  const below = min !== null && observed < min;
  const above = max !== null && observed > max;
  return { observed, within: !below && !above, below, above };
}

export function evaluateReviewTarget(target = {}, observation = {}) {
  const normalized = normalizeReviewTarget(target, observation.rangeUnit);
  const range = rangeStatus(observation.movementRange, normalized.target_range_min, normalized.target_range_max);
  const tempo = rangeStatus(observation.tempoSeconds, normalized.target_tempo_min_seconds, normalized.target_tempo_max_seconds);
  const difficulty = normalized.target_difficulty_max === null || finite(observation.difficulty) === null ? null : {
    observed: finite(observation.difficulty),
    within: finite(observation.difficulty) <= normalized.target_difficulty_max,
    above: finite(observation.difficulty) > normalized.target_difficulty_max,
  };
  const pain = normalized.pain_review_threshold === null || finite(observation.painAfter) === null ? null : {
    observed: finite(observation.painAfter),
    within: finite(observation.painAfter) < normalized.pain_review_threshold,
    atOrAbove: finite(observation.painAfter) >= normalized.pain_review_threshold,
  };
  const checks = [range, tempo, difficulty, pain].filter(Boolean);
  return {
    target: normalized,
    range,
    tempo,
    difficulty,
    pain,
    reviewSuggested: checks.some((check) => !check.within),
    observedChecks: checks.length,
  };
}

export function targetSummary(target = {}) {
  const normalized = normalizeReviewTarget(target);
  const unit = normalized.range_unit === "percent" ? "%" : "°";
  const parts = [];
  if (normalized.target_range_min !== null || normalized.target_range_max !== null) {
    if (normalized.target_range_min !== null && normalized.target_range_max !== null) parts.push(`range ${normalized.target_range_min}–${normalized.target_range_max}${unit}`);
    else if (normalized.target_range_min !== null) parts.push(`range ≥${normalized.target_range_min}${unit}`);
    else parts.push(`range ≤${normalized.target_range_max}${unit}`);
  }
  if (normalized.target_tempo_min_seconds !== null || normalized.target_tempo_max_seconds !== null) {
    if (normalized.target_tempo_min_seconds !== null && normalized.target_tempo_max_seconds !== null) parts.push(`tempo ${normalized.target_tempo_min_seconds}–${normalized.target_tempo_max_seconds}s`);
    else if (normalized.target_tempo_min_seconds !== null) parts.push(`tempo ≥${normalized.target_tempo_min_seconds}s`);
    else parts.push(`tempo ≤${normalized.target_tempo_max_seconds}s`);
  }
  if (normalized.target_difficulty_max !== null) parts.push(`difficulty ≤${normalized.target_difficulty_max}/5`);
  if (normalized.pain_review_threshold !== null) parts.push(`review pain ≥${normalized.pain_review_threshold}/10`);
  return parts;
}
