import { beaconStoryForSession, getBeaconStorySession } from './beacon-story.js';
import { exerciseGameFamily } from './exercise-game-families.js';

const CAMPAIGN_REGIONS = Object.freeze([
  { act: 'CHAPTER V · THE LOWLANDS', name: 'Lantern Fields', landmark: 'Field Relay', settlement: 'East Hamlet', next: 'Cedar Hollow' },
  { act: 'CHAPTER VI · THE DEEP WOODS', name: 'Cedar Hollow', landmark: 'Forest Bell', settlement: 'Starling Grove', next: 'Glasswater Reach' },
  { act: 'CHAPTER VII · THE RIVERWORKS', name: 'Glasswater Reach', landmark: 'Water Crown', settlement: 'Riverstone Quarter', next: 'Windward Steps' },
  { act: 'CHAPTER VIII · THE HIGH ROAD', name: 'Windward Steps', landmark: 'Cliff Relay', settlement: 'Pinewatch Ridge', next: 'Moonwell Road' },
  { act: 'CHAPTER IX · BELOW THE MOUNTAIN', name: 'Moonwell Road', landmark: 'Moonwell Lens', settlement: 'Amber Farm', next: 'Sunken Terrace' },
  { act: 'CHAPTER X · THE LOST TERRACES', name: 'Sunken Terrace', landmark: 'Terrace Engine', settlement: 'Dawn Market', next: 'Cloudbreak Pass' },
  { act: 'CHAPTER XI · THE STORMLINE', name: 'Cloudbreak Pass', landmark: 'Storm Relay', settlement: 'West Bell Tower', next: 'High Meadow' },
  { act: 'CHAPTER XII · THE HIGH COUNTRY', name: 'High Meadow', landmark: 'Meadow Beacon', settlement: 'North Orchard', next: 'Summit Gardens' },
  { act: 'CHAPTER XIII · THE SUMMIT GARDENS', name: 'Summit Gardens', landmark: 'Garden Spire', settlement: 'Foxglove Trail', next: 'Old Aqueduct' },
  { act: 'CHAPTER XIV · THE OLD AQUEDUCT', name: 'Old Aqueduct', landmark: 'Aqueduct Heart', settlement: 'Silver Crossing', next: 'Starfall Ridge' },
  { act: 'CHAPTER XV · STARFALL RIDGE', name: 'Starfall Ridge', landmark: 'Star Mirror', settlement: 'Glasswatch Camp', next: 'Crown Approach' },
  { act: 'CHAPTER XVI · THE CROWN APPROACH', name: 'Crown Approach', landmark: 'Crown Gate', settlement: 'Beacon Camp', next: 'Crown Beacon' },
]);

const REGION_STEPS = Object.freeze([
  {
    kind: 'path',
    title: region => `Enter ${region.name}`,
    briefing: region => `The lower valley is glowing again, but the signal disappears at the edge of ${region.name}. Movement Buddy has found a safe route forward.`,
    goal: region => `Complete today’s prescribed work to open the first route into ${region.name}.`,
    beats: region => [`The route into ${region.name} is hidden.`, 'The first trail markers begin to glow.', 'A clear path reaches the far ridge.', `${region.name} is open to the expedition.`],
    completion: region => `The expedition enters ${region.name} and discovers the dormant ${region.landmark}.`,
  },
  {
    kind: 'mill',
    title: region => `Restore the ${region.landmark}`,
    briefing: region => `The ${region.landmark} once powered every path and lantern in ${region.name}. Its mechanism still responds to controlled movement.`,
    goal: region => `Use today’s prescribed session to bring the ${region.landmark} back online.`,
    beats: region => [`The ${region.landmark} is silent.`, 'Its lower mechanisms begin to turn.', 'Power reaches the upper relay.', `The ${region.landmark} is running again.`],
    completion: region => `Power returns across ${region.name}. A distress light appears near ${region.settlement}.`,
  },
  {
    kind: 'gate',
    title: region => `Protect the Route to ${region.settlement}`,
    briefing: region => `Wind and debris are destabilizing the newly powered road. The route must be protected before anyone can cross safely.`,
    goal: region => `Complete the prescribed dose to strengthen the route toward ${region.settlement}.`,
    beats: region => ['The route is exposed and unstable.', 'The first ward points lock into place.', 'Only the far section remains vulnerable.', 'The route is protected.'],
    completion: region => `${region.settlement} can be reached safely. Its crossing is still broken.`,
  },
  {
    kind: 'bridge',
    title: region => `Reconnect ${region.settlement}`,
    briefing: region => `${region.settlement} has been isolated since the beacon network failed. One damaged crossing separates it from the restored road.`,
    goal: region => `Validated clinical work restores the crossing to ${region.settlement} piece by piece.`,
    beats: region => ['Only the foundations remain.', 'The crossing reaches the midpoint.', 'The final span begins locking into place.', `${region.settlement} is connected again.`],
    completion: region => `${region.settlement} rejoins the Beacon network and sends supplies toward the expedition.`,
  },
  {
    kind: 'signal',
    title: region => `Carry the Light Across ${region.name}`,
    briefing: region => `The roads are open, but the Beacon signal still fades before it reaches the far side of ${region.name}.`,
    goal: region => `Complete today’s prescribed work to carry a stable signal across the region.`,
    beats: region => ['The signal breaks just beyond the settlement.', 'A narrow beam reaches the middle relay.', 'The far relay begins answering.', `Light now crosses all of ${region.name}.`],
    completion: region => `The full region is connected. The dormant regional beacon can finally be awakened.`,
  },
  {
    kind: 'beacon',
    title: region => `Awaken the ${region.name} Beacon`,
    briefing: region => `Every restored system in ${region.name} now feeds one ancient beacon. Waking it will reveal the road beyond.`,
    goal: region => `Use the prescribed session to charge and stabilize the ${region.name} Beacon.`,
    beats: region => ['The regional beacon is dark.', 'Its lower ring begins to glow.', 'The signal climbs into the beacon crown.', `The ${region.name} Beacon is fully awake.`],
    completion: region => `A beam leaps toward ${region.next}. The next chapter of the journey is visible.`,
  },
  {
    kind: 'climb',
    title: region => `Open the Way to ${region.next}`,
    briefing: region => `The beacon has revealed the next route, but the old road ends at a sealed ascent. The expedition needs one final push through ${region.name}.`,
    goal: region => `Complete today’s prescribed work to open the road toward ${region.next}.`,
    beats: region => ['The ascent is sealed.', 'The lower passage opens.', 'The final gate releases.', `The road to ${region.next} is open.`],
    completion: region => `Movement Buddy marks ${region.next} on the map. The expedition moves forward.`,
  },
]);

