// UL-RED marker-less AMC adapter for Axion external kinematic validation.
//
// UL-RED's processed marker-less data is published in ASF/AMC form and the
// data descriptor states that AMC frames contain collections of 3D joint
// positions. This parser intentionally consumes only explicit 3-value joint
// rows for the joints Axion needs. It rejects/ignores rotation-style rows
// rather than guessing that orientation channels are positions.

export const UL_RED_NUITRACK_JOINTS = Object.freeze([
  "Head",
  "Neck",
  "Torso",
  "Waist",
  "LeftCollar",
  "LeftShoulder",
  "RightShoulder",
  "LeftElbow",
  "RightElbow",
  "LeftWrist",
  "RightWrist",
  "LeftHand",
  "RightHand",
  "LeftHip",
  "RightHip",
  "LeftKnee",
  "RightKnee",
  "LeftAnkle",
  "RightAnkle",
]);

export const UL_RED_MOVEMENTS = Object.freeze({
  MiniSquat: Object.freeze({
    axionExerciseKey: "half_squat",
    benchmarkScope: "bilateral_lower_body",
  }),
  SitToStand: Object.freeze({
    axionExerciseKey: "sit_to_stand",
    benchmarkScope: "bilateral_lower_body",
  }),
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedJointName(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

const REQUIRED_ALIASES = Object.freeze({
  leftShoulder: ["LeftShoulder", "left_shoulder", "LShoulder"],
  rightShoulder: ["RightShoulder", "right_shoulder", "RShoulder"],
  leftElbow: ["LeftElbow", "left_elbow", "LElbow"],
  rightElbow: ["RightElbow", "right_elbow", "RElbow"],
  leftWrist: ["LeftWrist", "left_wrist", "LWrist"],
  rightWrist: ["RightWrist", "right_wrist", "RWrist"],
  leftHip: ["LeftHip", "left_hip", "LHip"],
  rightHip: ["RightHip", "right_hip", "RHip"],
  leftKnee: ["LeftKnee", "left_knee", "LKnee"],
  rightKnee: ["RightKnee", "right_knee", "RKnee"],
  leftAnkle: ["LeftAnkle", "left_ankle", "LAnkle"],
  rightAnkle: ["RightAnkle", "right_ankle", "RAnkle"],
});

function aliasLookup(frame, aliases) {
  const normalized = new Map(Object.entries(frame || {}).map(([key, value]) => [
    normalizedJointName(key),
    value,
  ]));
  for (const alias of aliases) {
    const value = normalized.get(normalizedJointName(alias));
    if (value) return value;
  }
  return null;
}

function validPosition(values) {
  if (!Array.isArray(values) || values.length !== 3) return null;
  const parsed = values.map(finite);
  if (parsed.some((value) => value === null)) return null;
  if (parsed.every((value) => Math.abs(value) < 1e-12)) return null;
  return parsed;
}

export function parseUlRedAmc(text) {
  const frames = [];
  let current = null;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(":")) continue;

    if (/^\d+$/.test(line)) {
      if (current) frames.push(current);
      current = { frameNumber: Number(line), joints: {} };
      continue;
    }

    if (!current) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const jointName = tokens[0];
    const values = tokens.slice(1).map(finite);
    if (values.some((value) => value === null)) {
      throw new Error(`UL_RED_NON_NUMERIC_JOINT frame=${current.frameNumber} joint=${jointName}`);
    }
    current.joints[jointName] = values;
  }
  if (current) frames.push(current);
  if (!frames.length) throw new Error("UL_RED_EMPTY_AMC");
  return frames;
}

export function ulRedMarkerlessFrameToAxionLandmarks(frame, {
  visibility = 1,
  invertVerticalAxis = true,
} = {}) {
  const joints = frame?.joints || frame || {};
  const resolved = {};
  for (const [key, aliases] of Object.entries(REQUIRED_ALIASES)) {
    resolved[key] = validPosition(aliasLookup(joints, aliases));
  }

  const landmarks = Array(33).fill(null);
  const assign = (mediaPipeIndex, source) => {
    if (!source) return;
    landmarks[mediaPipeIndex] = {
      x: source[0],
      y: invertVerticalAxis ? -source[1] : source[1],
      z: source[2],
      visibility,
    };
  };

  assign(11, resolved.leftShoulder);
  assign(12, resolved.rightShoulder);
  assign(13, resolved.leftElbow);
  assign(14, resolved.rightElbow);
  assign(15, resolved.leftWrist);
  assign(16, resolved.rightWrist);
  assign(23, resolved.leftHip);
  assign(24, resolved.rightHip);
  assign(25, resolved.leftKnee);
  assign(26, resolved.rightKnee);
  assign(27, resolved.leftAnkle);
  assign(28, resolved.rightAnkle);

  return landmarks;
}

export function ulRedRequiredJointCoverage(frame) {
  const joints = frame?.joints || frame || {};
  const result = {};
  let present = 0;
  for (const [key, aliases] of Object.entries(REQUIRED_ALIASES)) {
    const valid = Boolean(validPosition(aliasLookup(joints, aliases)));
    result[key] = valid;
    if (valid) present += 1;
  }
  return {
    present,
    required: Object.keys(REQUIRED_ALIASES).length,
    fraction: present / Object.keys(REQUIRED_ALIASES).length,
    joints: result,
  };
}

export function parseUlRedMotionFilename(filename = "") {
  const match = String(filename).match(/^(.+?)R(\d+)S(\d+)\.amc$/i);
  if (!match) return null;
  const motionName = Object.keys(UL_RED_MOVEMENTS)
    .find((name) => normalizedJointName(name) === normalizedJointName(match[1]))
    || match[1];
  return {
    motionName,
    repetitions: Number(match[2]),
    subjectKey: `S${String(match[3]).padStart(2, "0")}`,
    movement: UL_RED_MOVEMENTS[motionName] || null,
  };
}

export const UL_RED_ADAPTER_METADATA = Object.freeze({
  version: 1,
  dataset: "UL-RED",
  datasetDoi: "10.17638/datacat.liverpool.ac.uk/2729",
  license: "CC BY 4.0",
  markerlessSystem: "Nuitrack + Orbbec Persee",
  markerlessSampleRateHz: 30,
  expectedTrackedJointSubset: UL_RED_NUITRACK_JOINTS,
  sourceUnits: "millimetres",
  mappingScope: "explicit named 3D joint positions to Axion landmark subset",
  clinicalValidation: false,
  injuryPredictionValidation: false,
});
