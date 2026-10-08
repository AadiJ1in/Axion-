import assert from "node:assert/strict";
import { liveWholeBodyAsymmetry } from "../src/whole-body-live-asymmetry.js";
import { recordWholeBodySymptom, summarizeWholeBodySymptomHistory } from "../src/whole-body-symptom-map.js";
const withheld=liveWholeBodyAsymmetry(null);
assert.equal(withheld.status, "withheld");
const frame={ angleAnalysis:{ angles:{
 left_knee_flexion_3d_deg:{status:"available",valueDeg:72},
 right_knee_flexion_3d_deg:{status:"available",valueDeg:58},
 left_elbow_flexion_3d_deg:{status:"withheld",valueDeg:null},
 right_elbow_flexion_3d_deg:{status:"available",valueDeg:35}
}}};
const result=liveWholeBodyAsymmetry(frame);
assert.equal(result.status,"available");
assert.deepEqual(result.joints[0].deltaDeg,14);
assert.equal(result.joints[0].greaterAngleSide,"left");
assert.equal(result.joints[1].status,"withheld");
assert.equal(result.joints[1].deltaDeg,null);
assert.equal(liveWholeBodyAsymmetry({angleAnalysis:{angles:{}}}).status,"withheld");
assert.throws(()=>recordWholeBodySymptom({region:"knee",intensity:5}));
assert.throws(()=>recordWholeBodySymptom({region:"left_knee",intensity:11}));
const a=recordWholeBodySymptom({region:"left_knee",intensity:7,timestamp:"2026-10-08T10:00:00Z"});
const b=recordWholeBodySymptom({region:"left_knee",intensity:3,timestamp:"2026-10-08T11:00:00Z"});
const summary=summarizeWholeBodySymptomHistory([b,a]);
assert.equal(summary.source,"patient_reported");
assert.equal(summary.regions[0].change,-4);
assert.equal(summary.regions[0].observations,2);
assert.equal(summarizeWholeBodySymptomHistory([]).status,"insufficient_data");
console.log("Live WBF angle asymmetry and patient-reported symptom tests passed.");
