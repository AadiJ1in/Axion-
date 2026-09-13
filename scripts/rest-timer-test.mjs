import assert from 'node:assert/strict';
import { normalizeRestSeconds, restDeadlineMs, restRemainingSeconds, restComplete } from '../src/rest-timer.js';

for (const seconds of [30, 45, 60, 90, 120]) {
  const start = 1_000_000;
  const deadline = restDeadlineMs(start, seconds);
  assert.equal(deadline, start + seconds * 1000, `${seconds}s rest keeps exact configured deadline`);
  assert.equal(restRemainingSeconds(deadline, start), seconds);
  assert.equal(restRemainingSeconds(deadline, start + 12_400), Math.max(0, seconds - 12), 'fractional elapsed time rounds remaining up so rest never finishes early');
  assert.equal(restRemainingSeconds(deadline, deadline - 1), 1, 'rest never completes one millisecond early');
  assert.equal(restRemainingSeconds(deadline, deadline), 0);
  assert.equal(restComplete(deadline, deadline), true);
  assert.equal(restRemainingSeconds(deadline, deadline + 60_000), 0, 'timer throttling or tab suspension cannot make remaining time negative');
}

assert.equal(normalizeRestSeconds('60'), 60);
assert.equal(normalizeRestSeconds(60.4), 60);
assert.equal(normalizeRestSeconds(60.6), 61);
assert.equal(normalizeRestSeconds(0), 0);
assert.equal(normalizeRestSeconds(-5), 0);
assert.equal(normalizeRestSeconds(Number.NaN), 0);
assert.equal(normalizeRestSeconds(99999), 600, 'corrupt values are bounded to ten minutes');
assert.equal(restDeadlineMs(Number.NaN, 60), null);
assert.equal(restDeadlineMs(1000, 0), null);

console.log('Therapist rest timing passed for 30/45/60/90/120s, throttled intervals, and invalid inputs.');
