import { angleDegrees } from "./biomechanics.js";

export const WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION = 1;

const CORE_3D = Object.freeze([
  "left_knee_flexion_3d_deg",
  "right_knee_flexion_3d_deg",
  "left_elbow_flexion_3d_deg",
  "right_elbow_flexion_3d_deg",
  "left_hip_trunk_thigh_bend_3d_deg",
  "right_hip_trunk_thigh_bend_3d_deg",
  "left_shoulder_trunk_arm_bend_3d_deg",
  "right_shoulder_trunk_arm_bend_3d_deg",
  "left_shank_foot_internal_3d_deg",
  "right_shank_foot_internal_3d_deg",
]);

export const WHOLE_BODY_CANONICAL_ANGLE_DEFINITIONS = Object.freeze({
  left_knee_flexion_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [23,25,27], transform: "flexion_from_straight",
    region: "left_lower_limb", pair: "knee_flexion_3d", side: "left", core: true,
    meaning: "3D geometric knee flexion; 0 deg is a straight hip-knee-ankle chain.",
  }),
  right_knee_flexion_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [24,26,28], transform: "flexion_from_straight",
    region: "right_lower_limb", pair: "knee_flexion_3d", side: "right", core: true,
    meaning: "3D geometric knee flexion; 0 deg is a straight hip-knee-ankle chain.",
  }),
  left_elbow_flexion_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [11,13,15], transform: "flexion_from_straight",
    region: "left_upper_limb", pair: "elbow_flexion_3d", side: "left", core: true,
    meaning: "3D geometric elbow flexion; 0 deg is a straight shoulder-elbow-wrist chain.",
  }),
  right_elbow_flexion_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [12,14,16], transform: "flexion_from_straight",
    region: "right_upper_limb", pair: "elbow_flexion_3d", side: "right", core: true,
    meaning: "3D geometric elbow flexion; 0 deg is a straight shoulder-elbow-wrist chain.",
  }),
  left_hip_trunk_thigh_bend_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [11,23,25], transform: "flexion_from_straight",
    region: "left_lower_limb", pair: "hip_trunk_thigh_bend_3d", side: "left", core: true,
    meaning: "3D bend between ipsilateral trunk and thigh segments. It is not pure sagittal hip flexion.",
  }),
  right_hip_trunk_thigh_bend_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [12,24,26], transform: "flexion_from_straight",
    region: "right_lower_limb", pair: "hip_trunk_thigh_bend_3d", side: "right", core: true,
    meaning: "3D bend between ipsilateral trunk and thigh segments. It is not pure sagittal hip flexion.",
  }),
  left_shoulder_trunk_arm_bend_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [23,11,13], transform: "internal_angle",
    region: "left_upper_limb", pair: "shoulder_trunk_arm_bend_3d", side: "left", core: true,
    meaning: "3D bend between trunk and upper arm. It is an elevation/bend proxy, not isolated shoulder flexion.",
  }),
  right_shoulder_trunk_arm_bend_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [24,12,14], transform: "internal_angle",
    region: "right_upper_limb", pair: "shoulder_trunk_arm_bend_3d", side: "right", core: true,
    meaning: "3D bend between trunk and upper arm. It is an elevation/bend proxy, not isolated shoulder flexion.",
  }),
  left_shank_foot_internal_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [25,27,31], transform: "internal_angle",
    region: "left_lower_limb", pair: "shank_foot_internal_3d", side: "left", core: true,
    meaning: "3D internal shank-ankle-foot angle. It is not direct anatomical dorsiflexion.",
  }),
  right_shank_foot_internal_3d_deg: Object.freeze({
    source: "world_3d", landmarks: [26,28,32], transform: "internal_angle",
    region: "right_lower_limb", pair: "shank_foot_internal_3d", side: "right", core: true,
    meaning: "3D internal shank-ankle-foot angle. It is not direct anatomical dorsiflexion.",
  }),
  pelvis_obliquity_front_2d_deg: Object.freeze({
    source: "image_2d", landmarks: [23,24], transform: "line_horizontal_signed", requiredView: "front",
    region: "pelvis", core: false,
    meaning: "Signed pelvis line angle relative to image horizontal in a verified frontal view.",
  }),
  shoulder_obliquity_front_2d_deg: Object.freeze({
    source: "image_2d", landmarks: [11,12], transform: "line_horizontal_signed", requiredView: "front",
    region: "trunk", core: false,
    meaning: "Signed shoulder line angle relative to image horizontal in a verified frontal view.",
  }),
  trunk_inclination_side_2d_deg: Object.freeze({
    source: "image_2d", landmarks: [11,12,23,24], transform: "trunk_vertical_absolute", requiredView: "side",
    region: "trunk", core: false,
    meaning: "Absolute trunk inclination from image vertical in a verified side view; direction is intentionally omitted.",
  }),
  trunk_lateral_inclination_front_2d_deg: Object.freeze({
    source: "image_2d", landmarks: [11,12,23,24], transform: "trunk_vertical_signed", requiredView: "front",
    region: "trunk", core: false,
    meaning: "Signed lateral trunk inclination from image vertical in a verified frontal view.",
  }),
  left_knee_flexion_side_2d_deg: Object.freeze({
    source: "image_2d", landmarks: [23,25,27], transform: "flexion_from_straight_2d", requiredView: "side",
    region: "left_lower_limb", pair: "knee_flexion_side_2d", side: "left", core: false,
    meaning: "2D projected knee flexion in a verified side view.",
  }),
  right_knee_flexion_side_2d_deg: Object.freeze({
    source: "image_2d", landmarks: [24,26,28], transform: "flexion_from_straight_2d", requiredView: "side",
    region: "right_lower_limb", pair: "knee_flexion_side_2d", side: "right", core: false,
    meaning: "2D projected knee flexion in a verified side view.",
  }),
});

