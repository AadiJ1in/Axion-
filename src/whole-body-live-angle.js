// Maps Axion movement-profile signals to the canonical WBF angle geometry used for
// live degree readouts. This changes presentation/persistence only; rep detection
// remains controlled by the existing calibrated movement signal so the clinical
// counting contract is not silently altered.
export const WHOLE_BODY_LIVE_ANGLE_SCHEMA_VERSION = 1;

const SIGNAL_MAP = Object.freeze({
  knee_bend: Object.freeze({ left: "left_knee_flexion_3d_deg", right: "right_knee_flexion_3d_deg", label: "Knee flexion angle", peak: "max" }),
  knee_extension: Object.freeze({ left: "left_knee_flexion_3d_deg", right: "right_knee_flexion_3d_deg", label: "Knee flexion angle", peak: "min" }),
  elbow_flexion: Object.freeze({ left: "left_elbow_flexion_3d_deg", right: "right_elbow_flexion_3d_deg", label: "Elbow flexion angle", peak: "max" }),
  arm_extension: Object.freeze({ left: "left_elbow_flexion_3d_deg", right: "right_elbow_flexion_3d_deg", label: "Elbow flexion angle", peak: "min" }),
  hip_flexion: Object.freeze({ left: "left_hip_trunk_thigh_bend_3d_deg", right: "right_hip_trunk_thigh_bend_3d_deg", label: "Hip trunk-thigh bend", peak: "max" }),
  hip_extension: Object.freeze({ left: "left_hip_trunk_thigh_bend_3d_deg", right: "right_hip_trunk_thigh_bend_3d_deg", label: "Hip trunk-thigh bend", peak: "max" }),
  shoulder_opening: Object.freeze({ left: "left_shoulder_trunk_arm_bend_3d_deg", right: "right_shoulder_trunk_arm_bend_3d_deg", label: "Shoulder trunk-arm bend", peak: "max" }),
  ankle_dorsiflexion: Object.freeze({ left: "left_shank_foot_internal_3d_deg", right: "right_shank_foot_internal_3d_deg", label: "Shank-foot angle", peak: "min" }),
  ankle_plantarflexion: Object.freeze({ left: "left_shank_foot_internal_3d_deg", right: "right_shank_foot_internal_3d_deg", label: "Shank-foot angle", peak: "max" }),
  torso_flexion: Object.freeze({ single: "trunk_inclination_side_2d_deg", label: "Trunk inclination", peak: "max" }),
  torso_extension: Object.freeze({ single: "trunk_inclination_side_2d_deg", label: "Trunk inclination", peak: "max" }),
  plank_position: Object.freeze({ single: "trunk_inclination_side_2d_deg", label: "Trunk inclination", peak: "max" }),
  torso_side_bend: Object.freeze({ single: "trunk_lateral_inclination_front_2d_deg", label: "Trunk lateral inclination", peak: "max_abs" }),
});

const finite = (v) => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v,d=1) => { const n=finite(v); if(n===null) return null; const f=10**d; return Math.round(n*f)/f; };

export function canonicalAngleContractForSignal(signal) {
  return SIGNAL_MAP[String(signal || "")] || null;
}

function frameValue(frame, key) {
  const block=frame?.angleAnalysis?.angles?.[key];
  return block?.status === "available" ? finite(block.valueDeg) : null;
}

function preferredSide(prescribedSide, measurementSide) {
  if (prescribedSide === "left" || prescribedSide === "right") return prescribedSide;
  return measurementSide === "left" || measurementSide === "right" ? measurementSide : null;
}

