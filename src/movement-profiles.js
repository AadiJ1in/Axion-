const ANGLE_SIGNALS = new Set([
  "knee_bend", "knee_extension", "hip_flexion", "hip_extension", "elbow_flexion",
  "arm_extension", "ankle_dorsiflexion", "ankle_plantarflexion", "shoulder_opening",
  "torso_extension", "torso_flexion",
]);
const OVERLAY_JOINTS = {
  knee_bend: "knee", knee_extension: "knee", hip_flexion: "hip", hip_extension: "hip",
  hip_lift: "hip", side_plank_lift: "hip", ankle_dorsiflexion: "ankle",
  ankle_plantarflexion: "ankle", elbow_flexion: "elbow", arm_extension: "elbow",
  shoulder_opening: "shoulder", torso_extension: "torso", torso_flexion: "torso",
};

const rep = (signal, threshold, options = {}) => ({
  mode: "reps", signal, startThreshold: threshold, returnThreshold: Math.max(2, threshold * 0.35),
  minActiveFrames: 3, minReturnFrames: 3, minRepMs: 450, maxRepMs: 12000,
  unit: ANGLE_SIGNALS.has(signal) ? "°" : "%", overlayJoint: OVERLAY_JOINTS[signal] || null, ...options,
});

const hold = (signal, threshold, options = {}) => ({
  mode: "hold", signal, startThreshold: threshold, returnThreshold: Math.max(1, threshold * 0.45),
  minActiveFrames: 5, unit: ANGLE_SIGNALS.has(signal) ? "°" : "%", overlayJoint: OVERLAY_JOINTS[signal] || null, ...options,
});

