import assert from "node:assert/strict";
import {
  MOVEMENT_INTELLIGENCE_VERSION,
  createAdaptiveMovementIntelligence,
  squatFrameFeatures,
  summarizeSquatFrames,
  supportsAdaptiveMovementIntelligence,
} from "../src/movement-intelligence.js";

function pose(depth = 0, shift = 0) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  points[11] = { x: 0.42 + shift, y: 0.25 + depth * 0.10, visibility: 0.98 };
  points[12] = { x: 0.58 + shift, y: 0.25 + depth * 0.10, visibility: 0.98 };
  points[23] = { x: 0.44, y: 0.48 + depth * 0.08, visibility: 0.98 };
  points[24] = { x: 0.56, y: 0.48 + depth * 0.08, visibility: 0.98 };
  points[25] = { x: 0.44 - depth * 0.075, y: 0.68 + depth * 0.04, visibility: 0.98 };
  points[26] = { x: 0.56 + depth * 0.075, y: 0.68 + depth * 0.04, visibility: 0.98 };
  points[27] = { x: 0.43, y: 0.88, visibility: 0.98 };
  points[28] = { x: 0.57, y: 0.88, visibility: 0.98 };
  points[31] = { x: 0.41, y: 0.94, visibility: 0.98 };
  points[32] = { x: 0.59, y: 0.94, visibility: 0.98 };
  return points;
}

function repFrames(shift = 0, amplitude = 1) {
  const frames = [];
  for (let i = 0; i <= 12; i++) frames.push(pose((i / 12) * amplitude, shift));
  for (let i = 11; i >= 0; i--) frames.push(pose((i / 12) * amplitude, shift));
  return frames;
}

assert.equal(supportsAdaptiveMovementIntelligence("bodyweight_squat"), true);
assert.equal(supportsAdaptiveMovementIntelligence("heel_raise"), false);

const one = squatFrameFeatures(pose(0.5));
assert.ok(Number.isFinite(one.l_knee));
assert.ok(Number.isFinite(one.r_hip));
assert.ok(Number.isFinite(one.trunk_flex));

const summary = summarizeSquatFrames(repFrames());
assert.ok(summary.frameCount >= 20);
assert.ok(summary.features.l_knee_rom > 0);
assert.ok(summary.features.r_hip_rom > 0);
assert.ok(Number.isFinite(summary.features.knee_valgus_min));

const engine = createAdaptiveMovementIntelligence({ baselineReps: 3 });
function analyze(frames) {
  engine.startRep();
  frames.forEach((frame) => engine.observe(frame));
  return engine.finishRep();
}

const first = analyze(repFrames(0, 0.98));
const second = analyze(repFrames(0.002, 1.01));
const third = analyze(repFrames(-0.002, 1));
assert.equal(first.status, "baseline_learning");
assert.equal(second.status, "baseline_learning");
assert.equal(third.status, "baseline_ready");
assert.equal(third.modelVersion, MOVEMENT_INTELLIGENCE_VERSION);

const stable = analyze(repFrames(0.002, 1.01));
assert.equal(stable.status, "analyzed");
assert.ok(stable.confidence >= 80);
assert.ok(stable.stabilityScore >= 50);

const shifted = analyze(repFrames(0.09, 0.72));
assert.equal(shifted.status, "analyzed");
assert.ok(shifted.driftIndex > stable.driftIndex, "larger movement change should produce more baseline drift");
assert.ok(shifted.factors.length > 0);
assert.ok(!/diagnos|injury|cause/i.test(shifted.message));

const session = engine.sessionSummary();
assert.equal(session.enabled, true);
assert.equal(session.diagnostic, false);
assert.equal(session.processing, "on_device");
assert.equal(session.baseline_repetitions, 3);
assert.equal(session.analyzed_repetitions, 2);

engine.reset();
assert.equal(engine.sessionSummary().baseline_repetitions, 0);

const shortEngine = createAdaptiveMovementIntelligence();
shortEngine.startRep();
repFrames().slice(0, 4).forEach((frame) => shortEngine.observe(frame));
assert.equal(shortEngine.finishRep().status, "insufficient_data");

console.log("Adaptive movement intelligence: feature extraction, session learning, drift, confidence and reset passed.");
