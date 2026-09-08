import { exerciseCatalog } from './exercise-catalog.js';

const FAMILY_BY_CATEGORY = Object.freeze({
  Neck: {
    id: 'signal_alignment', action: 'light', scene: 'sky', title: 'Signal Alignment', holdTitle: 'Hold the Signal', artifact: 'Prism lens',
    instruction: 'Use your prescribed neck motion to line up the beacon lens with the signal markers. Move only through the range your therapist prescribed.',
    holdInstruction: 'Move into your prescribed neck position and hold steady to keep the beacon lens aligned. Axion’s tracker alone decides when the hold is complete.',
    chapters: ['Find the signal', 'Align the lens', 'Lock the relay'], worldEffect: 'align the valley signal network', movementRole: 'steer the beacon lens',
  },
  Shoulders: {
    id: 'sky_lantern', action: 'light', scene: 'sky', title: 'Sky Lantern Rescue', holdTitle: 'Lantern Stabilizer', artifact: 'Sky prism',
    instruction: 'Your prescribed shoulder motion lifts and guides the lantern through the beacon current. The game follows your movement without changing your clinical range.',
    holdInstruction: 'Hold your prescribed shoulder position to keep the lantern suspended while the beacon charges.',
    chapters: ['Raise the lantern', 'Cross the cloud line', 'Reach the tower'], worldEffect: 'carry light toward the next tower', movementRole: 'guide a sky lantern',
  },
  Chest: {
    id: 'gateforge', action: 'gravity', scene: 'gravity', title: 'Gateforge', holdTitle: 'Forge Core Hold', artifact: 'Forge core',
    instruction: 'Your prescribed press motion moves the forge platform through the energy gates. Keep your normal therapy depth and pace.',
    holdInstruction: 'Hold the prescribed position to stabilize the forge core while the gates recharge.',
    chapters: ['Wake the forge', 'Pass the energy gates', 'Seal the core'], worldEffect: 'power the valley gateworks', movementRole: 'drive the gateforge',
  },
  'Upper back': {
    id: 'rune_compass', action: 'light', scene: 'wilds', title: 'Rune Compass', holdTitle: 'Compass Lock', artifact: 'Rune compass',
    instruction: 'Your prescribed upper-back motion turns the rune compass toward hidden paths and relay stones.',
    holdInstruction: 'Hold your prescribed position to keep the rune compass locked on the hidden route.',
    chapters: ['Read the old map', 'Turn toward the route', 'Reveal the passage'], worldEffect: 'reveal lost routes across the valley', movementRole: 'turn the rune compass',
  },
  'Arms & elbows': {
    id: 'motion_forge', action: 'gravity', scene: 'gravity', title: 'Motion Forge', holdTitle: 'Forge Stabilizer', artifact: 'Ember gear',
    instruction: 'Your prescribed arm motion raises and lowers the forge mechanism to rebuild beacon parts.',
    holdInstruction: 'Hold the prescribed arm position to keep the forge mechanism stable while a beacon part is formed.',
    chapters: ['Heat the mechanism', 'Shape the beacon part', 'Finish the repair'], worldEffect: 'forge replacement parts for the beacon network', movementRole: 'operate the motion forge',
  },
  'Core & abs': {
    id: 'guardian_shield', action: 'light', scene: 'ruins', title: 'Guardian Shield', holdTitle: 'Shield Hold', artifact: 'Ward crystal',
    instruction: 'Your prescribed core movement charges a protective ward around the restoration team.',
    holdInstruction: 'Hold your prescribed core position to keep the guardian shield stable. Only the clinical tracker can complete the hold.',
    chapters: ['Raise the ward', 'Hold the storm line', 'Protect the beacon'], worldEffect: 'protect the restored route from the storm', movementRole: 'charge the guardian shield',
  },
  'Lower back': {
    id: 'pass_ward', action: 'light', scene: 'ruins', title: 'Ward the Pass', holdTitle: 'Pass Ward Hold', artifact: 'Stone sigil',
    instruction: 'Your prescribed trunk motion strengthens the ward stones that keep the mountain pass open.',
    holdInstruction: 'Hold the prescribed trunk position to keep the pass ward stable while the team crosses.',
    chapters: ['Wake the ward stones', 'Strengthen the passage', 'Secure the pass'], worldEffect: 'stabilize the mountain road', movementRole: 'strengthen the pass ward',
  },
  'Hips & glutes': {
    id: 'trailbreaker', action: 'light', scene: 'wilds', title: 'Trailbreaker', holdTitle: 'Trail Anchor', artifact: 'Trailstone',
    instruction: 'Your prescribed hip motion moves the trail mechanism that clears roots, stones, and old barriers ahead.',
    holdInstruction: 'Hold the prescribed hip position to anchor the trail mechanism while the route is secured.',
    chapters: ['Break the overgrowth', 'Open the middle trail', 'Reach the marker'], worldEffect: 'open a new route through the wilds', movementRole: 'drive the trailbreaker',
  },
  'Thighs & quads': {
    id: 'mountain_ascent', action: 'duck', scene: 'ruins', title: 'Mountain Ascent', holdTitle: 'Cliff Anchor', artifact: 'Summit token',
    instruction: 'Your prescribed leg motion guides the explorer through low passages and climbing gates on the mountain route.',
    holdInstruction: 'Hold the prescribed leg position to secure the climbing anchor before the next section opens.',
    chapters: ['Enter the lower pass', 'Climb above the fog', 'Reach the ridge'], worldEffect: 'advance the expedition toward the high beacon', movementRole: 'climb the mountain route',
  },
  Hamstrings: {
    id: 'living_bridge', action: 'light', scene: 'wilds', title: 'Living Bridge', holdTitle: 'Vine Bridge Hold', artifact: 'Living vine',
    instruction: 'Your prescribed leg motion guides living vines across damaged gaps in the old trail.',
    holdInstruction: 'Hold the prescribed position to keep the living bridge tensioned while it takes root.',
    chapters: ['Wake the vines', 'Span the ravine', 'Root the bridge'], worldEffect: 'grow a safe crossing through the valley', movementRole: 'guide the living bridge',
  },
  Knees: {
    id: 'ruins_runner', action: 'duck', scene: 'ruins', title: 'Ruins Runner', holdTitle: 'Gate Anchor', artifact: 'Sunstone',
    instruction: 'Your prescribed knee motion guides the explorer under old gates and through the ruined causeway. Do not change depth or speed for game rewards.',
    holdInstruction: 'Hold your prescribed knee position to keep the ancient gate open while the expedition passes.',
    chapters: ['The fallen gate', 'The lantern gallery', 'The sunstone chamber'], worldEffect: 'clear the ancient causeway', movementRole: 'guide the ruins runner',
  },
  'Calves & shins': {
    id: 'riverworks', action: 'light', scene: 'wilds', title: 'Riverworks', holdTitle: 'Waterwheel Hold', artifact: 'Water gear',
    instruction: 'Your prescribed lower-leg motion powers the old pumps that return water to the valley channels.',
    holdInstruction: 'Hold the prescribed position to keep the riverworks pressure stable while water reaches the next channel.',
    chapters: ['Prime the pumps', 'Fill the channels', 'Turn the waterwheel'], worldEffect: 'restore water to the valley', movementRole: 'power the riverworks',
  },
  'Ankles & feet': {
    id: 'stepping_stone_relay', action: 'light', scene: 'wilds', title: 'Stepping-Stone Relay', holdTitle: 'Stone Balance Hold', artifact: 'Riverstone',
    instruction: 'Your prescribed ankle or foot motion lights the next stepping stone and guides the signal safely across the water.',
    holdInstruction: 'Hold the prescribed position to stabilize the active stepping stone while the signal crosses.',
    chapters: ['Light the first stone', 'Cross the current', 'Reach the far bank'], worldEffect: 'carry the beacon signal across the river', movementRole: 'light the stepping-stone relay',
  },
  Balance: {
    id: 'bridge_keeper', action: 'light', scene: 'sky', title: 'Bridge Keeper', holdTitle: 'Bridge Keeper', artifact: 'Balance crystal',
    instruction: 'Your prescribed balance movement steadies the suspended bridge and keeps the beacon caravan on course.',
    holdInstruction: 'Hold your prescribed balance position to keep the suspended bridge level. Game feedback never changes the therapist-set hold.',
    chapters: ['Steady the first span', 'Cross the wind gap', 'Secure the far tower'], worldEffect: 'stabilize the high bridge to the next beacon', movementRole: 'steady the suspended bridge',
  },
});

