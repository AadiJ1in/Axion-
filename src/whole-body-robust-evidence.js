// AxionWBF robust descriptive evidence utilities v1.
// Deterministic resampling is used for reproducible research summaries. These
// statistics describe stability/uncertainty only; they do not establish clinical
// significance, diagnosis, causation, injury risk, or treatment effect.

export const WHOLE_BODY_ROBUST_EVIDENCE_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 5) => {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

function median(values) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function quantile(values, probability) {
  const usable = values.map(finite).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const position = (usable.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return usable[lower];
  const fraction = position - lower;
  return usable[lower] + (usable[upper] - usable[lower]) * fraction;
}

function lcg(seed = 0x6d2b79f5) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sampleWithReplacement(values, random) {
  const output = [];
  for (let i = 0; i < values.length; i += 1) {
    output.push(values[Math.floor(random() * values.length)]);
  }
  return output;
}

export function cliffsDelta(left = [], right = []) {
  const a = left.map(finite).filter(Number.isFinite);
  const b = right.map(finite).filter(Number.isFinite);
  if (!a.length || !b.length) return null;
  let greater = 0;
  let lower = 0;
  for (const x of a) {
    for (const y of b) {
      if (x > y) greater += 1;
      else if (x < y) lower += 1;
    }
  }
  return round((greater - lower) / (a.length * b.length));
}

export function bootstrapMedianDifference(baseline = [], recent = [], {
  iterations = 1000,
  seed = 20260926,
  confidence = 0.95,
} = {}) {
  const early = baseline.map(finite).filter(Number.isFinite);
  const late = recent.map(finite).filter(Number.isFinite);
  if (early.length < 2 || late.length < 2) return null;
  if (!Number.isInteger(iterations) || iterations < 200) return null;
  if (!(confidence > 0.5 && confidence < 1)) return null;

  const random = lcg(seed);
  const differences = [];
  let positive = 0;
  let negative = 0;
  for (let index = 0; index < iterations; index += 1) {
    const earlySample = sampleWithReplacement(early, random);
    const lateSample = sampleWithReplacement(late, random);
    const difference = median(lateSample) - median(earlySample);
    differences.push(difference);
    if (difference > 0) positive += 1;
    else if (difference < 0) negative += 1;
  }

  const alpha = (1 - confidence) / 2;
  const lower = quantile(differences, alpha);
  const upper = quantile(differences, 1 - alpha);
  const observed = median(late) - median(early);
  return {
    iterations,
    confidence,
    observedMedianDifference: round(observed),
    lower: round(lower),
    upper: round(upper),
    excludesZero: Number.isFinite(lower) && Number.isFinite(upper) && (lower > 0 || upper < 0),
    positiveProbability: round(positive / iterations),
    negativeProbability: round(negative / iterations),
    directionalStability: round(Math.max(positive, negative) / iterations),
  };
}

export function robustTwoWindowEvidence(baseline = [], recent = [], options = {}) {
  const early = baseline.map(finite).filter(Number.isFinite);
  const late = recent.map(finite).filter(Number.isFinite);
  if (early.length < 2 || late.length < 2) return null;

  const bootstrap = bootstrapMedianDifference(early, late, options);
  const delta = cliffsDelta(late, early); // positive means recent values tend to exceed baseline.
  const observedDifference = median(late) - median(early);
  const sameDirectionFraction = observedDifference === 0
    ? 0
    : late.filter((value) => Math.sign(value - median(early)) === Math.sign(observedDifference)).length / late.length;

  let tier = "exploratory";
  if (early.length >= 4 && late.length >= 4 && bootstrap?.excludesZero && bootstrap.directionalStability >= 0.95 && Math.abs(delta || 0) >= 0.47 && sameDirectionFraction >= 0.75) {
    tier = "stable";
  } else if (bootstrap?.directionalStability >= 0.85 && Math.abs(delta || 0) >= 0.33 && sameDirectionFraction >= 2 / 3) {
    tier = "supported";
  }

  return {
    schemaVersion: WHOLE_BODY_ROBUST_EVIDENCE_SCHEMA_VERSION,
    baselineN: early.length,
    recentN: late.length,
    baselineMedian: round(median(early)),
    recentMedian: round(median(late)),
    medianDifference: round(observedDifference),
    cliffsDeltaRecentVsBaseline: delta,
    sameDirectionFraction: round(sameDirectionFraction),
    bootstrap,
    evidenceTier: tier,
  };
}