// Every prescribed exercise has an explicit visual tracking contract. Thresholds are
// deliberately calibration-relative, not clinical ROM targets. They detect a repeatable
// movement cycle; they do not grade whether a movement is clinically correct.
export const movementProfiles = {
  chin_tuck: rep("head_retraction", 6, { label: "Head glide", cameraHint: "Use a side or ¾ view with your head and shoulders visible." }),
  cervical_rotation: rep("head_yaw", 14, { label: "Neck rotation", bilateral: "alternate", cameraHint: "Face the camera with both ears visible." }),
  cervical_side_bend: rep("head_tilt", 10, { label: "Neck side bend", bilateral: "alternate", cameraHint: "Face the camera and keep both shoulders visible." }),
  upper_trap_stretch: hold("head_tilt", 8, { label: "Neck side bend", cameraHint: "Face the camera and keep your shoulders relaxed." }),

  shoulder_pendulum: hold("wrist_motion", 5, { label: "Pendulum motion", unit: "%", activeMotion: true, cameraHint: "Use a ¾ view with the hanging arm fully visible." }),
  wall_crawl: rep("wrist_elevation", 18, { label: "Arm elevation", cameraHint: "Use a side or front view with hand and shoulder visible." }),
  cross_body_shoulder_stretch: hold("cross_body_reach", 12, { label: "Cross-body reach", cameraHint: "Face the camera with both arms visible." }),
  shoulder_external_rotation: rep("forearm_rotation", 10, { label: "Shoulder rotation", cameraHint: "Face the camera; keep elbow tucked and forearm visible." }),
  shoulder_internal_rotation: rep("forearm_rotation", 10, { label: "Shoulder rotation", cameraHint: "Face the camera; keep elbow tucked and forearm visible." }),
  scapular_retraction: rep("shoulder_span", 5, { label: "Shoulder-blade motion", unit: "%", cameraHint: "Face the camera with shoulders and hips visible." }),

  doorway_chest_stretch: hold("shoulder_opening", 8, { label: "Chest opening", cameraHint: "Use a front view with elbows and shoulders visible." }),
  wall_push_up: rep("elbow_flexion", 24, { label: "Elbow bend", cameraHint: "Use a side or ¾ view with shoulders, elbows, and wrists visible." }),
  supine_chest_opening: hold("shoulder_opening", 8, { label: "Chest opening", cameraHint: "Position the camera above or at a ¾ angle so both arms are visible." }),

  thoracic_extension_chair: rep("torso_extension", 8, { label: "Upper-back extension", cameraHint: "Use a side view with ears, shoulders, and hips visible." }),
  open_book: rep("torso_rotation", 12, { label: "Upper-back rotation", cameraHint: "Use a front/overhead ¾ view with both shoulders and wrists visible." }),
  seated_row: rep("elbow_flexion", 22, { label: "Elbow pull", cameraHint: "Face the camera with both arms and torso visible." }),
  wall_angels: rep("wrist_elevation", 18, { label: "Arm elevation", cameraHint: "Face the camera with both wrists and shoulders visible." }),

  biceps_curl: rep("elbow_flexion", 28, { label: "Elbow bend", cameraHint: "Use a front or side view with the working arm visible." }),
  triceps_extension: rep("elbow_flexion", 24, { label: "Elbow motion", cameraHint: "Use a side view with shoulder, elbow, and wrist visible." }),
  wrist_flexor_stretch: hold("arm_extension", 12, { label: "Arm position", cameraHint: "Use a side or front view with elbow and wrist visible." }),
  forearm_rotation: rep("wrist_orbit", 7, { label: "Forearm rotation", unit: "%", cameraHint: "Face the camera with elbow fixed and wrist visible." }),

  abdominal_bracing: hold("trunk_stability", 4, { label: "Trunk stability", unit: "%", stability: true, cameraHint: "Use a side view with shoulders and hips visible; the camera cannot verify muscle activation." }),
  dead_bug: rep("opposite_limb_reach", 14, { label: "Opposite-limb reach", cameraHint: "Use an elevated ¾ view with both arms and legs visible." }),
  bridge: rep("hip_lift", 12, { label: "Hip lift", cameraHint: "Use a side view with shoulders, hips, and knees visible." }),
  bird_dog: rep("opposite_limb_reach", 14, { label: "Opposite-limb reach", cameraHint: "Use a side/¾ view with hands, hips, and ankles visible." }),
  modified_front_plank: hold("plank_position", 45, { label: "Body orientation", unit: "°", cameraHint: "Use a side view with shoulders, hips, and knees visible." }),
  side_plank_knees: hold("side_plank_lift", 10, { label: "Hip lift", cameraHint: "Use a front/¾ view with shoulder, hip, and knee visible." }),

  pelvic_tilt: rep("pelvis_rotation", 5, { label: "Pelvic motion", unit: "%", cameraHint: "Use a close side view with shoulders and hips visible; small tilts may require therapist review." }),
  knee_to_chest: hold("hip_flexion", 18, { label: "Hip bend", cameraHint: "Use a side/¾ view with hip and knee visible." }),
  cat_camel: rep("torso_flexion", 9, { label: "Spine motion", cameraHint: "Use a side view with shoulders, hips, and head visible." }),
  seated_trunk_rotation: rep("torso_rotation", 12, { label: "Trunk rotation", bilateral: "alternate", cameraHint: "Face the camera with shoulders and hips visible." }),

  clamshell: rep("knee_separation", 10, { label: "Knee separation", cameraHint: "Use a front/¾ view with both hips and knees visible." }),
  reverse_clamshell: rep("ankle_separation", 8, { label: "Foot separation", cameraHint: "Use a front/¾ view with knees and feet visible." }),
  hip_abduction: rep("hip_abduction", 12, { label: "Hip abduction", cameraHint: "Use a front view with hips, knees, and ankles visible." }),
  hip_adduction: rep("hip_adduction", 10, { label: "Hip adduction", cameraHint: "Use a front view with hips, knees, and ankles visible." }),
  prone_hip_extension: rep("hip_extension", 10, { label: "Hip extension", cameraHint: "Use a side view with shoulder, hip, knee, and ankle visible." }),
  figure_four_stretch: hold("figure_four", 12, { label: "Hip position", cameraHint: "Use a front/¾ view with both knees and ankles visible." }),

  half_squat: rep("knee_bend", 22, { label: "Knee bend", cameraHint: "Use a front or ¾ full-body view." }),
  wall_sit: hold("knee_bend", 28, { label: "Knee bend", cameraHint: "Use a side or ¾ full-body view." }),
  leg_extension: rep("knee_extension", 24, { label: "Knee extension", cameraHint: "Use a side view with hip, knee, and ankle visible." }),
  straight_leg_raise: rep("hip_flexion", 16, { label: "Hip flexion", cameraHint: "Use a side view with shoulder, hip, knee, and ankle visible." }),
  standing_quad_stretch: hold("knee_bend", 28, { label: "Knee bend", cameraHint: "Use a side/¾ view with hip, knee, and ankle visible." }),

  hamstring_curl: rep("knee_bend", 26, { label: "Knee bend", cameraHint: "Use a side or ¾ view with the working leg visible." }),
  supine_hamstring_stretch: hold("hip_flexion", 18, { label: "Hip flexion", cameraHint: "Use a side/¾ view with hip, knee, and ankle visible." }),
  seated_hamstring_stretch: hold("torso_flexion", 8, { label: "Forward hinge", cameraHint: "Use a side view with ear, shoulder, hip, and knee visible." }),

  bodyweight_squat: rep("knee_bend", 28, { label: "Knee bend", cameraHint: "Use a front or ¾ full-body view." }),
  step_up: rep("step_height", 12, { label: "Step height", bilateral: "alternate", cameraHint: "Use a side/¾ view with the step and both legs visible." }),
  terminal_knee_extension: rep("knee_extension", 14, { label: "Knee extension", cameraHint: "Use a side/¾ view with hip, knee, and ankle visible." }),
  heel_slide: rep("knee_bend", 20, { label: "Knee bend", cameraHint: "Use a side view with hip, knee, and heel visible." }),

  heel_raise: rep("heel_lift", 7, { label: "Heel lift", unit: "%", cameraHint: "Use a side/¾ full-body view with heels visible." }),
  heel_cord_stretch: hold("ankle_dorsiflexion", 7, { label: "Ankle bend", cameraHint: "Use a side view with knee, ankle, heel, and toes visible." }),
  bent_knee_heel_cord_stretch: hold("ankle_dorsiflexion", 7, { label: "Ankle bend", cameraHint: "Use a side view with knee, ankle, heel, and toes visible." }),
  tibialis_raise: rep("toe_lift", 5, { label: "Toe lift", unit: "%", cameraHint: "Use a close side/¾ view with ankles, heels, and toes visible." }),

  ankle_dorsiflexion: rep("ankle_dorsiflexion", 7, { label: "Ankle bend", cameraHint: "Use a close side view with knee, ankle, heel, and toes visible." }),
  ankle_plantar_flexion: rep("ankle_plantarflexion", 7, { label: "Ankle point", cameraHint: "Use a close side view with knee, ankle, heel, and toes visible." }),
  ankle_range_of_motion: rep("foot_orbit", 8, { label: "Ankle path", unit: "%", cameraHint: "Use a close side/¾ view with the working foot visible." }),
  towel_curl: rep("toe_motion", 3, { label: "Forefoot motion", unit: "%", cameraHint: "Use a close side view of the working foot. Pose tracking may miss very small toe motion." }),
  toe_yoga: rep("toe_motion", 3, { label: "Forefoot motion", unit: "%", cameraHint: "Use a close side view of the working foot. Pose tracking may miss isolated toes." }),

  single_leg_balance: hold("single_leg_support", 10, { label: "Foot clearance", unit: "%", cameraHint: "Use a front full-body view with a stable support nearby." }),
  tandem_stance: hold("tandem_stance", 7, { label: "Stance position", unit: "%", cameraHint: "Use a front/¾ full-body view with both feet visible." }),
  heel_to_toe_walk: rep("gait_step", 8, { label: "Step motion", unit: "%", bilateral: "alternate", cameraHint: "Use a front full-body view with the walking path visible." }),
};