const SPECIAL = Object.freeze({
  bodyweight_squat: { action: 'duck', scene: 'ruins', id: 'ruins_runner', title: 'Escape Through the Ruins', artifact: 'Sunstone', instruction: 'Lower to duck under the beams. Stand to rise. Your first prescribed rep is the tutorial.', chapters: ['The fallen gate', 'The lantern gallery', 'The sunstone chamber'], worldEffect: 'clear the ancient causeway', movementRole: 'guide the ruins runner' },
  push_up: { action: 'gravity', scene: 'gravity', id: 'gravity_runner', title: 'Gravity Runner', artifact: 'Gravity core', instruction: 'Lower your push-up to descend. Press up to rise through the gravity gates.', chapters: ['Wake the engine', 'The star conduit', 'The citadel approach'], worldEffect: 'power the gravity conduit', movementRole: 'guide the gravity runner' },
  wall_push_up: { action: 'gravity', scene: 'gravity', id: 'gravity_runner', title: 'Gravity Runner', artifact: 'Gravity core', instruction: 'Bend toward the wall to descend. Press away to rise. Keep your prescribed wall setup.', chapters: ['Wake the engine', 'The star conduit', 'The citadel approach'], worldEffect: 'power the gravity conduit', movementRole: 'guide the gravity runner' },
  forward_lunge: { action: 'crossing', scene: 'wilds', id: 'verdant_crossing', title: 'Crossing the Verdant Wilds', artifact: 'Riverstone', instruction: 'Lower on your prescribed side to guide the explorer toward a stone. Return to complete the crossing.', chapters: ['The river crossing', 'The waterfall trail', 'The living bridge'], worldEffect: 'reopen the river crossing', movementRole: 'guide the explorer across the wilds' },
  standing_shoulder_abduction: { action: 'light', scene: 'sky', id: 'sky_guardian', title: 'Sky Guardian', artifact: 'Sky prism', instruction: 'Raise your prescribed arm to guide the lantern upward. Lower it to return. Restore the crystal beacons.', chapters: ['Light the first beacon', 'The cloud gardens', 'The waking citadel'], worldEffect: 'restore the crystal beacons', movementRole: 'guide the sky lantern' },
});

export function exerciseGameFamily(exerciseKey) {
  const exercise = exerciseCatalog[exerciseKey];
  if (!exercise) return null;
  const family = FAMILY_BY_CATEGORY[exercise.category] || FAMILY_BY_CATEGORY.Shoulders;
  const timedHold = exercise.trackingMode === 'timed_hold';
  const special = SPECIAL[exerciseKey];
  const base = special || family;
  return Object.freeze({
    ...base,
    family: base.id || family.id,
    exerciseKey,
    exerciseName: exercise.name,
    category: exercise.category,
    trackingMode: exercise.trackingMode,
    title: timedHold && !special ? family.holdTitle : base.title,
    instruction: timedHold && !special ? family.holdInstruction : base.instruction,
    worldEffect: base.worldEffect || family.worldEffect,
    movementRole: base.movementRole || family.movementRole,
    gameplay: base.id || family.id,
  });
}

export function exerciseGameFamilies() {
  return Object.keys(exerciseCatalog).map(exerciseGameFamily).filter(Boolean);
}

export const exerciseGameFamilyIds = Object.freeze([...new Set(Object.values(FAMILY_BY_CATEGORY).map(item => item.id))]);