function normalizedExerciseKeys(context = {}) {
  const keys = Array.isArray(context.exerciseKeys) ? context.exerciseKeys : context.exerciseKey ? [context.exerciseKey] : [];
  return [...new Set(keys.filter(Boolean))];
}

function addExerciseFlavor(story, context = {}) {
  const keys = normalizedExerciseKeys(context);
  const games = keys.map(exerciseGameFamily).filter(Boolean);
  if (!games.length) return Object.freeze({ ...story, gameFamily: null, gameTitle: 'Beacon Mission', exerciseKeys: [] });

  const primary = games[0];
  const multiple = games.length > 1;
  const flavor = multiple
    ? `Today’s ${games.length} prescribed exercises power different systems in this mission. Each exercise keeps its own movement-controlled game while contributing to the same story objective.`
    : `${primary.exerciseName} controls ${primary.title}: your movement will ${primary.movementRole} and help ${primary.worldEffect}.`;
  const clinicalReminder = 'Only Axion’s validated tracker advances clinical reps, holds, sets, and prescription completion.';
  const goal = multiple
    ? `${story.goal} Complete each prescribed exercise; game points and collisions never change the clinical dose.`
    : `${story.goal} Use your prescribed ${primary.exerciseName} while ${primary.movementRole}.`;

  return Object.freeze({
    ...story,
    briefing: `${story.briefing} ${flavor}`,
    goal,
    gameFamily: primary.family,
    gameTitle: primary.title,
    gameplay: primary.gameplay,
    movementRole: primary.movementRole,
    worldEffect: primary.worldEffect,
    exerciseName: primary.exerciseName,
    exerciseKeys: keys,
    clinicalReminder,
  });
}

function continuationStory(session, total) {
  const offset = session - 11;
  const regionIndex = Math.floor(offset / REGION_STEPS.length) % CAMPAIGN_REGIONS.length;
  const stepIndex = offset % REGION_STEPS.length;
  const region = CAMPAIGN_REGIONS[regionIndex];
  const step = REGION_STEPS[stepIndex];
  const worldProgress = total <= 1 ? 1 : Math.min(1, Math.max(0, (session - 1) / (total - 1)));
  return {
    act: region.act,
    kind: step.kind,
    title: step.title(region),
    briefing: step.briefing(region),
    goal: step.goal(region),
    beats: step.beats(region),
    completion: step.completion(region),
    sessionNumber: session,
    totalSessions: total,
    worldProgress,
    region: region.name,
    destination: region.next,
  };
}

export function campaignStoryForSession(sessionNumber = 1, totalSessions = 10, context = {}) {
  const session = Math.max(1, Math.floor(Number(sessionNumber) || 1));
  const total = Math.max(session, Math.floor(Number(totalSessions) || 10));

  if (total > 10 && session === total) {
    const finale = {
      act: 'FINAL CHAPTER · THE CROWN BEACON',
      kind: 'finale',
      title: 'Reach the Crown Beacon',
      briefing: 'Every restored road, settlement, relay, garden, bridge, and regional beacon now points to one final tower above the clouds. This is the destination the expedition has been building toward.',
      goal: 'Complete your prescribed session to reach and ignite the Crown Beacon. Your therapy dose does not change for the finale.',
      beats: ['The Crown Beacon is visible above the last ridge.', 'The restored network begins sending power uphill.', 'The crown chamber opens as every regional beacon answers.', 'The Crown Beacon ignites and the entire world responds.'],
      completion: 'The Crown Beacon shines across every region you restored. The recovery journey has changed the world from the valley floor to the summit.',
      sessionNumber: session,
      totalSessions: total,
      worldProgress: 1,
      region: 'Crown Beacon',
      destination: 'A new horizon',
    };
    return addExerciseFlavor(finale, context);
  }

  if (session <= 10) {
    const base = beaconStoryForSession(session, total);
    const adjusted = total > 10 && session === 10
      ? { ...base, title: 'Light the Lower Valley', completion: 'The lower valley shines again. Beyond the restored lights, a much larger network stretches toward the Crown Beacon.', beats: [...base.beats.slice(0, 3), 'The lower valley is restored, and the road beyond the mountains appears.'] }
      : base;
    return addExerciseFlavor(adjusted, context);
  }

  return addExerciseFlavor(continuationStory(session, total), context);
}

export function getActiveCampaignStory(exerciseKey = null) {
  const { sessionNumber, totalSessions } = getBeaconStorySession();
  return campaignStoryForSession(sessionNumber, totalSessions, { exerciseKey });
}

export const beaconCampaignRegions = CAMPAIGN_REGIONS;
