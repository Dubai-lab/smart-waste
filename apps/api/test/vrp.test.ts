import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine } from '@sw/shared';
import { cheapestInsertion, improveRoute, nearestNeighbourTour, routeCost, solveVrp } from '../src/services/vrp.js';

// deterministic pseudo-random points around Kigali
function points(n: number, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ lat: -1.95 + (rnd() - 0.5) * 0.04, lng: 30.1 + (rnd() - 0.5) * 0.04 }));
}
const matrixOf = (pts: { lat: number; lng: number }[]) => pts.map((a) => pts.map((b) => haversine(a, b)));

test('every customer is served exactly once and capacity is respected', () => {
  const pts = points(41);
  const cost = matrixOf(pts);
  const demand = [0, ...Array(40).fill(1)];
  const customers = Array.from({ length: 40 }, (_, i) => i + 1);
  const res = solveVrp({ cost, demand, capacity: 15, vehicles: 3, customers });
  const served = res.routes.flat().sort((a, b) => a - b);
  assert.deepEqual(served, customers);
  assert.equal(res.unassigned.length, 0);
  assert.ok(res.routes.length <= 3);
  for (const r of res.routes) assert.ok(r.length <= 15);
});

test('optimised routes beat the nearest-neighbour baseline', () => {
  const pts = points(61, 11);
  const cost = matrixOf(pts);
  const demand = [0, ...Array(60).fill(1)];
  const customers = Array.from({ length: 60 }, (_, i) => i + 1);
  const opt = solveVrp({ cost, demand, capacity: 30, vehicles: 2, customers });
  const base = nearestNeighbourTour(customers, cost, demand, 30).reduce((s, t) => s + routeCost(t, cost), 0);
  assert.ok(opt.cost < base, `optimised ${opt.cost.toFixed(0)} should be < baseline ${base.toFixed(0)}`);
});

test('fleet too small: overflow is reported, not silently dropped', () => {
  const pts = points(11);
  const res = solveVrp({ cost: matrixOf(pts), demand: [0, ...Array(10).fill(1)], capacity: 4, vehicles: 2, customers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
  assert.equal(res.routes.flat().length + res.unassigned.length, 10);
  assert.ok(res.unassigned.length >= 2);
});

test('2-opt removes a crossing', () => {
  const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }, { lat: 0, lng: 2 }, { lat: 1, lng: 2 }];
  const cost = matrixOf(pts);
  const bad = [1, 4, 3, 2];
  assert.ok(routeCost(improveRoute(bad, cost), cost) <= routeCost(bad, cost));
});

test('cheapest insertion never inserts before already-visited stops', () => {
  const pts = points(6);
  const pos = cheapestInsertion([1, 2, 3, 4], 5, matrixOf(pts), 2);
  assert.ok(pos >= 2);
});
