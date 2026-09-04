export const MOVEMENT_EVENT = Object.freeze({
  MOVEMENT_PROGRESS: "movement_progress",
  REP_COMPLETE: "rep_complete",
  HOLD_PROGRESS: "hold_progress",
  HOLD_COMPLETE: "hold_complete",
  SAFETY_FLAG: "safety_flag",
  PAUSE: "pause",
  RESUME: "resume",
  RESET: "reset",
});

const movementGameMappings = Object.freeze({
  bodyweight_squat: {
    action: "duck",
    title: "Escape Through the Ruins",
    instruction: "Your calibrated squat moves the explorer down through safe openings. Stand tall to rise again.",
  },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getMovementGameMapping(exerciseKey) {
  return movementGameMappings[exerciseKey] || null;
}

export function movementGameStory(completed, target) {
  const ratio = target ? completed / target : 0;
  if (ratio >= 1) return { chapter: "Mission complete", detail: "You escaped the ruins with controlled movement.", progress: 1 };
  if (ratio >= 0.75) return { chapter: "Final escape", detail: "The exit is close. Keep the same safe range.", progress: ratio };
  if (ratio >= 0.5) return { chapter: "Checkpoint reached", detail: "The path is narrowing, but your movement target is unchanged.", progress: ratio };
  if (ratio >= 0.25) return { chapter: "Falling gallery", detail: "Time each squat to pass beneath the stone gates.", progress: ratio };
  return { chapter: "Enter the ruins", detail: "Practice one controlled squat as the first gate approaches.", progress: ratio };
}

export function createMovementGameController({ exerciseKey, targetReps = 0, targetHoldSeconds = 0, onState = () => {} }) {
  const mapping = getMovementGameMapping(exerciseKey);
  const clinicalTarget = Math.max(0, Number(targetHoldSeconds || targetReps) || 0);
  let attemptNumber = 0;
  let state = {
    exerciseKey,
    mapping,
    mode: "standard",
    gameDifficulty: "standard",
    clinicalTarget,
    completed: 0,
    remaining: clinicalTarget,
    movement: 0,
    runnerY: 18,
    obstacleX: 108,
    obstaclePattern: 0,
    attemptActive: false,
    attemptCollided: false,
    obstacleResolved: false,
    collisions: 0,
    collectibles: 0,
    score: 0,
    paused: false,
    safetyFlagged: false,
    lastOutcome: null,
    story: movementGameStory(0, clinicalTarget),
  };

  const snapshot = () => Object.freeze({
    ...state,
    progress: clinicalTarget ? Math.min(1, state.completed / clinicalTarget) : 0,
    missionLength: clinicalTarget <= 8 ? "Short mission" : clinicalTarget <= 12 ? "Medium mission" : "Long mission",
  });
  const publish = () => {
    const value = snapshot();
    onState(value);
    return value;
  };
  const updateTotals = (next) => ({
    ...next,
    remaining: Math.max(0, clinicalTarget - next.completed),
    score: next.completed * 100 + next.collectibles * 25,
    story: movementGameStory(next.completed, clinicalTarget),
  });

  return {
    getState: snapshot,
    setMode(mode) {
      state = { ...state, mode: mode === "game" && mapping ? "game" : "standard", paused: false, lastOutcome: null };
      return publish();
    },
    setGameDifficulty(gameDifficulty) {
      state = { ...state, gameDifficulty: ["gentle", "standard", "lively"].includes(gameDifficulty) ? gameDifficulty : "standard" };
      return publish();
    },
    tick(deltaMs) {
      if (state.mode !== "game" || state.paused || !state.attemptActive || state.completed >= clinicalTarget) return snapshot();
      const speed = { gentle: 8, standard: 11, lively: 14 }[state.gameDifficulty];
      const obstacleX = state.obstacleX - speed * clamp(Number(deltaMs) || 0, 0, 80) / 1000;
      let attemptCollided = state.attemptCollided;
      let obstacleResolved = state.obstacleResolved;
      let collectibles = state.collectibles;
      if (!obstacleResolved && obstacleX <= 28) {
        obstacleResolved = true;
        // The opening begins before the detector's valid-rep threshold. Deeper
        // movement never earns more space or points; the calibrated value caps at 1.
        attemptCollided = state.movement < 0.48;
        if (!attemptCollided) collectibles += 1;
      }
      state = updateTotals({ ...state, obstacleX, attemptCollided, obstacleResolved, collectibles });
      return publish();
    },
    consume(event) {
      if (!event?.type) return publish();
      if (event.type === MOVEMENT_EVENT.SAFETY_FLAG) {
        state = { ...state, paused: true, safetyFlagged: true, lastOutcome: "safety_pause" };
      } else if (event.type === MOVEMENT_EVENT.PAUSE) {
        state = { ...state, paused: true, lastOutcome: "paused" };
      } else if (event.type === MOVEMENT_EVENT.RESUME) {
        state = { ...state, paused: false, lastOutcome: null };
      } else if (event.type === MOVEMENT_EVENT.RESET) {
        attemptNumber = 0;
        state = updateTotals({ ...state, completed: 0, movement: 0, runnerY: 18, obstacleX: 108, obstaclePattern: 0, attemptActive: false, attemptCollided: false, obstacleResolved: false, collisions: 0, collectibles: 0, paused: false, safetyFlagged: false, lastOutcome: null });
      } else if (!state.paused && event.type === MOVEMENT_EVENT.MOVEMENT_PROGRESS) {
        const movement = clamp(Number(event.progress) || 0, 0, 1);
        const returnedWithoutValidRep = event.stage === "up" && movement < 0.1 && state.attemptActive;
        const starting = movement >= 0.15 && !state.attemptActive;
        if (starting) attemptNumber += 1;
        state = {
          ...state,
          movement,
          runnerY: 18 + movement * 62,
          attemptActive: returnedWithoutValidRep ? false : (starting ? true : state.attemptActive),
          attemptCollided: returnedWithoutValidRep || starting ? false : state.attemptCollided,
          obstacleResolved: returnedWithoutValidRep || starting ? false : state.obstacleResolved,
          obstacleX: returnedWithoutValidRep ? 108 : (starting ? 54 : state.obstacleX),
          obstaclePattern: starting ? attemptNumber % 3 : state.obstaclePattern,
          lastOutcome: returnedWithoutValidRep ? "form_retry" : (starting ? null : state.lastOutcome),
        };
      } else if (!state.paused && event.type === MOVEMENT_EVENT.REP_COMPLETE) {
        const collided = state.attemptCollided;
        const completed = collided ? state.completed : Math.min(clinicalTarget, state.completed + 1);
        state = updateTotals({
          ...state,
          completed,
          collisions: state.collisions + (collided ? 1 : 0),
          attemptActive: false,
          attemptCollided: false,
          obstacleResolved: false,
          obstacleX: 108,
          lastOutcome: collided ? "collision" : (completed >= clinicalTarget ? "complete" : "counted"),
        });
      } else if (!state.paused && event.type === MOVEMENT_EVENT.HOLD_PROGRESS) {
        state = updateTotals({ ...state, completed: Math.min(clinicalTarget, Math.max(state.completed, Number(event.seconds) || 0)) });
      } else if (!state.paused && event.type === MOVEMENT_EVENT.HOLD_COMPLETE) {
        state = updateTotals({ ...state, completed: clinicalTarget, lastOutcome: "complete" });
      }
      return publish();
    },
  };
}
