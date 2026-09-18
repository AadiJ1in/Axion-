const LANDMARK = Object.freeze({
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
});

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const degrees = (radians) => radians * 180 / Math.PI;

function point(landmarks, index) {
  const raw = landmarks?.[index];
  if (!raw) return null;
  const x = finite(raw.x);
  const y = finite(raw.y);
  const z = finite(raw.z);
  if (x === null || y === null) return null;
  return { x, y, z: z ?? 0, visibility: finite(raw.visibility) ?? 1 };
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

function distance2d(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vector3d(a, b) {
  if (!a || !b) return null;
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}

function magnitude3d(vector) {
  if (!vector) return 0;
  return Math.hypot(vector.x, vector.y, vector.z);
}

function dot3d(a, b) {
  if (!a || !b) return null;
  return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

function distance3d(a, b) {
  return magnitude3d(vector3d(a, b));
}

function angleBetweenVectors3d(a, b) {
  const am = magnitude3d(a);
  const bm = magnitude3d(b);
  if (!am || !bm) return null;
  return degrees(Math.acos(clamp(dot3d(a, b) / (am * bm), -1, 1)));
}

function axisAlignmentDeviation3d(a, b) {
  const angle = angleBetweenVectors3d(a, b);
  if (angle === null) return null;
  return Math.min(angle, Math.abs(180 - angle));
}

function orthogonalityDeviation3d(a, b) {
  const angle = angleBetweenVectors3d(a, b);
  return angle === null ? null : Math.abs(90 - angle);
}

function pointLineResidual3d(pointValue, lineStart, lineEnd) {
  if (!pointValue || !lineStart || !lineEnd) return null;
  const axis = vector3d(lineStart, lineEnd);
  const lengthSquared = dot3d(axis, axis);
  if (!lengthSquared) return null;
  const fromStart = vector3d(lineStart, pointValue);
  const t = dot3d(fromStart, axis) / lengthSquared;
  const closest = {
    x: lineStart.x + axis.x * t,
    y: lineStart.y + axis.y * t,
    z: lineStart.z + axis.z * t,
  };
  return vector3d(closest, pointValue);
}

function projectionOnAxis3d(vector, axis, scale = 1) {
  const axisMagnitude = magnitude3d(axis);
  if (!vector || !axisMagnitude || !scale) return null;
  return dot3d(vector, axis) / (axisMagnitude * scale);
}

function angle3d(a, vertex, c) {
  if (!a || !vertex || !c) return null;
  const u = { x: a.x - vertex.x, y: a.y - vertex.y, z: a.z - vertex.z };
  const v = { x: c.x - vertex.x, y: c.y - vertex.y, z: c.z - vertex.z };
  const dot = u.x * v.x + u.y * v.y + u.z * v.z;
  const um = Math.hypot(u.x, u.y, u.z);
  const vm = Math.hypot(v.x, v.y, v.z);
  if (!um || !vm) return null;
  return degrees(Math.acos(clamp(dot / (um * vm), -1, 1)));
}

function segmentTiltFromHorizontal(a, b) {
  if (!a || !b) return null;
  return degrees(Math.atan2(b.y - a.y, b.x - a.x));
}

function wrappedAngleDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let delta = a - b;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function trunkLateralLean(shoulderMid, hipMid) {
  if (!shoulderMid || !hipMid) return null;
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-9) return null;
  return degrees(Math.atan2(dx, -dy));
}

function trunkLeanRelativeToPelvis(shoulderMid, hipMid, leftHip, rightHip) {
  if (!shoulderMid || !hipMid || !leftHip || !rightHip) return null;
  const pelvisX = rightHip.x - leftHip.x;
  const pelvisY = rightHip.y - leftHip.y;
  const pelvisLength = Math.hypot(pelvisX, pelvisY);
  if (!pelvisLength) return null;
  const referenceUp = { x: pelvisY / pelvisLength, y: -pelvisX / pelvisLength };
  const trunk = { x: shoulderMid.x - hipMid.x, y: shoulderMid.y - hipMid.y };
  const trunkLength = Math.hypot(trunk.x, trunk.y);
  if (!trunkLength) return null;
  const normalizedTrunk = { x: trunk.x / trunkLength, y: trunk.y / trunkLength };
  const cross = (referenceUp.x * normalizedTrunk.y) - (referenceUp.y * normalizedTrunk.x);
  const dot = (referenceUp.x * normalizedTrunk.x) + (referenceUp.y * normalizedTrunk.y);
  return degrees(Math.atan2(cross, dot));
}

function pointLineOffset2d(pointValue, lineStart, lineEnd) {
  if (!pointValue || !lineStart || !lineEnd) return null;
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  return ((pointValue.x - lineStart.x) * dy - (pointValue.y - lineStart.y) * dx) / length;
}

function pelvisOffsetAlongStance(hipMid, ankleMid, leftAnkle, rightAnkle, scale) {
  if (!hipMid || !ankleMid || !leftAnkle || !rightAnkle || !scale) return null;
  const axisX = rightAnkle.x - leftAnkle.x;
  const axisY = rightAnkle.y - leftAnkle.y;
  const axisLength = Math.hypot(axisX, axisY);
  if (!axisLength) return null;
  const unitX = axisX / axisLength;
  const unitY = axisY / axisLength;
  const shiftX = hipMid.x - ankleMid.x;
  const shiftY = hipMid.y - ankleMid.y;
  return ((shiftX * unitX) + (shiftY * unitY)) / scale;
}

function visibilityQuality(points) {
  const values = points.filter(Boolean).map((item) => clamp(item.visibility ?? 1, 0, 1));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function metric(metricKey, region, side, value, unit, quality, context = {}) {
  return Number.isFinite(value) ? { metricKey, region, side, value, unit, quality: clamp(quality, 0, 1), context } : null;
}

export function extractWholeBodyBiomechanics(landmarks, { source = "pose_world", cameraView = "unknown" } = {}) {
  const leftShoulder = point(landmarks, LANDMARK.leftShoulder);
  const rightShoulder = point(landmarks, LANDMARK.rightShoulder);
  const leftHip = point(landmarks, LANDMARK.leftHip);
  const rightHip = point(landmarks, LANDMARK.rightHip);
  const leftKnee = point(landmarks, LANDMARK.leftKnee);
  const rightKnee = point(landmarks, LANDMARK.rightKnee);
  const leftAnkle = point(landmarks, LANDMARK.leftAnkle);
  const rightAnkle = point(landmarks, LANDMARK.rightAnkle);

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const ankleMid = midpoint(leftAnkle, rightAnkle);
  const hipWidth = distance2d(leftHip, rightHip);
  const ankleWidth = distance2d(leftAnkle, rightAnkle);
  const stanceScale = Math.max(ankleWidth ?? 0, hipWidth ?? 0, 1e-5);
  const hipWidth3d = distance3d(leftHip, rightHip);
  const ankleWidth3d = distance3d(leftAnkle, rightAnkle);
  const stanceScale3d = Math.max(ankleWidth3d ?? 0, hipWidth3d ?? 0, 1e-5);
  const pelvisAxis3d = vector3d(leftHip, rightHip);
  const shoulderAxis3d = vector3d(leftShoulder, rightShoulder);
  const trunkAxis3d = vector3d(hipMid, shoulderMid);

  const trunkLean = trunkLateralLean(shoulderMid, hipMid);
  const pelvisRelativeTrunkLean = trunkLeanRelativeToPelvis(shoulderMid, hipMid, leftHip, rightHip);
  const trunkPelvisLateralDeviation3d = orthogonalityDeviation3d(pelvisAxis3d, trunkAxis3d);
  const shoulderPelvisAxisMismatch3d = axisAlignmentDeviation3d(shoulderAxis3d, pelvisAxis3d);
  const pelvicObliquity = segmentTiltFromHorizontal(leftHip, rightHip);
  const shoulderObliquity = segmentTiltFromHorizontal(leftShoulder, rightShoulder);
  const shoulderPelvisDelta = wrappedAngleDifference(shoulderObliquity, pelvicObliquity);
  const leftKneeAngle = angle3d(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = angle3d(rightHip, rightKnee, rightAnkle);
  const leftHipAngle = angle3d(leftShoulder, leftHip, leftKnee);
  const rightHipAngle = angle3d(rightShoulder, rightHip, rightKnee);
  const leftKneeLineOffset = pointLineOffset2d(leftKnee, leftHip, leftAnkle);
  const rightKneeLineOffset = pointLineOffset2d(rightKnee, rightHip, rightAnkle);
  const leftKneeResidual3d = pointLineResidual3d(leftKnee, leftHip, leftAnkle);
  const rightKneeResidual3d = pointLineResidual3d(rightKnee, rightHip, rightAnkle);
  const leftKneeMediolateral3d = projectionOnAxis3d(leftKneeResidual3d, pelvisAxis3d, stanceScale3d);
  const rightKneeMediolateral3d = projectionOnAxis3d(rightKneeResidual3d, pelvisAxis3d, stanceScale3d);
  const lateralShift = hipMid && ankleMid ? (hipMid.x - ankleMid.x) / stanceScale : null;
  const pelvisStanceShift = pelvisOffsetAlongStance(hipMid, ankleMid, leftAnkle, rightAnkle, stanceScale);
  const pelvisStanceShift3d = projectionOnAxis3d(vector3d(ankleMid, hipMid), pelvisAxis3d, stanceScale3d);
  const hipFlexionAsymmetry = leftHipAngle === null || rightHipAngle === null ? null : Math.abs(leftHipAngle - rightHipAngle);

  const trunkQuality = visibilityQuality([leftShoulder, rightShoulder, leftHip, rightHip]);
  const lowerQuality = visibilityQuality([leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle]);
  const leftLegQuality = visibilityQuality([leftHip, leftKnee, leftAnkle]);
  const rightLegQuality = visibilityQuality([rightHip, rightKnee, rightAnkle]);
  const common = { source, cameraView };
  const cameraSensitive = { ...common, cameraOrientationSensitive: true };
  const bodyRelative = { ...common, cameraOrientationSensitive: false, bodyRelative: true };

  return [
    metric("trunk_lateral_lean_deg", "trunk", "midline", Math.abs(trunkLean), "deg", trunkQuality, { ...cameraSensitive, signedValue: trunkLean }),
    metric("trunk_lateral_lean_relative_deg", "trunk", "midline", Math.abs(pelvisRelativeTrunkLean), "deg", trunkQuality, { ...bodyRelative, signedValue: pelvisRelativeTrunkLean, reference: "pelvis_normal" }),
    metric("trunk_pelvis_lateral_deviation_3d_deg", "trunk", "midline", trunkPelvisLateralDeviation3d, "deg", trunkQuality, { ...bodyRelative, invariant3d: true, reference: "pelvis_axis_vs_trunk_axis" }),
    metric("pelvic_obliquity_deg", "pelvis", "bilateral", Math.abs(pelvicObliquity), "deg", lowerQuality, { ...cameraSensitive, signedValue: pelvicObliquity }),
    metric("shoulder_obliquity_deg", "shoulder_girdle", "bilateral", Math.abs(shoulderObliquity), "deg", trunkQuality, { ...cameraSensitive, signedValue: shoulderObliquity }),
    metric("shoulder_pelvis_obliquity_delta_deg", "trunk", "bilateral", Math.abs(shoulderPelvisDelta), "deg", trunkQuality, { ...bodyRelative, signedValue: shoulderPelvisDelta, reference: "shoulder_vs_pelvis" }),
    metric("shoulder_pelvis_axis_mismatch_3d_deg", "trunk", "bilateral", shoulderPelvisAxisMismatch3d, "deg", trunkQuality, { ...bodyRelative, invariant3d: true, reference: "shoulder_axis_vs_pelvis_axis" }),
    metric("knee_flexion_deg", "knee", "left", leftKneeAngle === null ? null : Math.max(0, 180 - leftKneeAngle), "deg", leftLegQuality, common),
    metric("knee_flexion_deg", "knee", "right", rightKneeAngle === null ? null : Math.max(0, 180 - rightKneeAngle), "deg", rightLegQuality, common),
    metric("hip_flexion_proxy_deg", "hip", "left", leftHipAngle === null ? null : Math.max(0, 180 - leftHipAngle), "deg", visibilityQuality([leftShoulder, leftHip, leftKnee]), { ...common, proxy: true }),
    metric("hip_flexion_proxy_deg", "hip", "right", rightHipAngle === null ? null : Math.max(0, 180 - rightHipAngle), "deg", visibilityQuality([rightShoulder, rightHip, rightKnee]), { ...common, proxy: true }),
    metric("hip_flexion_asymmetry_3d_deg", "hip", "bilateral", hipFlexionAsymmetry, "deg", lowerQuality, { ...bodyRelative, invariant3d: true, proxy: true }),
    metric("knee_frontal_offset_proxy", "knee", "left", leftKneeLineOffset === null ? null : Math.abs(leftKneeLineOffset) / stanceScale, "ratio", leftLegQuality, { ...bodyRelative, proxy: true, signedValue: leftKneeLineOffset === null ? null : leftKneeLineOffset / stanceScale, reference: "hip_ankle_line" }),
    metric("knee_frontal_offset_proxy", "knee", "right", rightKneeLineOffset === null ? null : Math.abs(rightKneeLineOffset) / stanceScale, "ratio", rightLegQuality, { ...bodyRelative, proxy: true, signedValue: rightKneeLineOffset === null ? null : rightKneeLineOffset / stanceScale, reference: "hip_ankle_line" }),
    metric("knee_mediolateral_offset_3d_proxy", "knee", "left", leftKneeMediolateral3d === null ? null : Math.abs(leftKneeMediolateral3d), "ratio", leftLegQuality, { ...bodyRelative, invariant3d: true, proxy: true, signedValue: leftKneeMediolateral3d, reference: "hip_ankle_residual_projected_on_pelvis_axis" }),
    metric("knee_mediolateral_offset_3d_proxy", "knee", "right", rightKneeMediolateral3d === null ? null : Math.abs(rightKneeMediolateral3d), "ratio", rightLegQuality, { ...bodyRelative, invariant3d: true, proxy: true, signedValue: rightKneeMediolateral3d, reference: "hip_ankle_residual_projected_on_pelvis_axis" }),
    metric("lateral_weight_shift_proxy", "lower_limb", "bilateral", lateralShift === null ? null : Math.abs(lateralShift), "ratio", lowerQuality, { ...cameraSensitive, proxy: true, signedValue: lateralShift }),
    metric("pelvis_over_stance_offset_proxy", "lower_limb", "bilateral", pelvisStanceShift === null ? null : Math.abs(pelvisStanceShift), "ratio", lowerQuality, { ...bodyRelative, proxy: true, signedValue: pelvisStanceShift, reference: "ankle_line" }),
    metric("pelvis_over_stance_offset_3d_proxy", "lower_limb", "bilateral", pelvisStanceShift3d === null ? null : Math.abs(pelvisStanceShift3d), "ratio", lowerQuality, { ...bodyRelative, invariant3d: true, proxy: true, signedValue: pelvisStanceShift3d, reference: "pelvis_axis" }),
    metric("knee_flexion_asymmetry_deg", "knee", "bilateral", leftKneeAngle === null || rightKneeAngle === null ? null : Math.abs(leftKneeAngle - rightKneeAngle), "deg", lowerQuality, { ...bodyRelative, invariant3d: true, reference: "bilateral_knee_internal_angle_difference" }),
  ].filter(Boolean);
}

export function aggregateBiomechanicsFrames(frames = [], { minQuality = 0.55 } = {}) {
  const grouped = new Map();
  frames.flat().forEach((raw) => {
    if (!raw?.metricKey || !Number.isFinite(Number(raw.value)) || Number(raw.quality ?? 1) < minQuality) return;
    const key = `${raw.metricKey}|${raw.region}|${raw.side}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(raw);
  });

  return [...grouped.values()].map((items) => {
    const sorted = items.map((item) => Number(item.value)).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const quality = items.reduce((sum, item) => sum + Number(item.quality ?? 1), 0) / items.length;
    const first = items[0];
    return {
      metricKey: first.metricKey,
      region: first.region,
      side: first.side,
      value: median,
      unit: first.unit || null,
      quality: clamp(quality, 0, 1),
      context: {
        ...(first.context || {}),
        aggregation: "median",
        acceptedFrames: items.length,
      },
    };
  });
}
