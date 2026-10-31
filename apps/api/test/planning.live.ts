/** Live planner check: temporary zone with 25 houses in Remera, two crews, real OSRM roads. Cleans up after. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { admin } from '../src/lib/supabase.js';
import { planDay } from '../src/services/planner.js';

const tag = randomUUID().slice(0, 8);
const ids = { zone: '', trucks: [] as string[], crews: [] as string[], houses: [] as string[] };

async function main() {
  const { data: z } = await admin.from('zones').insert({ name: `PLAN zone ${tag}`, depot: 'SRID=4326;POINT(30.1044 -1.9536)' }).select().single().throwOnError();
  ids.zone = z!.id;
  for (const k of [1, 2]) {
    const { data: t } = await admin.from('trucks').insert({ plate: `PLAN-${k}-${tag}`, capacity_bins: 10, zone_id: z!.id }).select().single().throwOnError();
    ids.trucks.push(t!.id);
    const { data: c } = await admin.from('crews').insert({ name: `PLAN crew ${k} ${tag}`, zone_id: z!.id, truck_id: t!.id }).select().single().throwOnError();
    ids.crews.push(c!.id);
  }
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rows = Array.from({ length: 25 }, (_, i) => ({
    label: `PLAN house ${i} ${tag}`, zone_id: z!.id, size: 2 + Math.floor(rnd() * 6),
    location: `SRID=4326;POINT(${(30.1044 + (rnd() - 0.5) * 0.03).toFixed(6)} ${(-1.9536 + (rnd() - 0.5) * 0.03).toFixed(6)})`,
  }));
  const { data: hs } = await admin.from('households').insert(rows).select('id').throwOnError();
  ids.houses = hs!.map((h) => h.id);
  // 6 households report full bins
  await admin.from('bin_reports').insert(ids.houses.slice(0, 6).map((household_id) => ({ household_id }))).throwOnError();

  const t0 = Date.now();
  const [res] = await planDay('2099-02-01', { zoneId: z!.id });
  console.log(JSON.stringify(res, null, 2));
  console.log(`planned in ${Date.now() - t0} ms`);
  assert.ok(!res!.skipped, res!.skipped);
  assert.equal(res!.distance_source, 'osrm');
  assert.ok((res!.households_selected ?? 0) >= 6, 'reported households included');
  assert.ok((res!.distance_m ?? Infinity) < (res!.baseline_distance_m ?? 0), 'optimised < baseline');
  const { data: stops } = await admin.from('route_stops').select('household_id, reason, eta').in('route_id', res!.routes!.map((r) => r.route_id));
  assert.equal(stops!.filter((x) => x.reason === 'reported').length, 6);
  assert.ok(stops!.every((x) => x.eta));
  console.log('PLANNING PASSED');
}

async function cleanup() {
  await admin.from('plan_runs').delete().eq('zone_id', ids.zone);
  await admin.from('routes').delete().in('crew_id', ids.crews);
  await admin.from('households').delete().in('id', ids.houses);
  await admin.from('crews').delete().in('id', ids.crews);
  await admin.from('trucks').delete().in('id', ids.trucks);
  await admin.from('zones').delete().eq('id', ids.zone);
  console.log('cleanup done');
}
main().catch((e) => { console.error('PLANNING FAILED', e); process.exitCode = 1; }).finally(cleanup);