export const WHOLE_BODY_CANONICAL_ANGLE_NAMES = Object.freeze(Object.keys(WHOLE_BODY_CANONICAL_ANGLE_DEFINITIONS));
export const WHOLE_BODY_CANONICAL_CORE_3D_ANGLE_NAMES = CORE_3D;

const finite = (v) => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v,d=4) => { const n=finite(v); if(n===null) return null; const f=10**d; return Math.round(n*f)/f; };
const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const point = (landmarks,index) => Array.isArray(landmarks) ? landmarks[index] || null : null;

function visible(landmarks, indices, minimumVisibility) {
  return indices.every((index) => {
    const p = point(landmarks,index);
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= minimumVisibility;
  });
}

function normalizeView(view) {
  const raw=String(view||"").trim().toLowerCase();
  if(["front","frontal","anterior","ap"].includes(raw)) return "front";
  if(["side","lateral","left_side","right_side","sagittal"].includes(raw)) return "side";
  return raw || "unknown";
}

function angle2d(a,b,c) {
  if(!a||!b||!c) return null;
  const bax=a.x-b.x, bay=a.y-b.y, bcx=c.x-b.x, bcy=c.y-b.y;
  const mag=Math.hypot(bax,bay)*Math.hypot(bcx,bcy);
  if(!mag) return null;
  return Math.acos(clamp((bax*bcx+bay*bcy)/mag,-1,1))*180/Math.PI;
}

function midpoint(a,b) {
  if(!a||!b) return null;
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z??0)+(b.z??0))/2};
}

function lineHorizontal(a,b) {
  if(!a||!b) return null;
  const dx=b.x-a.x, dy=b.y-a.y;
  return !dx&&!dy ? null : Math.atan2(dy,dx)*180/Math.PI;
}

