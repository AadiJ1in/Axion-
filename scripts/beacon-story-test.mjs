import assert from 'node:assert/strict';
import { beaconStoryForSession, getBeaconStorySession, setBeaconStorySession } from '../src/beacon-story.js';

const first = beaconStoryForSession(1, 10);
assert.equal(first.title, 'Wake the First Beacon');
assert.equal(first.kind, 'beacon');
assert.equal(first.worldProgress, 0);

const finale = beaconStoryForSession(10, 10);
assert.equal(finale.title, 'Light the Whole Valley');
assert.equal(finale.kind, 'finale');
assert.equal(finale.worldProgress, 1);

const laterA = beaconStoryForSession(11, 84);
const laterB = beaconStoryForSession(12, 84);
assert.notEqual(laterA.title, laterB.title, 'continuation sessions should receive distinct missions');
assert.ok(laterA.beats.length === 4 && laterA.goal, 'missions include story beats and an exercise-linked objective');

assert.deepEqual(getBeaconStorySession(), { sessionNumber: 1, totalSessions: 10 }, 'Node tests use a safe default without browser storage');
assert.deepEqual(setBeaconStorySession(7, 84), { sessionNumber: 7, totalSessions: 84 }, 'story context is normalized even without browser storage');

console.log('Beacon of the Valley story arc checks passed.');