export function getMovementProfile(exerciseKey, trackingMode = "guided_reps") {
  const profile = movementProfiles[exerciseKey];
  if (profile) return { exerciseKey, ...profile };
  return trackingMode === "timed_hold"
    ? { exerciseKey, ...hold("trunk_stability", 4, { label: "Position stability", unit: "%", stability: true, cameraHint: "Keep the prescribed body area visible." }) }
    : { exerciseKey, ...rep("whole_body_motion", 10, { label: "Movement", unit: "%", cameraHint: "Keep your full body visible." }) };
}

export function assertMovementProfileCoverage(exerciseKeys) {
  return exerciseKeys.filter((key) => !movementProfiles[key]);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const point = (landmarks, index) => landmarks[index];
const visible = (landmarks, indices, minimum = 0.45) => indices.every((index) => point(landmarks, index) && (point(landmarks, index).visibility ?? 1) >= minimum);
const distance = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
const midpoint = (a, b) => ({ x: ((a?.x ?? 0) + (b?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? 0)) / 2, z: ((a?.z ?? 0) + (b?.z ?? 0)) / 2 });

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magnitude = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z);
  return magnitude ? Math.acos(clamp(dot / magnitude, -1, 1)) * 180 / Math.PI : 0;
}

const joint = (landmarks, indices, invert = false) => visible(landmarks, indices)
  ? (invert ? 180 - angle(point(landmarks, indices[0]), point(landmarks, indices[1]), point(landmarks, indices[2])) : angle(point(landmarks, indices[0]), point(landmarks, indices[1]), point(landmarks, indices[2])))
  : null;

