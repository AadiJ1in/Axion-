let activeExerciseKey = null;

export function recordActiveMovementExercise(exerciseKey) {
  const key = typeof exerciseKey === "string" ? exerciseKey.trim() : "";
  activeExerciseKey = key || null;
  return activeExerciseKey;
}

export function activeMovementExerciseKey() {
  return activeExerciseKey;
}

export function clearActiveMovementExercise() {
  activeExerciseKey = null;
}
