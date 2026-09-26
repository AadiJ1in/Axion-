import {
  createWholeBodyRepAccumulator,
  WHOLE_BODY_FEATURES_V1,
  WHOLE_BODY_REGIONS,
} from "./whole-body-biomechanics.js";

// AxionWBF within-repetition descriptive motion statistics.
// Derived feature trajectories exist only in memory for the active repetition and are
// discarded after finish(). No raw image/video/landmark coordinates are retained.

export const WHOLE_BODY_MOTION_STATISTICS_SCHEMA_VERSION = 1;

const finite = (value) => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const round = (value, digits = 4) => {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

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

function mean(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function median(values) {
  return quantile(values, 0.5);
}

function sd(values) {
  const usable = values.map(finite).filter(Number.isFinite);
  if (usable.length < 2) return null;
  const center = mean(usable);
  return Math.sqrt(usable.reduce((sum, value) => sum + (value - center) ** 2, 0) / (usable.length - 1));
}

function mad(values) {
  const center = median(values);
  if (!Number.isFinite(center)) return null;
  return median(values.map((value) => Number.isFinite(finite(value)) ? Math.abs(Number(value) - center) : null));
}

function linearSlopePerSecond(samples) {
  const usable = samples.filter((sample) => Number.isFinite(sample.value) && Number.isFinite(sample.timestampMs));
  if (usable.length < 2) return null;
  const start = usable[0].timestampMs;
  const x = usable.map((sample) => (sample.timestampMs - start) / 1000);
  const y = usable.map((sample) => sample.value);
  const meanX = mean(x);
  const meanY = mean(y);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < usable.length; index += 1) {
    numerator += (x[index] - meanX) * (y[index] - meanY);
    denominator += (x[index] - meanX) ** 2;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function summarizeTrajectory(samples) {
  const usable = samples.filter((sample) => Number.isFinite(sample.value));
  if (!usable.length) return null;
  const values = usable.map((sample) => sample.value);
  const first = values[0];
  const last = values.at(-1);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const delta = last - first;
  const steps = [];
  const velocities = [];
  let pathLength = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const step = Math.abs(usable[index].value - usable[index - 1].value);
    pathLength += step;
    steps.push(step);
    const dtSeconds = Number.isFinite(usable[index].timestampMs) && Number.isFinite(usable[index - 1].timestampMs)
      ? (usable[index].timestampMs - usable[index - 1].timestampMs) / 1000
      : null;
    if (Number.isFinite(dtSeconds) && dtSeconds > 0) velocities.push(step / dtSeconds);
  }
  const durationSeconds = Number.isFinite(usable[0].timestampMs) && Number.isFinite(usable.at(-1).timestampMs)
    ? Math.max(0, (usable.at(-1).timestampMs - usable[0].timestampMs) / 1000)
    : null;
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const standardDeviation = sd(values);
  const average = mean(values);
  const netDisplacement = Math.abs(delta);
  const pathToRangeRatio = range > 1e-9 ? pathLength / range : (pathLength <= 1e-9 ? 0 : null);
  const directionalEfficiency = pathLength > 1e-9 ? netDisplacement / pathLength : 1;

  return {
    samples: usable.length,
    mean: round(average),
    median: round(median(values)),
    min: round(minimum),
    max: round(maximum),
    range: round(range),
    sd: round(standardDeviation),
    q1: round(q1),
    q3: round(q3),
    iqr: Number.isFinite(q1) && Number.isFinite(q3) ? round(q3 - q1) : null,
    mad: round(mad(values)),
    cv: Number.isFinite(standardDeviation) && Number.isFinite(average) && Math.abs(average) > 1e-9
      ? round(standardDeviation / Math.abs(average))
      : null,
    start: round(first),
    end: round(last),
    delta: round(delta),
    netDisplacement: round(netDisplacement),
    pathLength: round(pathLength),
    pathToRangeRatio: round(pathToRangeRatio),
    directionalEfficiency: round(directionalEfficiency),
    meanAbsoluteStep: round(mean(steps)),
    medianAbsoluteStep: round(median(steps)),
    peakAbsoluteStep: steps.length ? round(Math.max(...steps)) : null,
    medianAbsoluteVelocityPerSecond: round(median(velocities)),
    p95AbsoluteVelocityPerSecond: round(quantile(velocities, 0.95)),
    pathRatePerSecond: Number.isFinite(durationSeconds) && durationSeconds > 0 ? round(pathLength / durationSeconds) : null,
    linearSlopePerSecond: round(linearSlopePerSecond(usable)),
    durationSeconds: round(durationSeconds),
  };
}

export function createWholeBodyMotionAccumulator() {
  const base = createWholeBodyRepAccumulator();
  const trajectories = new Map();

  const resetTrajectories = () => trajectories.clear();

  return {
    start(timestampMs = null) {
      resetTrajectories();
      base.start(timestampMs);
    },
    push(frame) {
      if (!frame) return;
      base.push(frame);
      const timestampMs = finite(frame.timestampMs);
      for (const feature of WHOLE_BODY_FEATURES_V1) {
        const value = finite(frame.features?.[feature]);
        if (value === null) continue;
        if (!trajectories.has(feature)) trajectories.set(feature, []);
        trajectories.get(feature).push({ value, timestampMs });
      }
    },
    finish(timestampMs = null) {
      const summary = base.finish(timestampMs);
      const enhancedFeatures = { ...summary.features };
      trajectories.forEach((samples, feature) => {
        const advanced = summarizeTrajectory(samples);
        if (!advanced) return;
        enhancedFeatures[feature] = {
          ...(enhancedFeatures[feature] || {}),
          ...advanced,
        };
      });
      const result = {
        ...summary,
        motionStatisticsSchemaVersion: WHOLE_BODY_MOTION_STATISTICS_SCHEMA_VERSION,
        features: enhancedFeatures,
      };
      resetTrajectories();
      return result;
    },
    reset() {
      resetTrajectories();
      base.reset();
    },
  };
}

function featureMetricStats(reps, feature, metric) {
  const values = reps
    .map((rep) => finite(rep?.wholeBody?.features?.[feature]?.[metric]))
    .filter(Number.isFinite);
  if (!values.length) return null;
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  return {
    reps: values.length,
    mean: round(mean(values)),
    median: round(median(values)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    sd: round(sd(values)),
    iqr: Number.isFinite(q1) && Number.isFinite(q3) ? round(q3 - q1) : null,
    mad: round(mad(values)),
  };
}

export function summarizeWholeBodyMotionStatistics(reps = []) {
  const usable = reps.filter((rep) => rep?.wholeBody?.features);
  if (!usable.length) return null;
  const features = {};
  const metrics = [
    "range",
    "sd",
    "iqr",
    "mad",
    "pathLength",
    "pathToRangeRatio",
    "directionalEfficiency",
    "pathRatePerSecond",
    "linearSlopePerSecond",
  ];
  for (const feature of WHOLE_BODY_FEATURES_V1) {
    const block = {};
    for (const metric of metrics) {
      const stats = featureMetricStats(usable, feature, metric);
      if (stats) block[metric] = stats;
    }
    if (Object.keys(block).length) features[feature] = block;
  }

  const regionCoverage = Object.fromEntries(WHOLE_BODY_REGIONS.map((region) => {
    const values = usable.map((rep) => finite(rep?.wholeBody?.regionCoverage?.[region])).filter(Number.isFinite);
    return [region, values.length ? round(mean(values)) : null];
  }));

  return {
    schemaVersion: WHOLE_BODY_MOTION_STATISTICS_SCHEMA_VERSION,
    clinicalStatus: "descriptive_unvalidated",
    reps: usable.length,
    regionCoverage,
    features,
    interpretation: "Path-based statistics describe how much derived pose features changed within repetitions. They can reflect intended movement, stabilization, strategy, fatigue, camera variation, or tracking noise and require contextual interpretation.",
  };
}