function bodyScale(landmarks) {
  if (!visible(landmarks, [11, 12, 23, 24], 0.25)) return 0.25;
  return Math.max(0.08, distance(midpoint(point(landmarks, 11), point(landmarks, 12)), midpoint(point(landmarks, 23), point(landmarks, 24))));
}

const scaled = (value, scale, multiplier = 45) => value == null ? null : value / Math.max(0.001, scale) * multiplier;
const pair = (left, right) => {
  const values = [left, right].filter(Number.isFinite);
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    left: Number.isFinite(left) ? left : null,
    right: Number.isFinite(right) ? right : null,
    symmetryDelta: Number.isFinite(left) && Number.isFinite(right) ? Math.abs(left - right) : null,
  };
};

export function measureMovementSignal(landmarks, profile) {
  if (!landmarks?.length) return pair(null, null);
  const scale = bodyScale(landmarks);
  const knee = () => pair(joint(landmarks, [23, 25, 27], true), joint(landmarks, [24, 26, 28], true));
  const hip = () => pair(joint(landmarks, [11, 23, 25], true), joint(landmarks, [12, 24, 26], true));
  const elbow = () => pair(joint(landmarks, [11, 13, 15], true), joint(landmarks, [12, 14, 16], true));
  const ankle = () => pair(joint(landmarks, [25, 27, 31]), joint(landmarks, [26, 28, 32]));
  const wristHeight = () => pair(
    visible(landmarks, [11, 15]) ? scaled(point(landmarks, 11).y - point(landmarks, 15).y, scale) : null,
    visible(landmarks, [12, 16]) ? scaled(point(landmarks, 12).y - point(landmarks, 16).y, scale) : null,
  );
  const hipLift = () => {
    const shoulderMid = midpoint(point(landmarks, 11), point(landmarks, 12));
    const hipMid = midpoint(point(landmarks, 23), point(landmarks, 24));
    const kneeMid = midpoint(point(landmarks, 25), point(landmarks, 26));
    return visible(landmarks, [11, 12, 23, 24, 25, 26]) ? pair(180 - angle(shoulderMid, hipMid, kneeMid), null) : pair(null, null);
  };

  switch (profile.signal) {
    case "knee_bend": return knee();
    case "knee_extension": {
      const values = knee(); return pair(values.left == null ? null : -values.left, values.right == null ? null : -values.right);
    }
    case "hip_flexion": return hip();
    case "hip_extension": {
      const values = hip(); return pair(values.left == null ? null : -values.left, values.right == null ? null : -values.right);
    }
    case "elbow_flexion": return elbow();
    case "arm_extension": {
      const values = elbow(); return pair(values.left == null ? null : -values.left, values.right == null ? null : -values.right);
    }
    case "ankle_dorsiflexion": return ankle();
    case "ankle_plantarflexion": {
      const values = ankle(); return pair(values.left == null ? null : -values.left, values.right == null ? null : -values.right);
    }
    case "wrist_elevation": return wristHeight();
    case "head_yaw": {
      if (!visible(landmarks, [0, 7, 8])) return pair(null, null);
      const earMid = midpoint(point(landmarks, 7), point(landmarks, 8));
      return pair(scaled(Math.abs(point(landmarks, 0).x - earMid.x), Math.max(0.02, distance(point(landmarks, 7), point(landmarks, 8))), 90), null);
    }
    case "head_tilt": {
      if (!visible(landmarks, [7, 8])) return pair(null, null);
      return pair(scaled(Math.abs(point(landmarks, 7).y - point(landmarks, 8).y), Math.max(0.02, distance(point(landmarks, 7), point(landmarks, 8))), 90), null);
    }
    case "head_retraction": {
      if (!visible(landmarks, [7, 8, 11, 12])) return pair(null, null);
      const earMid = midpoint(point(landmarks, 7), point(landmarks, 8));
      const shoulderMid = midpoint(point(landmarks, 11), point(landmarks, 12));
      return pair(scaled(earMid.z - shoulderMid.z, scale), null);
    }
    case "forearm_rotation": return pair(
      visible(landmarks, [13, 15]) ? scaled(Math.abs(point(landmarks, 15).x - point(landmarks, 13).x), scale) : null,
      visible(landmarks, [14, 16]) ? scaled(Math.abs(point(landmarks, 16).x - point(landmarks, 14).x), scale) : null,
    );
    case "wrist_orbit": return pair(
      visible(landmarks, [13, 15]) ? scaled(distance(point(landmarks, 13), point(landmarks, 15)), scale, 35) : null,
      visible(landmarks, [14, 16]) ? scaled(distance(point(landmarks, 14), point(landmarks, 16)), scale, 35) : null,
    );
    case "shoulder_span": return visible(landmarks, [11, 12]) ? pair(scaled(distance(point(landmarks, 11), point(landmarks, 12)), scale, 30), null) : pair(null, null);
    case "shoulder_opening": return pair(joint(landmarks, [13, 11, 23]), joint(landmarks, [14, 12, 24]));
    case "cross_body_reach": return pair(
      visible(landmarks, [12, 15]) ? -scaled(distance(point(landmarks, 15), point(landmarks, 12)), scale) : null,
      visible(landmarks, [11, 16]) ? -scaled(distance(point(landmarks, 16), point(landmarks, 11)), scale) : null,
    );
    case "torso_rotation": {
      if (!visible(landmarks, [11, 12, 23, 24])) return pair(null, null);
      const shoulderDepth = Math.abs((point(landmarks, 11).z ?? 0) - (point(landmarks, 12).z ?? 0));
      const hipDepth = Math.abs((point(landmarks, 23).z ?? 0) - (point(landmarks, 24).z ?? 0));
      return pair(scaled(shoulderDepth - hipDepth, scale, 60), null);
    }
    case "torso_extension":
    case "torso_flexion": {
      if (!visible(landmarks, [7, 8, 11, 12, 23, 24])) return pair(null, null);
      const earMid = midpoint(point(landmarks, 7), point(landmarks, 8));
      const shoulderMid = midpoint(point(landmarks, 11), point(landmarks, 12));
      const hipMid = midpoint(point(landmarks, 23), point(landmarks, 24));
      const value = 180 - angle(earMid, shoulderMid, hipMid);
      return pair(profile.signal === "torso_extension" ? -value : value, null);
    }
    case "hip_lift": return hipLift();
    case "side_plank_lift": return hipLift();
    case "plank_alignment": return hipLift();
    case "plank_position": {
      if (!visible(landmarks, [11, 12, 23, 24])) return pair(null, null);
      const shoulderMid = midpoint(point(landmarks, 11), point(landmarks, 12));
      const hipMid = midpoint(point(landmarks, 23), point(landmarks, 24));
      const horizontal = Math.abs(shoulderMid.x - hipMid.x);
      const vertical = Math.abs(shoulderMid.y - hipMid.y);
      return pair(Math.atan2(horizontal, vertical) * 180 / Math.PI, null);
    }
    case "opposite_limb_reach": {
      const left = visible(landmarks, [15, 28]) ? scaled(distance(point(landmarks, 15), point(landmarks, 28)), scale, 20) : null;
      const right = visible(landmarks, [16, 27]) ? scaled(distance(point(landmarks, 16), point(landmarks, 27)), scale, 20) : null;
      return pair(left, right);
    }
    case "knee_separation": return visible(landmarks, [25, 26]) ? pair(scaled(distance(point(landmarks, 25), point(landmarks, 26)), scale, 35), null) : pair(null, null);
    case "ankle_separation": return visible(landmarks, [27, 28]) ? pair(scaled(distance(point(landmarks, 27), point(landmarks, 28)), scale, 35), null) : pair(null, null);
    case "hip_abduction": return pair(
      visible(landmarks, [23, 25]) ? scaled(Math.abs(point(landmarks, 25).x - point(landmarks, 23).x), scale) : null,
      visible(landmarks, [24, 26]) ? scaled(Math.abs(point(landmarks, 26).x - point(landmarks, 24).x), scale) : null,
    );
    case "hip_adduction": return pair(
      visible(landmarks, [24, 25]) ? -scaled(Math.abs(point(landmarks, 25).x - point(landmarks, 24).x), scale) : null,
      visible(landmarks, [23, 26]) ? -scaled(Math.abs(point(landmarks, 26).x - point(landmarks, 23).x), scale) : null,
    );
    case "figure_four": return pair(
      visible(landmarks, [24, 27]) ? -scaled(distance(point(landmarks, 27), point(landmarks, 24)), scale) : null,
      visible(landmarks, [23, 28]) ? -scaled(distance(point(landmarks, 28), point(landmarks, 23)), scale) : null,
    );
    case "step_height": return pair(
      visible(landmarks, [27, 28]) ? scaled(point(landmarks, 28).y - point(landmarks, 27).y, scale) : null,
      visible(landmarks, [27, 28]) ? scaled(point(landmarks, 27).y - point(landmarks, 28).y, scale) : null,
    );
    case "heel_lift": return pair(
      visible(landmarks, [27, 29]) ? scaled(point(landmarks, 27).y - point(landmarks, 29).y, scale, 35) : null,
      visible(landmarks, [28, 30]) ? scaled(point(landmarks, 28).y - point(landmarks, 30).y, scale, 35) : null,
    );
    case "toe_lift":
    case "toe_motion": return pair(
      visible(landmarks, [29, 31]) ? scaled(point(landmarks, 29).y - point(landmarks, 31).y, scale, 35) : null,
      visible(landmarks, [30, 32]) ? scaled(point(landmarks, 30).y - point(landmarks, 32).y, scale, 35) : null,
    );
    case "foot_orbit": return pair(
      visible(landmarks, [27, 31]) ? scaled(distance(point(landmarks, 27), point(landmarks, 31)), scale, 35) : null,
      visible(landmarks, [28, 32]) ? scaled(distance(point(landmarks, 28), point(landmarks, 32)), scale, 35) : null,
    );
    case "single_leg_support": return pair(
      visible(landmarks, [27, 28]) ? scaled(Math.abs(point(landmarks, 27).y - point(landmarks, 28).y), scale, 35) : null, null,
    );
    case "tandem_stance": return visible(landmarks, [27, 28]) ? pair(scaled(Math.abs(point(landmarks, 27).z - point(landmarks, 28).z), scale, 35), null) : pair(null, null);
    case "gait_step": return pair(
      visible(landmarks, [27, 28]) ? scaled(point(landmarks, 27).z - point(landmarks, 28).z, scale, 35) : null,
      visible(landmarks, [27, 28]) ? scaled(point(landmarks, 28).z - point(landmarks, 27).z, scale, 35) : null,
    );
    case "pelvis_rotation": return visible(landmarks, [23, 24]) ? pair(scaled(Math.abs(point(landmarks, 23).z - point(landmarks, 24).z), scale, 35), null) : pair(null, null);
    case "trunk_stability": return visible(landmarks, [11, 12, 23, 24]) ? pair(scaled(distance(midpoint(point(landmarks, 11), point(landmarks, 12)), midpoint(point(landmarks, 23), point(landmarks, 24))), scale, 20), null) : pair(null, null);
    case "wrist_motion": return pair(
      visible(landmarks, [11, 15]) ? scaled(distance(point(landmarks, 11), point(landmarks, 15)), scale, 20) : null,
      visible(landmarks, [12, 16]) ? scaled(distance(point(landmarks, 12), point(landmarks, 16)), scale, 20) : null,
    );
    default: return pair(
      visible(landmarks, [15, 23]) ? scaled(distance(point(landmarks, 15), point(landmarks, 23)), scale, 20) : null,
      visible(landmarks, [16, 24]) ? scaled(distance(point(landmarks, 16), point(landmarks, 24)), scale, 20) : null,
    );
  }
}
