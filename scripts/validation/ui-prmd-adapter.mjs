// UI-PRMD Kinect adapter for Axion's external kinematic validation.
//
// Scope: reconstruction and coordinate adaptation only. This module does not
// label clinical correctness, diagnose injury, or convert UI-PRMD into a
// clinical validation dataset.
//
// UI-PRMD Kinect segmented files contain one frame per row, 22 joints x XYZ
// (66 comma-delimited values). Except for the waist, stored positions are
// relative offsets in the Kinect skeletal hierarchy. The reconstruction below
// follows the transform order published with the dataset and mirrored by the
// public UI-PRMD visualization implementation.

export const UI_PRMD_KINECT_JOINTS = Object.freeze([
  "waist",
  "spine",
  "chest",
  "neck",
  "head",
  "head_tip",
  "left_collar",
  "left_upper_arm",
  "left_forearm",
  "left_hand",
  "right_collar",
  "right_upper_arm",
  "right_forearm",
  "right_hand",
  "left_upper_leg",
  "left_lower_leg",
  "left_foot",
  "left_leg_toes",
  "right_upper_leg",
  "right_lower_leg",
  "right_foot",
  "right_leg_toes",
]);

export const UI_PRMD_MOVEMENTS = Object.freeze({
  m01: Object.freeze({ name: "Deep squat", axionExerciseKey: "bodyweight_squat", benchmarkScope: "bilateral_lower_body" }),
  m02: Object.freeze({ name: "Hurdle step", axionExerciseKey: null, benchmarkScope: "research_only" }),
  m03: Object.freeze({ name: "Inline lunge", axionExerciseKey: "forward_lunge", benchmarkScope: "unilateral_research_only" }),
  m04: Object.freeze({ name: "Side lunge", axionExerciseKey: null, benchmarkScope: "research_only" }),
  m05: Object.freeze({ name: "Sit to stand", axionExerciseKey: "sit_to_stand", benchmarkScope: "bilateral_lower_body" }),
  m06: Object.freeze({ name: "Standing active straight leg raise", axionExerciseKey: null, benchmarkScope: "research_only" }),
  m07: Object.freeze({ name: "Standing shoulder abduction", axionExerciseKey: null, benchmarkScope: "research_only" }),
  m08: Object.freeze({ name: "Standing shoulder extension", axionExerciseKey: null, benchmarkScope: "research_only" }),
  m09: Object.freeze({ name: "Standing shoulder internal-external rotation", axionExerciseKey: null, benchmarkScope: "research_only" }),
  m10: Object.freeze({ name: "Standing shoulder scaption", axionExerciseKey: null, benchmarkScope: "research_only" }),
});

const JOINT_COUNT = 22;
const VALUES_PER_FRAME = JOINT_COUNT * 3;
const DEG_TO_RAD = Math.PI / 180;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseUiPrmdMatrix(text, { expectedColumns = VALUES_PER_FRAME } = {}) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, rowIndex) => {
      const values = line.split(",").map((token) => finite(token.trim()));
      if (values.length !== expectedColumns) {
        throw new Error(`UI_PRMD_COLUMN_COUNT row=${rowIndex + 1} expected=${expectedColumns} actual=${values.length}`);
      }
      if (values.some((value) => value === null)) {
        throw new Error(`UI_PRMD_NON_NUMERIC_VALUE row=${rowIndex + 1}`);
      }
      return values;
    });
  if (!rows.length) throw new Error("UI_PRMD_EMPTY_MATRIX");
  return rows;
}

function reshapeFrame(row) {
  if (!Array.isArray(row) || row.length !== VALUES_PER_FRAME) {
    throw new Error(`UI_PRMD_FRAME_SHAPE expected=${VALUES_PER_FRAME}`);
  }
  return Array.from({ length: JOINT_COUNT }, (_, index) => [
    Number(row[index * 3]),
    Number(row[index * 3 + 1]),
    Number(row[index * 3 + 2]),
  ]);
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function matVec(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function matMul(a, b) {
  return Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) =>
      a[row][0] * b[0][column] + a[row][1] * b[1][column] + a[row][2] * b[2][column]));
}

function rotX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}

function rotY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}

