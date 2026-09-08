import assert from 'node:assert/strict';
import { exerciseCatalog } from '../src/exercise-catalog.js';
import { exerciseGameFamilies, exerciseGameFamily, exerciseGameFamilyIds } from '../src/exercise-game-families.js';
import { getAdventureDefinition } from '../src/adventure-definitions.js';

const keys = Object.keys(exerciseCatalog);
const games = exerciseGameFamilies();
assert.equal(games.length, keys.length, 'every catalog exercise must receive a movement game');
assert.ok(exerciseGameFamilyIds.length >= 12, 'the catalog should span many distinct game families instead of one fallback');

for (const key of keys) {
  const game = exerciseGameFamily(key);
  const adventure = getAdventureDefinition(key);
  assert.ok(game, `${key} has a game family`);
  assert.ok(game.title && game.instruction && game.gameplay, `${key} has playable presentation metadata`);
  assert.ok(game.worldEffect && game.movementRole, `${key} explains how movement changes the Beacon world`);
  assert.equal(adventure?.exerciseKey, key, `${key} opens its own mapped adventure`);
  assert.ok(['light','duck','gravity','crossing'].includes(adventure.action), `${key} uses a bounded entertainment input mapping`);
}

assert.equal(exerciseGameFamily('chin_tuck').title, 'Signal Alignment');
assert.equal(exerciseGameFamily('upper_trap_stretch').title, 'Hold the Signal');
assert.equal(exerciseGameFamily('bodyweight_squat').gameplay, 'ruins_runner');
assert.equal(exerciseGameFamily('push_up').gameplay, 'gravity_runner');
assert.notEqual(exerciseGameFamily('chin_tuck').gameplay, exerciseGameFamily('push_up').gameplay);
assert.equal(exerciseGameFamily('unknown_exercise'), null);

console.log(`Exercise game coverage passed: ${keys.length} exercises across ${exerciseGameFamilyIds.length} Beacon game families.`);