function trunkVerticalSigned(landmarks) {
  const shoulder=midpoint(point(landmarks,11),point(landmarks,12));
  const hip=midpoint(point(landmarks,23),point(landmarks,24));
  if(!shoulder||!hip) return null;
  const dx=shoulder.x-hip.x;
  const up=hip.y-shoulder.y;
  return !dx&&!up ? null : Math.atan2(dx,up)*180/Math.PI;
}
function trunkVerticalAbs(landmarks) {
  const value=trunkVerticalSigned(landmarks);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function definitionValue(def,imageLandmarks,worldLandmarks) {
  const landmarks=def.source==="world_3d" ? worldLandmarks : imageLandmarks;
  if(def.transform==="trunk_vertical_absolute") return trunkVerticalAbs(landmarks);
  if(def.transform==="trunk_vertical_signed") return trunkVerticalSigned(landmarks);
  if(def.transform==="line_horizontal_signed") return lineHorizontal(point(landmarks,def.landmarks[0]),point(landmarks,def.landmarks[1]));
  const [a,b,c]=def.landmarks.map((i)=>point(landmarks,i));
  const internal=def.source==="world_3d" ? angleDegrees(a,b,c) : angle2d(a,b,c);
  if(!Number.isFinite(internal)) return null;
  if(def.transform==="flexion_from_straight" || def.transform==="flexion_from_straight_2d") return clamp(180-internal,0,180);
  return internal;
}

function visibilityStats(landmarks,indices) {
  const values=indices.map(i=>point(landmarks,i)?.visibility).filter(Number.isFinite);
  return {
    minVisibility: values.length ? Math.min(...values) : null,
    meanVisibility: values.length ? values.reduce((s,v)=>s+v,0)/values.length : null,
  };
}

export function extractWholeBodyCanonicalAngles({
  imageLandmarks,
  worldLandmarks=null,
  cameraView=null,
  minimumVisibility=0.55,
}={}) {
  const view=normalizeView(cameraView);
  const worldAvailable=Array.isArray(worldLandmarks)&&worldLandmarks.length>=33;
  const output={};
  let available=0, coreAvailable=0;

  for(const [name,def] of Object.entries(WHOLE_BODY_CANONICAL_ANGLE_DEFINITIONS)) {
    const sourceLandmarks=def.source==="world_3d" ? worldLandmarks : imageLandmarks;
    const reasons=[];
    if(def.source==="world_3d"&&!worldAvailable) reasons.push("world_landmarks_required");
    if(def.requiredView && view!==def.requiredView) reasons.push("camera_view_mismatch");
    if(!Array.isArray(sourceLandmarks)||sourceLandmarks.length<33) reasons.push("landmarks_unavailable");
    else if(!visible(sourceLandmarks,def.landmarks,minimumVisibility)) reasons.push("landmark_visibility_below_threshold");

    const stats=Array.isArray(sourceLandmarks) ? visibilityStats(sourceLandmarks,def.landmarks) : {minVisibility:null,meanVisibility:null};
    const value=reasons.length ? null : definitionValue(def,imageLandmarks,worldLandmarks);
    if(!Number.isFinite(value) && !reasons.length) reasons.push("degenerate_geometry");
    const status=reasons.length ? "withheld" : "available";
    if(status==="available") { available+=1; if(def.core) coreAvailable+=1; }

    output[name]={
      status,
      valueDeg: round(value),
      source:def.source,
      requiredView:def.requiredView||"any",
      viewMatched:!def.requiredView||view===def.requiredView,
      region:def.region,
      pair:def.pair||null,
      side:def.side||null,
      core:def.core===true,
      minVisibility:round(stats.minVisibility),
      meanVisibility:round(stats.meanVisibility),
      withheldReasons:reasons,
      meaning:def.meaning,
    };
  }

  return {
    schemaVersion:WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION,
    status:available ? "available" : "unavailable",
    clinicalStatus:"descriptive_unvalidated",
    cameraView:view,
    worldLandmarksAvailable:worldAvailable,
    availableAngleCount:available,
    core3dAvailableCount:coreAvailable,
    core3dRequiredCount:CORE_3D.length,
    angles:output,
    interpretation:"Canonical angle names describe the geometry actually measured. 3D joint bends use MediaPipe world landmarks and do not substitute for laboratory joint-coordinate-system kinematics. View-specific 2D angles are withheld unless the camera view matches. These measurements are not force, torque, tissue load, diagnosis, or injury-risk estimates.",
  };
}

function median(values) {
  const x=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!x.length) return null;
  const m=Math.floor(x.length/2);
  return x.length%2 ? x[m] : (x[m-1]+x[m])/2;
}
function quantile(values,q) {
  const x=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!x.length) return null;
  const p=(x.length-1)*q, lo=Math.floor(p), hi=Math.ceil(p);
  return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(p-lo);
}
function slope(values) {
  if(values.length<2) return null;
  const mx=(values.length-1)/2, my=values.reduce((s,v)=>s+v,0)/values.length;
  let num=0,den=0;
  values.forEach((v,i)=>{num+=(i-mx)*(v-my);den+=(i-mx)**2;});
  return den?num/den:null;
}
function stats(values) {
  const x=values.filter(Number.isFinite);
  if(!x.length) return null;
  const med=median(x), abs=x.map(v=>Math.abs(v-med));
  const mean=x.reduce((s,v)=>s+v,0)/x.length;
  const sd=x.length>1?Math.sqrt(x.reduce((s,v)=>s+(v-mean)**2,0)/(x.length-1)):0;
  return {
    n:x.length, mean:round(mean), median:round(med), min:round(Math.min(...x)), max:round(Math.max(...x)),
    sd:round(sd), mad:round(median(abs)), iqr:round(quantile(x,.75)-quantile(x,.25)), slopePerRep:round(slope(x)),
  };
}

