import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { coldStart, predictWith, FEATURES, type FeatureRow } from '../src/services/demand.js';

const fixture = new URL('../../../ml/artifacts/demand_parity.json', import.meta.url);

test('TypeScript evaluator reproduces scikit-learn probabilities', { skip: !existsSync(fixture) && 'run ml/train_demand.py first' }, () => {
  const f = JSON.parse(readFileSync(fixture, 'utf8'));
  assert.deepEqual(f.features, [...FEATURES]);
  const model = { version: 't', format: f.format, payload: f.payload, features: f.features };
  let maxDiff = 0;
  f.X.forEach((x: number[], i: number) => {
    const row = Object.fromEntries(f.features.map((k: string, j: number) => [k, x[j]])) as unknown as FeatureRow;
    maxDiff = Math.max(maxDiff, Math.abs(predictWith(model as any, row) - f.expected[i]));
  });
  assert.ok(maxDiff < 1e-6, `max difference ${maxDiff}`);
});

test('cold-start rules rank a reported full bin above a fresh empty one', () => {
  const base = { household_id: 'h', zone_id: 'z', household_size: 4, days_since_pickup: 1, reports_since_pickup: 0, extra_requested: 0, dow: 2, is_weekend: 0,
    holiday_recent: 0, umuganda_recent: 0, last_fill: -1, avg_fill: -1, fill_rate: -1, expected_fill: -1, history_n: 0 } as FeatureRow;
  assert.ok(coldStart({ ...base, reports_since_pickup: 1, days_since_pickup: 5 }) > 0.5);
  assert.ok(coldStart(base) < 0.2);
});
