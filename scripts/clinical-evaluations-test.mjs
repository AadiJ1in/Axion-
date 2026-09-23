import assert from 'node:assert/strict';
import { CLINICAL_EVALUATION_ORDER, getClinicalEvaluation, listClinicalEvaluations } from '../src/clinical-evaluations.js';

assert.deepEqual(CLINICAL_EVALUATION_ORDER, ['tug','chair_stand_30s','four_stage_balance','single_leg_stance','single_leg_squat']);
assert.equal(listClinicalEvaluations().length, 5);
assert.equal(getClinicalEvaluation('chair_stand_30s').primaryOutcome, 'completed_stands');
assert.equal(getClinicalEvaluation('four_stage_balance').domain, 'Static balance');
assert.match(getClinicalEvaluation('tug').cameraLimitations.join(' '), /3 m/i);
assert.match(getClinicalEvaluation('single_leg_squat').cameraLimitations.join(' '), /3D motion capture/i);
assert.equal(getClinicalEvaluation('missing'), null);
assert.ok(listClinicalEvaluations().every((evaluation) => evaluation.safety && evaluation.interpretation));

console.log('Clinical evaluation registry passed: standardized workflows, camera boundaries, and safety guidance are explicit.');
