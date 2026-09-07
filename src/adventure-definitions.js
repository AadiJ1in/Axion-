import { exerciseCatalog } from './exercise-catalog.js';
import { getActiveBeaconStory } from './beacon-story.js';

// Registry contains entertainment configuration only. The tracker owns validation.
export const adventureDefinitions = Object.freeze({
  bodyweight_squat: { action: 'duck', scene: 'ruins', title: 'Escape Through the Ruins', instruction: 'Lower to duck under the beams. Stand to rise. Your first prescribed rep is the tutorial.', artifact: 'Sunstone', chapters: ['The fallen gate', 'The lantern gallery', 'The sunstone chamber'] },
  push_up: { action: 'gravity', scene: 'gravity', title: 'Gravity Runner', instruction: 'Lower your push-up to descend. Press up to rise through the gravity gates.', artifact: 'Gravity core', chapters: ['Wake the engine', 'The star conduit', 'The citadel approach'] },
  wall_push_up: { action: 'gravity', scene: 'gravity', title: 'Gravity Runner', instruction: 'Bend toward the wall to descend. Press away to rise. Keep your prescribed wall setup.', artifact: 'Gravity core', chapters: ['Wake the engine', 'The star conduit', 'The citadel approach'] },
  forward_lunge: { action: 'crossing', scene: 'wilds', title: 'Crossing the Verdant Wilds', instruction: 'Lower on your prescribed side to guide the explorer toward a stone. Return to complete the crossing.', artifact: 'Riverstone', chapters: ['The river crossing', 'The waterfall trail', 'The living bridge'] },
  standing_shoulder_abduction: { action: 'light', scene: 'sky', title: 'Sky Guardian', instruction: 'Raise your prescribed arm to guide the lantern upward. Lower it to return. Restore the crystal beacons.', artifact: 'Sky prism', chapters: ['Light the first beacon', 'The cloud gardens', 'The waking citadel'] },
});

const GENERIC_REP_ADVENTURE = Object.freeze({
  action: 'light',
  scene: 'sky',
  title: 'Pathfinder',
  instruction: 'Move through your prescribed range to guide the light toward each waypoint. The game reacts to your motion, but only Axion’s validated movement tracker can count a rep.',
  artifact: 'Trail light',
  chapters: ['Find the first marker', 'Follow the lit path', 'Restore the final waypoint'],
});

const GENERIC_HOLD_ADVENTURE = Object.freeze({
  action: 'light',
  scene: 'sky',
  title: 'Beacon Hold',
  instruction: 'Move into your prescribed position and hold steady to keep the beacon lit. The game provides feedback, but only Axion’s validated tracker can complete the hold.',
  artifact: 'Beacon crystal',
  chapters: ['Wake the beacon', 'Hold the signal', 'Stabilize the light'],
});

export function getAdventureDefinition(key) {
  const base = adventureDefinitions[key]
    || (exerciseCatalog[key]?.trackingMode === 'timed_hold' ? GENERIC_HOLD_ADVENTURE : exerciseCatalog[key] ? GENERIC_REP_ADVENTURE : null);
  if (!base) return null;
  return Object.freeze({ ...base, world: 'beacon', story: getActiveBeaconStory() });
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
