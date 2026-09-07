const CORE_MISSIONS = Object.freeze([
  {
    act: 'CHAPTER I · THE FIRST LIGHT',
    kind: 'beacon',
    title: 'Wake the First Beacon',
    briefing: 'The valley has gone dark. Movement Buddy has found one ancient tower that still responds to motion.',
    goal: 'Complete your prescribed movement to send light back into the forgotten tower.',
    beats: [
      'The beacon is cold. Your first valid movements begin waking the old mechanism.',
      'Golden current climbs the tower. Windows below start flickering back to life.',
      'The beacon is nearly stable. One more stretch of controlled work can carry the signal across the valley.',
      'The first beacon is awake.'
    ],
    completion: 'The first beacon answers. Far across the valley, another tower flashes back.',
  },
  {
    act: 'CHAPTER I · THE FIRST LIGHT',
    kind: 'path',
    title: 'Clear the Broken Path',
    briefing: 'The new beacon reveals a road buried by fallen stone. The next settlement cannot be reached until the passage is reopened.',
    goal: 'Each validated movement clears another section of the road.',
    beats: [
      'Loose stone blocks the trail ahead.',
      'The center of the path is reopening and lantern posts are becoming visible.',
      'Only the last collapse remains between you and the village road.',
      'The broken path is open again.'
    ],
    completion: 'The road is clear. A river crossing appears beyond the ridge.',
  },
  {
    act: 'CHAPTER I · THE FIRST LIGHT',
    kind: 'bridge',
    title: 'Cross the Stone Bridge',
    briefing: 'Floodwater split the valley in two. The old bridge can be rebuilt one stable section at a time.',
    goal: 'Validated movements restore the bridge without changing your clinical dose.',
    beats: [
      'Only the bridge foundations remain above the water.',
      'New stone spans reach toward the far bank.',
      'The final gap is narrowing as the bridge locks into place.',
      'The river crossing is restored.'
    ],
    completion: 'The bridge holds. Movement Buddy points toward a silent mill upstream.',
  },
  {
    act: 'CHAPTER I · THE FIRST LIGHT',
    kind: 'mill',
    title: 'Restore the Mill',
    briefing: 'The village mill stopped when the valley lost power. Its wheel can turn again if the old drive core is stabilized.',
    goal: 'Use your prescribed reps or holds to bring the mill back online.',
    beats: [
      'The wheel is motionless and the mill is dark.',
      'The drive core begins turning the lower gears.',
      'The wheel is moving steadily and warm light returns inside.',
      'The mill is running again.'
    ],
    completion: 'Grain begins moving through the mill. The village now has power and supplies.',
  },
  {
    act: 'CHAPTER II · THE VALLEY AWAKENS',
    kind: 'village',
    title: 'Relight the Village',
    briefing: 'The mill has power, but most homes remain dark. The restored grid needs one final push through the village.',
    goal: 'Guide light from home to home through your prescribed session.',
    beats: [
      'Only a few windows glow near the mill.',
      'Lanterns begin lighting the main street.',
      'Nearly every home is connected again.',
      'The whole village is glowing.'
    ],
    completion: 'The village is alive again. Beyond it, an ancient forest gate begins to hum.',
  },
  {
    act: 'CHAPTER II · THE VALLEY AWAKENS',
    kind: 'gate',
    title: 'Open the Forest Gate',
    briefing: 'A sealed stone gate protects the old forest road. Its runes answer only to controlled movement.',
    goal: 'Complete the prescribed dose to awaken the gate safely.',
    beats: [
      'The gate is sealed and its markings are dark.',
      'The first runes illuminate around the arch.',
      'The gate is opening and the forest path is visible beyond it.',
      'The forest gate is open.'
    ],
    completion: 'The gate opens onto a river garden that has been dry for years.',
  },
  {
    act: 'CHAPTER II · THE VALLEY AWAKENS',
    kind: 'garden',
    title: 'Heal the River Garden',
    briefing: 'The forest stream once fed gardens across the valley. Water can flow again if the old channels are reactivated.',
    goal: 'Your session restores water, plants, and movement to the river garden.',
    beats: [
      'The riverbed is dry and the garden is still.',
      'Water begins returning to the lower channels.',
      'Plants rise along the banks as the current reaches the valley floor.',
      'The river garden is alive again.'
    ],
    completion: 'Water reaches the lower valley. A watchtower signal appears high above the trees.',
  },
  {
    act: 'CHAPTER III · THE ASCENT',
    kind: 'climb',
    title: 'Climb to the Watchtower',
    briefing: 'A storm is moving toward the valley. The old watchtower must be reached before the mountain route closes.',
    goal: 'Each validated movement advances the climb while the tracker controls rep credit.',
    beats: [
      'The lower stairs disappear into fog.',
      'You are above the tree line and the watchtower is in view.',
      'The storm is close, but only the final ascent remains.',
      'You reach the watchtower.'
    ],
    completion: 'From the tower, you can finally see the dormant mountain beacon.',
  },
  {
    act: 'CHAPTER III · THE ASCENT',
    kind: 'signal',
    title: 'Signal the Mountain Beacon',
    briefing: 'The mountain beacon can carry a signal farther than any tower below, but it needs a stable charge.',
    goal: 'Use your prescribed session to build and stabilize the long-range signal.',
    beats: [
      'The mountain beacon is dark beneath the storm.',
      'A narrow beam begins cutting through the clouds.',
      'The signal is almost strong enough to reach every restored tower.',
      'The mountain beacon is transmitting.'
    ],
    completion: 'Every restored beacon answers. The whole valley is ready for one final relight.',
  },
  {
    act: 'CHAPTER IV · A BRIGHTER VALLEY',
    kind: 'finale',
    title: 'Light the Whole Valley',
    briefing: 'Every road, bridge, home, garden, and beacon is connected. The final session can bring the entire valley back at once.',
    goal: 'Complete your prescribed session and finish the first restoration arc.',
    beats: [
      'The valley waits in the last moments before dawn.',
      'Light moves from the mountain beacon down through every restored landmark.',
      'The final dark regions begin glowing as the network synchronizes.',
      'The whole valley is restored.'
    ],
    completion: 'The valley shines from end to end. Your journey continues beyond the mountains.',
  },
]);

