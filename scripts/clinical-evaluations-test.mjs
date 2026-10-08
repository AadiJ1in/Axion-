import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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


const evaluationUi = readFileSync('src/clinical-evaluation-ui.js', 'utf8');
const evaluationCss = readFileSync('src/clinical-evaluation-ui.css', 'utf8');
const bilateralUi = readFileSync('src/bilateral-balance-comparison-ui.js', 'utf8');
assert.ok(evaluationUi.includes('Left vs right leg comparison'), 'therapist evaluation must label bilateral leg comparison explicitly');
assert.ok(evaluationUi.includes('relativeSideDifferencePct'), 'bilateral evaluation must expose relative side-to-side difference');
assert.ok(evaluationUi.includes('SIDE-TO-SIDE'), 'bilateral evaluation must render an explicit difference column');
assert.ok(evaluationUi.includes('clinical-leg-bar'), 'bilateral evaluation must include a visual left/right magnitude comparison');
assert.ok(evaluationCss.includes('.clinical-bilateral-overview'), 'bilateral at-a-glance summary must have dedicated responsive styling');
assert.ok(bilateralUi.includes('LEFT VS RIGHT AT A GLANCE'), 'paired single-leg balance must expose a clear left/right summary');
assert.ok(bilateralUi.includes('side-to-side difference'), 'paired single-leg balance must quantify relative difference');
