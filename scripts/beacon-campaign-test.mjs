import assert from 'node:assert/strict';
import { campaignStoryForSession, beaconCampaignRegions } from '../src/beacon-campaign.js';

const first = campaignStoryForSession(1, 84, { exerciseKey: 'bodyweight_squat' });
assert.equal(first.title, 'Wake the First Beacon');
assert.equal(first.gameTitle, 'Escape Through the Ruins');
assert.equal(first.exerciseName, 'Bodyweight Squat');

const lowerValley = campaignStoryForSession(10, 84, { exerciseKey: 'standing_shoulder_abduction' });
assert.equal(lowerValley.title, 'Light the Lower Valley', 'long plans should not falsely end the campaign on day 10');
assert.equal(lowerValley.gameTitle, 'Sky Guardian');

const regionStart = campaignStoryForSession(11, 84, { exerciseKey: 'chin_tuck' });
const regionNext = campaignStoryForSession(12, 84, { exerciseKey: 'chin_tuck' });
assert.equal(regionStart.title, 'Enter Lantern Fields');
assert.equal(regionNext.title, 'Restore the Field Relay');
assert.notEqual(regionStart.title, regionNext.title, 'each day advances a concrete story mission');
assert.equal(regionStart.gameTitle, 'Signal Alignment');

const sameMissionDifferentExercise = campaignStoryForSession(18, 84, { exerciseKey: 'push_up' });
const sameMissionShoulder = campaignStoryForSession(18, 84, { exerciseKey: 'wall_crawl' });
assert.equal(sameMissionDifferentExercise.title, sameMissionShoulder.title, 'the roadmap day has one shared story mission');
assert.notEqual(sameMissionDifferentExercise.gameTitle, sameMissionShoulder.gameTitle, 'each exercise can control a different game inside the shared mission');

const mixed = campaignStoryForSession(25, 84, { exerciseKeys: ['chin_tuck', 'push_up', 'heel_raise'] });
assert.equal(mixed.exerciseKeys.length, 3);
assert.ok(mixed.briefing.includes('3 prescribed exercises'));

const finale = campaignStoryForSession(84, 84, { exerciseKey: 'bodyweight_squat' });
assert.equal(finale.title, 'Reach the Crown Beacon');
assert.equal(finale.worldProgress, 1);
assert.ok(finale.completion.includes('Crown Beacon'));
assert.ok(beaconCampaignRegions.length >= 10, 'the extended campaign should contain many named regions');

console.log('Long-form Beacon campaign, exercise flavor, multi-exercise nodes, and Crown Beacon finale passed.');
