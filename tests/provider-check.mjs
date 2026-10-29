import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFor} from '../dist/city-providers.js';
import {localDate,localTime,localTimestamp,serviceDay} from '../dist/schedule.js';

test('city providers keep feed URLs and capabilities separate', () => {
  const skopje=providerFor('skopje'), boston=providerFor('boston');
  assert.equal(skopje.timezone,'Europe/Skopje');
  assert.equal(boston.timezone,'America/New_York');
  assert.notEqual(skopje.gtfsUrl,boston.gtfsUrl);
  assert.equal(providerFor('unknown').id,'skopje');
});

test('shared schedule helpers resolve each agency timezone and DST', () => {
  const instant=localTimestamp('2026-10-29','08:00','America/New_York');
  assert.equal(localDate(instant,'America/New_York'),'2026-10-29');
  assert.equal(localTime(instant,'America/New_York'),'08:00');
  assert.equal(serviceDay(0,instant,'America/New_York').timezone,'America/New_York');
  assert.equal(localTime(localTimestamp('2026-07-01','08:00','America/New_York'),'America/New_York'),'08:00');
});
