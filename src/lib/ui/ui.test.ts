import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWhen } from './format.ts';
import { anchoredScroll, clampZoom, maxZoom } from './zoom.ts';

test('formatWhen uses relative times for the last two days', () => {
  const now = Date.UTC(2026, 9, 14, 12);
  assert.equal(formatWhen(now - 20_000, now), 'just now');
  assert.equal(formatWhen(now - 5 * 60_000, now), '5 min ago');
  assert.equal(formatWhen(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(formatWhen(now - 30 * 3600_000, now), 'yesterday');
  assert.match(formatWhen(now - 10 * 86400_000, now), /\d/);
});

test('zoom limits: up to a 64 px cell, never below 1', () => {
  assert.equal(maxZoom(16), 4);
  assert.equal(maxZoom(80), 1);
  assert.equal(clampZoom(10, 32), 2);
  assert.equal(clampZoom(0.5, 32), 1);
});

test('anchoredScroll keeps the anchored content point still', () => {
  // Point 100 px into the view at scroll 50 is content x=150; doubled → 300.
  assert.equal(anchoredScroll(50, 100, 2), 200);
  assert.equal(anchoredScroll(0, 0, 3), 0);
  assert.equal(anchoredScroll(10, 100, 0.5), 0, 'never negative');
});