function rotZ(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

// UI-PRMD describes the angle output as a YXZ Euler triplet. For benchmark
// reproducibility, this adapter follows the public reference reconstruction's
// exact component/matrix order without re-interpreting vendor axis semantics:
// Rz(component 3) * Ry(component 2) * Rx(component 1).
function eulerUiPrmdDegrees(triplet) {
  const g = triplet[0] * DEG_TO_RAD;
  const b = triplet[1] * DEG_TO_RAD;
  const a = triplet[2] * DEG_TO_RAD;
  return matMul(matMul(rotZ(a), rotY(b)), rotX(g));
}

function applyChain({
  localPositions,
  localAngles,
  output,
  parentIndex,
  childIndices,
  initialRotation,
}) {
  let parent = parentIndex;
  let rotation = initialRotation;
  for (const child of childIndices) {
    output[child] = add(matVec(rotation, localPositions[child]), output[parent]);
    rotation = matMul(rotation, eulerUiPrmdDegrees(localAngles[child]));
    parent = child;
  }
}

export function reconstructUiPrmdKinectFrame(positionRow, angleRow) {
  const localPositions = reshapeFrame(positionRow);
  const localAngles = reshapeFrame(angleRow);
  const output = Array.from({ length: JOINT_COUNT }, () => [0, 0, 0]);
  output[0] = [...localPositions[0]];

  applyChain({
    localPositions,
    localAngles,
    output,
    parentIndex: 0,
    childIndices: [1, 2, 3, 4, 5],
    initialRotation: eulerUiPrmdDegrees(localAngles[0]),
  });

  applyChain({
    localPositions,
    localAngles,
    output,
    parentIndex: 2,
    childIndices: [6, 7, 8, 9],
    initialRotation: eulerUiPrmdDegrees(localAngles[2]),
  });
  applyChain({
    localPositions,
    localAngles,
    output,
    parentIndex: 2,
    childIndices: [10, 11, 12, 13],
    initialRotation: eulerUiPrmdDegrees(localAngles[2]),
  });
  applyChain({
    localPositions,
    localAngles,
    output,
    parentIndex: 0,
    childIndices: [14, 15, 16, 17],
    initialRotation: eulerUiPrmdDegrees(localAngles[0]),
  });
  applyChain({
    localPositions,
    localAngles,
    output,
    parentIndex: 0,
    childIndices: [18, 19, 20, 21],
    initialRotation: eulerUiPrmdDegrees(localAngles[0]),
  });

  return output;
}

export function reconstructUiPrmdKinectSequence(positionText, angleText) {
  const positionRows = parseUiPrmdMatrix(positionText);
  const angleRows = parseUiPrmdMatrix(angleText);
  if (positionRows.length !== angleRows.length) {
    throw new Error(`UI_PRMD_FRAME_COUNT_MISMATCH positions=${positionRows.length} angles=${angleRows.length}`);
  }
  return positionRows.map((positionRow, index) =>
    reconstructUiPrmdKinectFrame(positionRow, angleRows[index]));
}

// Topology proxy from UI-PRMD's Kinect skeleton into the subset of MediaPipe
// landmarks consumed by Axion's whole-body feature extractor.
//
// UI-PRMD names joints by skeletal segments. The mapping follows the published
// hierarchy: collar -> upper arm -> forearm -> hand and
// upper leg -> lower leg -> foot -> toes. It is intentionally treated as a
// benchmark adapter, not anatomical ground truth.
const UI_TO_MEDIAPIPE = Object.freeze({
  11: 6,  // left shoulder <- left collar
  12: 10, // right shoulder <- right collar
  13: 7,  // left elbow <- left upper-arm endpoint
  14: 11, // right elbow <- right upper-arm endpoint
  15: 8,  // left wrist <- left forearm endpoint
  16: 12, // right wrist <- right forearm endpoint
  23: 14, // left hip <- left upper-leg joint
  24: 18, // right hip <- right upper-leg joint
  25: 15, // left knee <- left lower-leg joint
  26: 19, // right knee <- right lower-leg joint
  27: 16, // left ankle <- left foot joint
  28: 20, // right ankle <- right foot joint
  31: 17, // left foot index <- left leg toes
  32: 21, // right foot index <- right leg toes
});

export function uiPrmdKinectToAxionLandmarks(skeleton, {
  visibility = 1,
  invertVerticalAxis = true,
} = {}) {
  if (!Array.isArray(skeleton) || skeleton.length !== JOINT_COUNT) {
    throw new Error(`UI_PRMD_SKELETON_SHAPE expected=${JOINT_COUNT}`);
  }
  const landmarks = Array(33).fill(null);
  for (const [mediaPipeIndexText, uiIndex] of Object.entries(UI_TO_MEDIAPIPE)) {
    const mediaPipeIndex = Number(mediaPipeIndexText);
    const source = skeleton[uiIndex];
    if (!source || source.length < 3 || source.some((value) => !Number.isFinite(Number(value)))) continue;
    landmarks[mediaPipeIndex] = {
      x: Number(source[0]),
      y: invertVerticalAxis ? -Number(source[1]) : Number(source[1]),
      z: Number(source[2]),
      visibility,
    };
  }
  return landmarks;
}

export function parseUiPrmdSegmentFilename(filename = "") {
  const match = String(filename).match(/^(m\d{2})_(s\d{2})_(e\d{2})_positions\.txt$/i);
  if (!match) return null;
  const movementKey = match[1].toLowerCase();
  return {
    movementKey,
    subjectKey: match[2].toLowerCase(),
    episodeKey: match[3].toLowerCase(),
    movement: UI_PRMD_MOVEMENTS[movementKey] || null,
  };
}

export const UI_PRMD_ADAPTER_METADATA = Object.freeze({
  version: 1,
  dataset: "UI-PRMD",
  sourceFrameRateHz: 30,
  sourceJointCount: 22,
  valuesPerPositionFrame: 66,
  mappingScope: "kinematic benchmark topology proxy",
  reconstructionProvenance: "UI-PRMD published hierarchy + public reference transform order",
  eulerConventionIndependentlyVerified: false,
  clinicalValidation: false,
  injuryPredictionValidation: false,
});
