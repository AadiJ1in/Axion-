import { buildWholeBodyStatisticalFingerprintV8, wholeBodyStatisticalFingerprintColumnsV8 } from "./whole-body-statistical-fingerprint-v8.js";
import {
  WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION,
  WHOLE_BODY_CANONICAL_ANGLE_NAMES,
  WHOLE_BODY_CANONICAL_ANGLE_PAIR_NAMES,
} from "./whole-body-angle-analysis.js";

export const WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V9 = 9;

const finite = (v) => v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v,d=6) => { const n=finite(v); if(n===null) return null; const f=10**d; return Math.round(n*f)/f; };

const ANGLE_STATS = Object.freeze({
  medianDeg: Object.freeze(["median","iqr","slopePerRep"]),
  robustRomDeg: Object.freeze(["median","iqr","slopePerRep"]),
  peakPhase: Object.freeze(["median","iqr"]),
  p95AbsVelocityDegPerSecond: Object.freeze(["median","iqr"]),
  frameCoverage: Object.freeze(["median"]),
});

const PAIR_STATS = Object.freeze({
  signedMedianDifferenceDeg: Object.freeze(["median","iqr","slopePerRep"]),
  absoluteMedianDifferenceDeg: Object.freeze(["median","iqr","slopePerRep"]),
  robustRomDifferenceDeg: Object.freeze(["median","iqr","slopePerRep"]),
  peakPhaseDifference: Object.freeze(["median","iqr"]),
});

function safeName(name) {
  return String(name).replace(/_deg$/,"");
}

export function buildWholeBodyStatisticalFingerprintV9(sessionSummary) {
  const base=buildWholeBodyStatisticalFingerprintV8(sessionSummary);
  if(base?.status!=="available") return {...base,schemaVersion:WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V9};
  const angles=sessionSummary?.angleAnalysis;
  const features={...base.features};

  features.angle_analysis_available=angles?.status==="available"?1:0;
  features.angle_analysis_reps=round(angles?.repsAnalyzed);
  features.angle_analysis_canonical_angle_count=round(angles?.canonicalAngleCount);
  features.angle_analysis_core_3d_angle_count=round(angles?.core3dAngleCount);
  features.angle_analysis_core_3d_required_count=round(angles?.core3dRequiredCount);

  for(const name of WHOLE_BODY_CANONICAL_ANGLE_NAMES) {
    const block=angles?.angles?.[name];
    const prefix=`angle_${safeName(name)}`;
    features[`${prefix}_rep_coverage`]=round(block?.repCoverage);
    for(const [metric,stats] of Object.entries(ANGLE_STATS)) {
      for(const stat of stats) features[`${prefix}_${metric}_${stat}`]=round(block?.[metric]?.[stat]);
    }
  }

  for(const pair of WHOLE_BODY_CANONICAL_ANGLE_PAIR_NAMES) {
    const block=angles?.pairAsymmetry?.[pair];
    const prefix=`angle_pair_${pair}`;
    features[`${prefix}_paired_rep_coverage`]=round(block?.pairedRepCoverage);
    for(const [metric,stats] of Object.entries(PAIR_STATS)) {
      for(const stat of stats) features[`${prefix}_${metric}_${stat}`]=round(block?.[metric]?.[stat]);
    }
  }

  const values=Object.values(features);
  const populated=values.filter(Number.isFinite).length;
  return {
    ...base,
    schemaVersion:WHOLE_BODY_STATISTICAL_FINGERPRINT_SCHEMA_VERSION_V9,
    canonicalAngleSchemaVersion:angles?.schemaVersion||WHOLE_BODY_ANGLE_ANALYSIS_SCHEMA_VERSION,
    featureCount:values.length,
    populatedFeatureCount:populated,
    coverage:values.length?round(populated/values.length):null,
    features,
    interpretation:`${base.interpretation} Fingerprint v9 adds explicitly defined canonical degree-angle geometry: world-landmark 3D joint bends, verified-view 2D angles, robust ROM, phase, angular velocity, and bilateral angle asymmetry. Legacy proxy names remain backward-compatible but should not be interpreted as isolated anatomical joint rotations.`,
  };
}

export function wholeBodyStatisticalFingerprintColumnsV9() {
  const columns=[...wholeBodyStatisticalFingerprintColumnsV8(),
    "angle_analysis_available","angle_analysis_reps","angle_analysis_canonical_angle_count",
    "angle_analysis_core_3d_angle_count","angle_analysis_core_3d_required_count"
  ];
  for(const name of WHOLE_BODY_CANONICAL_ANGLE_NAMES) {
    const prefix=`angle_${safeName(name)}`;
    columns.push(`${prefix}_rep_coverage`);
    for(const [metric,stats] of Object.entries(ANGLE_STATS)) for(const stat of stats) columns.push(`${prefix}_${metric}_${stat}`);
  }
  for(const pair of WHOLE_BODY_CANONICAL_ANGLE_PAIR_NAMES) {
    const prefix=`angle_pair_${pair}`;
    columns.push(`${prefix}_paired_rep_coverage`);
    for(const [metric,stats] of Object.entries(PAIR_STATS)) for(const stat of stats) columns.push(`${prefix}_${metric}_${stat}`);
  }
  return [...new Set(columns)].sort();
}