export function analyzeWholeBodyAngleFrames(frames=[]) {
  const usable=frames.filter(f=>f?.angleAnalysis?.angles);
  const angles={};
  for(const name of WHOLE_BODY_CANONICAL_ANGLE_NAMES) {
    const rows=usable.map((frame,index)=>{
      const block=frame.angleAnalysis.angles[name];
      const value=finite(block?.valueDeg);
      return Number.isFinite(value)?{value,t:finite(frame.timestampMs),index}:null;
    }).filter(Boolean);
    if(!rows.length) continue;
    const values=rows.map(r=>r.value);
    const velocities=[];
    for(let i=1;i<rows.length;i+=1) {
      const dt=(rows[i].t-rows[i-1].t)/1000;
      if(Number.isFinite(dt)&&dt>0&&dt<=0.5) velocities.push((rows[i].value-rows[i-1].value)/dt);
    }
    const maxIndex=values.reduce((best,v,i)=>Math.abs(v)>Math.abs(values[best])?i:best,0);
    angles[name]={
      frameCoverage:round(rows.length/Math.max(1,usable.length)),
      samples:rows.length,
      meanDeg:round(values.reduce((s,v)=>s+v,0)/values.length),
      medianDeg:round(median(values)),
      minDeg:round(Math.min(...values)),
      maxDeg:round(Math.max(...values)),
      romDeg:round(Math.max(...values)-Math.min(...values)),
      robustRomDeg:round(quantile(values,.90)-quantile(values,.10)),
      sdDeg:round(stats(values)?.sd),
      madDeg:round(stats(values)?.mad),
      peakAbsoluteAngleDeg:round(Math.abs(values[maxIndex])),
      peakAbsoluteAnglePhase:rows.length>1?round(maxIndex/(rows.length-1)):0,
      medianAbsVelocityDegPerSecond:round(median(velocities.map(Math.abs))),
      p95AbsVelocityDegPerSecond:round(quantile(velocities.map(Math.abs),.95)),
      peakAbsVelocityDegPerSecond:velocities.length?round(Math.max(...velocities.map(Math.abs))):null,
    };
  }
  return {
    schemaVersion:WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION,
    status:Object.keys(angles).length?"available":"unavailable",
    frameCount:usable.length,
    angles,
  };
}

