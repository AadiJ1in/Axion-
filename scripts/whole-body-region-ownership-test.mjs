import assert from "node:assert/strict";
import {
  WHOLE_BODY_ANALYSIS_REGION_FEATURES,
  WHOLE_BODY_ANALYSIS_REGION_MAP_VERSION,
  validateWholeBodyAnalysisRegionOwnership,
} from "../src/whole-body-region-ownership.js";
import { WHOLE_BODY_REGIONS } from "../src/whole-body-biomechanics.js";

const validation = validateWholeBodyAnalysisRegionOwnership();
assert.equal(WHOLE_BODY_ANALYSIS_REGION_MAP_VERSION, 1);
assert.equal(validation.valid, true, JSON.stringify(validation.errors));
assert.deepEqual(validation.errors, []);
assert.equal(validation.regionCount, WHOLE_BODY_REGIONS.length);
assert.ok(validation.ownedFeatureCount >= 30);

const owners = new Map();
for (const [region, features] of Object.entries(WHOLE_BODY_ANALYSIS_REGION_FEATURES)) {
  assert.ok(WHOLE_BODY_REGIONS.includes(region), `unknown region ${region}`);
  assert.ok(features.length >= 2, `${region} needs multiple independent descriptors`);
  for (const feature of features) {
    assert.equal(owners.has(feature), false, `${feature} is double-counted by ${owners.get(feature)} and ${region}`);
    owners.set(feature, region);
  }
}

assert.equal(owners.get("trunk_base_offset_pct"), "base_of_support");
assert.ok(!WHOLE_BODY_ANALYSIS_REGION_FEATURES.trunk.includes("trunk_base_offset_pct"));
assert.ok(WHOLE_BODY_ANALYSIS_REGION_FEATURES.base_of_support.includes("trunk_base_offset_pct"));

console.log(`Whole-body regional ownership v${WHOLE_BODY_ANALYSIS_REGION_MAP_VERSION} passed with ${validation.ownedFeatureCount} uniquely owned descriptors.`);
