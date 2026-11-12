import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillPercent } from '../src/services/fill.js';

test('fill % runs from 0 at the empty distance to 100 at the full line', () => {
  assert.equal(fillPercent(60, 60, 25), 0);
  assert.equal(fillPercent(25, 60, 25), 100);
  assert.equal(fillPercent(42.5, 60, 25), 50);
});

test('fill % is clamped outside the calibrated range', () => {
  assert.equal(fillPercent(80, 60, 25), 0);    // reading past the bottom (echo off the floor)
  assert.equal(fillPercent(20, 60, 25), 100);  // waste inside the blind zone
});