const PLACES = Object.freeze([
  'East Hamlet', 'Silver Crossing', 'Lantern Fields', 'Cedar Hollow', 'Windward Steps',
  'North Orchard', 'Glasswater Reach', 'Sunken Terrace', 'Pinewatch Ridge', 'Moonwell Road',
  'Amber Farm', 'Old Aqueduct', 'Cloudbreak Pass', 'Starling Grove', 'High Meadow',
  'Riverstone Quarter', 'West Bell Tower', 'Dawn Market', 'Foxglove Trail', 'Summit Gardens',
]);

const CONTINUATION_OBJECTIVES = Object.freeze([
  {
    kind: 'path',
    title: place => `Reopen ${place}`,
    briefing: place => `${place} was cut off when the valley network failed. Movement Buddy has found a route that can be restored.`,
    goal: place => `Complete your prescribed session to reopen ${place}.`,
    beats: place => [`The route into ${place} is blocked.`, `The first passage into ${place} is open.`, `${place} is almost reconnected.`, `${place} is connected again.`],
    completion: place => `${place} is back on the valley network.`,
  },
  {
    kind: 'beacon',
    title: place => `Rekindle ${place}`,
    briefing: place => `A dormant relay above ${place} can extend the restored network into a new region.`,
    goal: place => `Use your prescribed movement to rekindle the relay above ${place}.`,
    beats: place => [`The relay above ${place} is dark.`, `A weak signal begins to form.`, `The relay is nearly stable.`, `The relay over ${place} is fully lit.`],
    completion: place => `${place} now carries the valley signal.`,
  },
  {
    kind: 'bridge',
    title: place => `Reconnect ${place}`,
    briefing: place => `The route to ${place} ends at a damaged crossing. Rebuilding it will reconnect another part of the valley.`,
    goal: place => `Validated movements restore the crossing toward ${place}.`,
    beats: place => [`The crossing toward ${place} is incomplete.`, `The span is reaching the midpoint.`, `Only the final section remains.`, `${place} is reachable again.`],
    completion: place => `The crossing to ${place} is restored.`,
  },
  {
    kind: 'garden',
    title: place => `Revive ${place}`,
    briefing: place => `${place} has water again, but its landscape has not recovered. The old growth channels respond to controlled movement.`,
    goal: place => `Complete your session to bring life back to ${place}.`,
    beats: place => [`${place} is quiet and colorless.`, `Water and light begin returning.`, `Growth spreads across the restored ground.`, `${place} is alive again.`],
    completion: place => `${place} has returned to life.`,
  },
  {
    kind: 'signal',
    title: place => `Carry the Signal to ${place}`,
    briefing: place => `The restoration network can reach ${place}, but only if a stable signal is built and held.`,
    goal: place => `Use the prescribed dose to carry a stable signal to ${place}.`,
    beats: place => [`No signal reaches ${place} yet.`, `The first connection is holding.`, `The signal is nearly locked.`, `${place} receives the signal.`],
    completion: place => `${place} has joined the restored valley.`,
  },
]);

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export function beaconStoryForSession(sessionNumber = 1, totalSessions = 10) {
  const session = Math.max(1, Math.floor(Number(sessionNumber) || 1));
  const total = Math.max(session, Math.floor(Number(totalSessions) || 10));
  const worldProgress = total <= 1 ? 1 : clamp01((session - 1) / (total - 1));

  if (session <= CORE_MISSIONS.length) {
    const mission = CORE_MISSIONS[session - 1];
    return Object.freeze({ ...mission, sessionNumber: session, totalSessions: total, worldProgress });
  }

  const offset = session - CORE_MISSIONS.length - 1;
  const objective = CONTINUATION_OBJECTIVES[offset % CONTINUATION_OBJECTIVES.length];
  const place = PLACES[offset % PLACES.length];
  const phase = worldProgress < 0.45
    ? 'CHAPTER V · RECONNECTING THE VALLEY'
    : worldProgress < 0.7
      ? 'CHAPTER VI · BEYOND THE RIDGE'
      : worldProgress < 0.9
        ? 'CHAPTER VII · THE HIGH COUNTRY'
        : 'CHAPTER VIII · THE LAST HORIZON';

  return Object.freeze({
    act: phase,
    kind: objective.kind,
    title: objective.title(place),
    briefing: objective.briefing(place),
    goal: objective.goal(place),
    beats: objective.beats(place),
    completion: objective.completion(place),
    sessionNumber: session,
    totalSessions: total,
    worldProgress,
  });
}

export function setBeaconStorySession(sessionNumber, totalSessions) {
  const context = {
    sessionNumber: Math.max(1, Math.floor(Number(sessionNumber) || 1)),
    totalSessions: Math.max(1, Math.floor(Number(totalSessions) || 1)),
  };
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('axion.beacon.session', String(context.sessionNumber));
    sessionStorage.setItem('axion.beacon.totalSessions', String(context.totalSessions));
  }
  return context;
}

export function getBeaconStorySession() {
  if (typeof sessionStorage === 'undefined') return { sessionNumber: 1, totalSessions: 10 };
  return {
    sessionNumber: Math.max(1, Math.floor(Number(sessionStorage.getItem('axion.beacon.session')) || 1)),
    totalSessions: Math.max(1, Math.floor(Number(sessionStorage.getItem('axion.beacon.totalSessions')) || 10)),
  };
}

export function getActiveBeaconStory() {
  const context = getBeaconStorySession();
  return beaconStoryForSession(context.sessionNumber, context.totalSessions);
}
