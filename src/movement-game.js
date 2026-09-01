export const MOVEMENT_EVENT = Object.freeze({
  REP_COMPLETE: "rep_complete",
  HOLD_PROGRESS: "hold_progress",
  HOLD_COMPLETE: "hold_complete",
  SAFETY_FLAG: "safety_flag",
  RESUME: "resume",
  RESET: "reset",
});

const movementGameMappings = Object.freeze({
  bodyweight_squat: { action: "duck", title: "Trail Duck", instruction: "Complete the prescribed squat to duck beneath the next obstacle." },
  half_squat: { action: "duck", title: "Trail Duck", instruction: "Complete the prescribed squat to duck beneath the next obstacle." },
  sit_to_stand: { action: "rise", title: "Power Rise", instruction: "Complete the sit-to-stand to lift the platform." },
  supported_side_stepping: { action: "dodge", title: "Side Path", instruction: "Each prescribed side step moves the guide to the next safe lane." },
  lateral_band_walk: { action: "dodge", title: "Side Path", instruction: "Each prescribed side step moves the guide to the next safe lane." },
  marching_in_place: { action: "step_over", title: "Step Trail", instruction: "Each prescribed march clears one trail marker." },
  seated_march: { action: "step_over", title: "Step Trail", instruction: "Each prescribed march clears one trail marker." },
  heel_raise: { action: "reach_up", title: "Beacon Lift", instruction: "Each prescribed heel raise lifts the beacon." },
  seated_calf_raise: { action: "reach_up", title: "Beacon Lift", instruction: "Each prescribed heel raise lifts the beacon." },
  assisted_shoulder_flexion: { action: "reach", title: "Reach Garden", instruction: "Each prescribed arm raise reaches the next light." },
  standing_shoulder_abduction: { action: "reach", title: "Reach Garden", instruction: "Each prescribed arm raise reaches the next light." },
  shoulder_scaption: { action: "reach", title: "Reach Garden", instruction: "Each prescribed arm raise reaches the next light." },
  single_leg_balance: { action: "balance_hold", title: "Stillwater", instruction: "Maintain the prescribed hold to steady the path." },
  tandem_stance: { action: "balance_hold", title: "Stillwater", instruction: "Maintain the prescribed hold to steady the path." },
  heel_slide: { action: "guide_path", title: "Path Guide", instruction: "Each prescribed heel slide guides the marker along its path." },
});

export function getMovementGameMapping(exerciseKey) {
  return movementGameMappings[exerciseKey] || null;
}

export function createMovementGameController({ exerciseKey, targetReps = 0, targetHoldSeconds = 0, onState = () => {} }) {
  const mapping = getMovementGameMapping(exerciseKey);
  const clinicalTarget = Math.max(0, Number(targetHoldSeconds || targetReps) || 0);
  let state = {
    exerciseKey,
    mapping,
    mode: "standard",
    gameDifficulty: "standard",
    clinicalTarget,
    completed: 0,
    paused: false,
    safetyFlagged: false,
  };

  const publish = () => {
    const snapshot = Object.freeze({ ...state, progress: clinicalTarget ? Math.min(1, state.completed / clinicalTarget) : 0 });
    onState(snapshot);
    return snapshot;
  };

  return {
    getState: () => ({ ...state, progress: clinicalTarget ? Math.min(1, state.completed / clinicalTarget) : 0 }),
    setMode(mode) {
      state = { ...state, mode: mode === "game" && mapping ? "game" : "standard" };
      return publish();
    },
    setGameDifficulty(gameDifficulty) {
      state = { ...state, gameDifficulty: ["gentle", "standard", "lively"].includes(gameDifficulty) ? gameDifficulty : "standard" };
      return publish();
    },
    consume(event) {
      if (!event?.type) return publish();
      if (event.type === MOVEMENT_EVENT.SAFETY_FLAG) {
        state = { ...state, paused: true, safetyFlagged: true };
      } else if (event.type === MOVEMENT_EVENT.RESUME) {
        state = { ...state, paused: false };
      } else if (event.type === MOVEMENT_EVENT.RESET) {
        state = { ...state, completed: 0, paused: false, safetyFlagged: false };
      } else if (!state.paused && event.type === MOVEMENT_EVENT.REP_COMPLETE) {
        state = { ...state, completed: Math.min(clinicalTarget, state.completed + 1) };
      } else if (!state.paused && event.type === MOVEMENT_EVENT.HOLD_PROGRESS) {
        state = { ...state, completed: Math.min(clinicalTarget, Math.max(state.completed, Number(event.seconds) || 0)) };
      } else if (!state.paused && event.type === MOVEMENT_EVENT.HOLD_COMPLETE) {
        state = { ...state, completed: clinicalTarget };
      }
      return publish();
    },
  };
}