const PAIRS = Object.freeze([
  ["knee_flexion_3d","left_knee_flexion_3d_deg","right_knee_flexion_3d_deg"],
  ["elbow_flexion_3d","left_elbow_flexion_3d_deg","right_elbow_flexion_3d_deg"],
  ["hip_trunk_thigh_bend_3d","left_hip_trunk_thigh_bend_3d_deg","right_hip_trunk_thigh_bend_3d_deg"],
  ["shoulder_trunk_arm_bend_3d","left_shoulder_trunk_arm_bend_3d_deg","right_shoulder_trunk_arm_bend_3d_deg"],
  ["shank_foot_internal_3d","left_shank_foot_internal_3d_deg","right_shank_foot_internal_3d_deg"],
]);

export const WHOLE_BODY_CANONICAL_ANGLE_PAIR_NAMES = Object.freeze(PAIRS.map(x=>x[0]));

export function summarizeWholeBodyAngleSession(reps=[]) {
  const repAnalyses=reps.map(r=>r?.wholeBody?.angleAnalysis).filter(a=>a?.status==="available");
  if(!repAnalyses.length) return {schemaVersion:WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION,status:"unavailable",reason:"no_angle_analyzed_reps"};
  const angles={};
  for(const name of WHOLE_BODY_CANONICAL_ANGLE_NAMES) {
    const blocks=repAnalyses.map(a=>a.angles?.[name]).filter(Boolean);
    if(!blocks.length) continue;
    angles[name]={
      repCoverage:round(blocks.length/repAnalyses.length),
      medianDeg:stats(blocks.map(b=>b.medianDeg)),
      robustRomDeg:stats(blocks.map(b=>b.robustRomDeg)),
      peakPhase:stats(blocks.map(b=>b.peakAbsoluteAnglePhase)),
      p95AbsVelocityDegPerSecond:stats(blocks.map(b=>b.p95AbsVelocityDegPerSecond)),
      frameCoverage:stats(blocks.map(b=>b.frameCoverage)),
    };
  }
  const pairAsymmetry={};
  for(const [pair,left,right] of PAIRS) {
    const signed=[],abs=[],romDiff=[],phaseDiff=[];
    for(const rep of repAnalyses) {
      const l=rep.angles?.[left], r=rep.angles?.[right];
      if(!l||!r) continue;
      if(Number.isFinite(l.medianDeg)&&Number.isFinite(r.medianDeg)) {
        signed.push(l.medianDeg-r.medianDeg); abs.push(Math.abs(l.medianDeg-r.medianDeg));
      }
      if(Number.isFinite(l.robustRomDeg)&&Number.isFinite(r.robustRomDeg)) romDiff.push(l.robustRomDeg-r.robustRomDeg);
      if(Number.isFinite(l.peakAbsoluteAnglePhase)&&Number.isFinite(r.peakAbsoluteAnglePhase)) phaseDiff.push(l.peakAbsoluteAnglePhase-r.peakAbsoluteAnglePhase);
    }
    if(abs.length) pairAsymmetry[pair]={
      pairedRepCoverage:round(abs.length/repAnalyses.length),
      signedMedianDifferenceDeg:stats(signed),
      absoluteMedianDifferenceDeg:stats(abs),
      robustRomDifferenceDeg:stats(romDiff),
      peakPhaseDifference:stats(phaseDiff),
    };
  }
  return {
    schemaVersion:WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION,
    status:"available",
    clinicalStatus:"descriptive_unvalidated",
    repsAnalyzed:repAnalyses.length,
    canonicalAngleCount:Object.keys(angles).length,
    core3dAngleCount:CORE_3D.filter(name=>angles[name]).length,
    core3dRequiredCount:CORE_3D.length,
    angles,
    pairAsymmetry,
    interpretation:"Session angle analysis summarizes canonical 3D joint-bend geometry and verified-view 2D angles across accepted reps. Legacy Axion angle fields remain for backward compatibility, but pure anatomical flexion/dorsiflexion should not be inferred from legacy proxy names.",
  };
}
