import { exerciseCatalog } from './exercise-catalog.js';
import { getActiveCampaignStory } from './beacon-campaign.js';
import { exerciseGameFamily } from './exercise-game-families.js';

// Registry contains entertainment configuration only. The tracker owns validation.
// Kept as an exported compatibility surface for code/tests that inspect the named
// hand-crafted adventures. All other catalog exercises are now assigned through
// exercise-game-families.js instead of collapsing into one generic game.
export const adventureDefinitions = Object.freeze({
  bodyweight_squat: exerciseGameFamily('bodyweight_squat'),
  push_up: exerciseGameFamily('push_up'),
  wall_push_up: exerciseGameFamily('wall_push_up'),
  forward_lunge: exerciseGameFamily('forward_lunge'),
  standing_shoulder_abduction: exerciseGameFamily('standing_shoulder_abduction'),
});

export function getAdventureDefinition(key) {
  if (!exerciseCatalog[key]) return null;
  const base = exerciseGameFamily(key);
  if (!base) return null;
  return Object.freeze({
    ...base,
    world: 'beacon',
    story: getActiveCampaignStory(key),
  });
}

export const clamp01 = x => Math.min(1, Math.max(0, Number(x) || 0));
export function motionInput(profile, sample) {
  if (!Number.isFinite(sample.movementRange) || ['calibrating'].includes(sample.stage)) return null;
  if (profile.mode === 'hold') {
    return {
      type: 'movement_progress',
      range: sample.movementRange,
      progress: sample.stage === 'hold' ? 1 : 0,
      stage: sample.stage,
      side: sample.measurementSide || null,
    };
  }
  if (profile.mode !== 'reps' || ['positioning'].includes(sample.stage)) return null;
  return { type: 'movement_progress', range: sample.movementRange, progress: clamp01(sample.movementRange / profile.startThreshold), stage: sample.stage, side: sample.measurementSide || null };
}
export function doseProgress(assignment = {}, count = 0) {
  const sets = Math.max(1, Number(assignment.target_sets) || 1);
  const reps = assignment.tracking_mode === 'timed_hold' ? 1 : Math.max(1, Number(assignment.target_repetitions) || 1);
  const completed = Math.min(sets * reps, Math.max(0, count));
  return { sets, reps, total: sets * reps, completed, completedSets: Math.floor(completed / reps), set: Math.min(sets, Math.floor(completed / reps) + 1), rep: completed === sets * reps ? reps : completed % reps, done: completed === sets * reps, rest: completed > 0 && completed < sets * reps && completed % reps === 0 };
}

export function sessionCompletesDose(session, assignment) {
  if (!assignment) return false;
  const dose = doseProgress(assignment);
  return assignment.tracking_mode === 'timed_hold'
    ? Number(session.movement_summary?.measured_hold_seconds || 0) >= dose.sets * Number(assignment.duration_seconds || 30)
    : Number(session.repetitions || 0) >= dose.total;
}
export function gameTarget(mapping, pattern) {
  return mapping?.action === 'gravity' ? (pattern % 2 ? .25 : .72)
    : mapping?.action === 'light' ? [.4,.65,.8][pattern % 3] : .7;
}
