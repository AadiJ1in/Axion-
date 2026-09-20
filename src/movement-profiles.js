export * from "./movement-profiles-core.js";

import { getMovementProfile as getCoreMovementProfile } from "./movement-profiles-core.js";
import { recordActiveMovementExercise } from "./movement-runtime-context.js";

export function getMovementProfile(exerciseKey, trackingMode = "guided_reps") {
  const profile = getCoreMovementProfile(exerciseKey, trackingMode);
  recordActiveMovementExercise(profile?.exerciseKey || exerciseKey);
  return profile;
}
