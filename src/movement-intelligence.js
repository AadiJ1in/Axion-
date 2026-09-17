const LANDMARK = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
});

export const MOVEMENT_INTELLIGENCE_VERSION = "axion-adaptive-movement-v0.1";
export const MOVEMENT_INTELLIGENCE_EXERCISES = new Set(["bodyweight_squat"]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const finite = (values) => values.filter(Number.isFinite);

function median(values) {
  const sorted = finite(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function std(values, mean = average(values)) {
  if (!values.length || !Number.isFinite(mean)) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function point(points, index) {
  return points?.[index] || null;
}

function visible(points, indices, minimum = 0.55) {
  return indices.every((index) => {
    const value = point(points, index);
    return value
      && Number.isFinite(value.x)
      && Number.isFinite(value.y)
      && (value.visibility ?? 1) >= minimum;
  });
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleAtVertex(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const denominator = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
  if (!denominator) return null;
  const cosine = clamp((ba.x * bc.x + ba.y * bc.y) / denominator, -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

function trunkFlexion(points) {
  const leftShoulder = point(points, LANDMARK.LEFT_SHOULDER);
  const rightShoulder = point(points, LANDMARK.RIGHT_SHOULDER);
  const leftHip = point(points, LANDMARK.LEFT_HIP);
  const rightHip = point(points, LANDMARK.RIGHT_HIP);
  const neck = midpoint(leftShoulder, rightShoulder);
  const hips = midpoint(leftHip, rightHip);
  const vx = neck.x - hips.x;
  const vy = neck.y - hips.y;
  const magnitude = Math.hypot(vx, vy);
  if (!magnitude) return null;
  return Math.acos(clamp((-vy) / magnitude, -1, 1)) * 180 / Math.PI;
}

function frameVisibility(points) {
  const indices = [
    LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER,
    LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP,
    LANDMARK.LEFT_KNEE, LANDMARK.RIGHT_KNEE,
    LANDMARK.LEFT_ANKLE, LANDMARK.RIGHT_ANKLE,
    LANDMARK.LEFT_FOOT_INDEX, LANDMARK.RIGHT_FOOT_INDEX,
  ];
  const values = indices.map((index) => point(points, index)?.visibility ?? 0).filter(Number.isFinite);
  return average(values) ?? 0;
}

export function squatFrameFeatures(points) {
  const required = Object.values(LANDMARK);
  if (!visible(points, required)) return null;
  const lShoulder = point(points, LANDMARK.LEFT_SHOULDER);
  const rShoulder = point(points, LANDMARK.RIGHT_SHOULDER);
  const lHip = point(points, LANDMARK.LEFT_HIP);
  const rHip = point(points, LANDMARK.RIGHT_HIP);
  const lKnee = point(points, LANDMARK.LEFT_KNEE);
  const rKnee = point(points, LANDMARK.RIGHT_KNEE);
  const lAnkle = point(points, LANDMARK.LEFT_ANKLE);
  const rAnkle = point(points, LANDMARK.RIGHT_ANKLE);
  const lFoot = point(points, LANDMARK.LEFT_FOOT_INDEX);
  const rFoot = point(points, LANDMARK.RIGHT_FOOT_INDEX);

  return {
    l_knee: angleAtVertex(lHip, lKnee, lAnkle),
    r_knee: angleAtVertex(rHip, rKnee, rAnkle),
    l_hip: angleAtVertex(lShoulder, lHip, lKnee),
    r_hip: angleAtVertex(rShoulder, rHip, rKnee),
    l_ankle: angleAtVertex(lKnee, lAnkle, lFoot),
    r_ankle: angleAtVertex(rKnee, rAnkle, rFoot),
    trunk_flex: trunkFlexion(points),
    knee_distance: Math.abs(lKnee.x - rKnee.x),
    hip_distance: Math.abs(lHip.x - rHip.x),
    visibility: frameVisibility(points),
  };
}

function summarizeSeries(values) {
  const clean = finite(values);
  if (!clean.length) return null;
  const mean = average(clean);
  const velocities = clean.slice(1).map((value, index) => Math.abs(value - clean[index]));
  const minimum = Math.min(...clean);
  const maximum = Math.max(...clean);
  return {
    min: minimum,
    max: maximum,
    rom: maximum - minimum,
    mean,
    std: std(clean, mean) ?? 0,
    vel_mean_abs: average(velocities) ?? 0,
    vel_max_abs: velocities.length ? Math.max(...velocities) : 0,
  };
}

function appendSeriesFeatures(target, name, stats) {
  if (!stats) return;
  for (const key of ["min", "max", "rom", "mean", "std", "vel_mean_abs", "vel_max_abs"]) {
    target[`${name}_${key}`] = stats[key];
  }
}

export function summarizeSquatFrames(frames) {
  const clean = frames.filter(Boolean);
  if (clean.length < 8) return null;
  const features = {};
  const statsByName = {};
  for (const name of ["l_knee", "r_knee", "l_hip", "r_hip", "l_ankle", "r_ankle", "trunk_flex"]) {
    const stats = summarizeSeries(clean.map((frame) => frame[name]));
    if (!stats) return null;
    statsByName[name] = stats;
    appendSeriesFeatures(features, name, stats);
  }

  features.sym_knee = Math.abs(statsByName.l_knee.rom - statsByName.r_knee.rom);
  features.sym_hip = Math.abs(statsByName.l_hip.rom - statsByName.r_hip.rom);

  const hipDistances = clean.map((frame) => frame.hip_distance).filter(Number.isFinite);
  const floor = Math.max(1e-5, 0.25 * (median(hipDistances) ?? 0));
  const valgus = clean
    .map((frame) => frame.knee_distance / Math.max(frame.hip_distance, floor))
    .filter(Number.isFinite);
  if (!valgus.length) return null;
  features.knee_valgus_min = Math.min(...valgus);
  features.knee_valgus_mean = average(valgus);

  return {
    features,
    frameCount: clean.length,
    meanVisibility: average(clean.map((frame) => frame.visibility)) ?? 0,
  };
}

const SIGNATURE_FEATURES = Object.freeze([
  { key: "l_knee_rom", label: "Left knee excursion", floor: 5 },
  { key: "r_knee_rom", label: "Right knee excursion", floor: 5 },
  { key: "l_hip_rom", label: "Left hip excursion", floor: 5 },
  { key: "r_hip_rom", label: "Right hip excursion", floor: 5 },
  { key: "l_ankle_rom", label: "Left ankle excursion", floor: 4 },
  { key: "r_ankle_rom", label: "Right ankle excursion", floor: 4 },
  { key: "trunk_flex_mean", label: "Average trunk position", floor: 4 },
  { key: "trunk_flex_max", label: "Peak trunk position", floor: 4 },
  { key: "sym_knee", label: "Knee excursion symmetry", floor: 4 },
  { key: "sym_hip", label: "Hip excursion symmetry", floor: 4 },
  { key: "knee_valgus_min", label: "Frontal knee spacing pattern", floor: 0.08 },
]);

function baselineModel(reps) {
  const model = {};
  for (const descriptor of SIGNATURE_FEATURES) {
    const values = reps.map((rep) => rep.features[descriptor.key]).filter(Number.isFinite);
    const center = average(values);
    model[descriptor.key] = {
      center,
      scale: Math.max(descriptor.floor, std(values, center) ?? 0),
      label: descriptor.label,
    };
  }
  return model;
}

function compareToBaseline(summary, baseline) {
  const comparisons = SIGNATURE_FEATURES.map(({ key, label }) => {
    const current = summary.features[key];
    const reference = baseline[key];
    const z = reference && Number.isFinite(current)
      ? (current - reference.center) / reference.scale
      : 0;
    return { key, label, z, magnitude: Math.abs(z), value: current, baseline: reference?.center ?? null };
  });
  const drift = Math.sqrt(average(comparisons.map((item) => clamp(item.z, -4, 4) ** 2)) ?? 0);
  const score = Math.round(100 * Math.exp(-0.38 * drift));
  const band = drift < 0.85 ? "stable" : drift < 1.45 ? "changed" : "notable_change";
  return {
    driftIndex: Number(drift.toFixed(2)),
    stabilityScore: clamp(score, 0, 100),
    band,
    factors: comparisons.sort((a, b) => b.magnitude - a.magnitude).slice(0, 3).map((item) => ({
      key: item.key,
      label: item.label,
      standardizedChange: Number(item.z.toFixed(2)),
    })),
  };
}

export function supportsAdaptiveMovementIntelligence(exerciseKey) {
  return MOVEMENT_INTELLIGENCE_EXERCISES.has(String(exerciseKey || ""));
}

export function createAdaptiveMovementIntelligence({ baselineReps = 3, minFrames = 8, maxFrames = 180 } = {}) {
  let collecting = false;
  let frames = [];
  let baseline = [];
  const results = [];

  const resetRep = () => {
    collecting = false;
    frames = [];
  };

  return {
    startRep() {
      collecting = true;
      frames = [];
    },
    observe(points) {
      if (!collecting || frames.length >= maxFrames) return;
      const features = squatFrameFeatures(points);
      if (features) frames.push(features);
    },
    discardRep() {
      resetRep();
    },
    finishRep() {
      const summary = summarizeSquatFrames(frames);
      resetRep();
      if (!summary || summary.frameCount < minFrames) {
        const result = {
          status: "insufficient_data",
          modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
          experimental: true,
          message: "AI movement analysis needs a clearer full-body repetition.",
        };
        results.push(result);
        return result;
      }

      const confidence = Math.round(100 * clamp(
        0.65 * summary.meanVisibility + 0.35 * Math.min(1, summary.frameCount / 24),
        0,
        1,
      ));

      if (baseline.length < baselineReps) {
        baseline.push(summary);
        const ready = baseline.length >= baselineReps;
        const result = {
          status: ready ? "baseline_ready" : "baseline_learning",
          modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
          experimental: true,
          confidence,
          baselineProgress: baseline.length,
          baselineTarget: baselineReps,
          message: ready
            ? "AI movement baseline learned for this session."
            : `AI movement baseline learning (${baseline.length}/${baselineReps}).`,
        };
        results.push(result);
        return result;
      }

      const comparison = compareToBaseline(summary, baselineModel(baseline));
      const result = {
        status: "analyzed",
        modelVersion: MOVEMENT_INTELLIGENCE_VERSION,
        experimental: true,
        confidence,
        ...comparison,
        message: comparison.band === "stable"
          ? "AI movement signature is consistent with this session baseline."
          : comparison.band === "changed"
            ? "AI detected a movement-pattern shift from this session baseline."
            : "AI detected a larger movement-pattern shift for therapist review.",
      };
      results.push(result);
      return result;
    },
    sessionSummary() {
      const analyzed = results.filter((result) => result.status === "analyzed");
      return {
        enabled: true,
        version: MOVEMENT_INTELLIGENCE_VERSION,
        mode: "patient_specific_adaptive_baseline",
        experimental: true,
        diagnostic: false,
        processing: "on_device",
        analyzed_repetitions: analyzed.length,
        baseline_repetitions: baseline.length,
        average_stability_score: analyzed.length
          ? Math.round(average(analyzed.map((result) => result.stabilityScore)))
          : null,
        latest_pattern_band: analyzed.at(-1)?.band ?? null,
      };
    },
    reset() {
      collecting = false;
      frames = [];
      baseline = [];
      results.length = 0;
    },
  };
}