export function canonicalLiveAngleFromFrame(frame, {
  signal,
  prescribedSide="either",
  measurementSide=null,
}={}) {
  const contract=canonicalAngleContractForSignal(signal);
  if(!contract) return null;

  if(contract.single) {
    const value=frameValue(frame,contract.single);
    if(!Number.isFinite(value)) return null;
    return {
      schemaVersion:WHOLE_BODY_LIVE_ANGLE_SCHEMA_VERSION,
      status:"available",
      valueDeg:round(value),
      leftDeg:null,
      rightDeg:null,
      symmetryDeltaDeg:null,
      measurementSide:null,
      angleLabel:contract.label,
      sourceAngle:contract.single,
      geometry:"canonical_wbf_angle",
    };
  }

  const left=frameValue(frame,contract.left);
  const right=frameValue(frame,contract.right);
  const side=preferredSide(prescribedSide,measurementSide);
  let value=null;
  if(side==="left"&&Number.isFinite(left)) value=left;
  else if(side==="right"&&Number.isFinite(right)) value=right;
  else {
    const values=[left,right].filter(Number.isFinite);
    value=values.length ? values.reduce((s,v)=>s+v,0)/values.length : null;
  }
  if(!Number.isFinite(value)) return null;
  return {
    schemaVersion:WHOLE_BODY_LIVE_ANGLE_SCHEMA_VERSION,
    status:"available",
    valueDeg:round(value),
    leftDeg:round(left),
    rightDeg:round(right),
    symmetryDeltaDeg:Number.isFinite(left)&&Number.isFinite(right)?round(Math.abs(left-right)):null,
    measurementSide:side,
    angleLabel:contract.label,
    sourceAngle:side==="left"?contract.left:side==="right"?contract.right:`${contract.left}+${contract.right}`,
    geometry:"canonical_wbf_angle",
  };
}

function repMetric(block, mode) {
  if(!block) return null;
  if(mode==="min") return finite(block.minDeg);
  if(mode==="max_abs") {
    const min=finite(block.minDeg), max=finite(block.maxDeg);
    if(!Number.isFinite(min)&&!Number.isFinite(max)) return null;
    return Math.abs(min ?? 0) >= Math.abs(max ?? 0) ? min : max;
  }
  return finite(block.maxDeg);
}

export function canonicalRepAngleFromAnalysis(repAngleAnalysis, {
  signal,
  prescribedSide="either",
  measurementSide=null,
}={}) {
  if(repAngleAnalysis?.status!=="available") return null;
  const contract=canonicalAngleContractForSignal(signal);
  if(!contract) return null;
  if(contract.single) {
    const block=repAngleAnalysis.angles?.[contract.single];
    const value=repMetric(block,contract.peak);
    if(!Number.isFinite(value)) return null;
    return {
      schemaVersion:WHOLE_BODY_LIVE_ANGLE_SCHEMA_VERSION,
      status:"available",
      jointAngleDeg:round(value),
      movementRangeDeg:round(block?.robustRomDeg),
      symmetryDeltaDeg:null,
      angleLabel:contract.label,
      sourceAngle:contract.single,
      measurementSide:null,
      geometry:"canonical_wbf_angle",
    };
  }

  const leftBlock=repAngleAnalysis.angles?.[contract.left];
  const rightBlock=repAngleAnalysis.angles?.[contract.right];
  const left=repMetric(leftBlock,contract.peak);
  const right=repMetric(rightBlock,contract.peak);
  const side=preferredSide(prescribedSide,measurementSide);
  let value=null, range=null;
  if(side==="left") { value=left; range=finite(leftBlock?.robustRomDeg); }
  else if(side==="right") { value=right; range=finite(rightBlock?.robustRomDeg); }
  else {
    const values=[left,right].filter(Number.isFinite);
    const ranges=[finite(leftBlock?.robustRomDeg),finite(rightBlock?.robustRomDeg)].filter(Number.isFinite);
    value=values.length?values.reduce((s,v)=>s+v,0)/values.length:null;
    range=ranges.length?ranges.reduce((s,v)=>s+v,0)/ranges.length:null;
  }
  if(!Number.isFinite(value)) return null;
  const leftMedian=finite(leftBlock?.medianDeg), rightMedian=finite(rightBlock?.medianDeg);
  return {
    schemaVersion:WHOLE_BODY_LIVE_ANGLE_SCHEMA_VERSION,
    status:"available",
    jointAngleDeg:round(value),
    movementRangeDeg:round(range),
    symmetryDeltaDeg:Number.isFinite(leftMedian)&&Number.isFinite(rightMedian)?round(Math.abs(leftMedian-rightMedian)):null,
    angleLabel:contract.label,
    sourceAngle:side==="left"?contract.left:side==="right"?contract.right:`${contract.left}+${contract.right}`,
    measurementSide:side,
    geometry:"canonical_wbf_angle",
  };
}
