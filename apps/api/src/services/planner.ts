import { CO2_KG_PER_L_DIESEL, type LatLng, type RoutePlanSummary } from '@sw/shared';
import { admin } from '../lib/supabase.js';
import { HttpError } from '../lib/http.js';
import { predictDemand, type FeatureRow } from './demand.js';
import { roadGeometry, roadMatrix } from './osrm.js';
import { cheapestInsertion, nearestNeighbourTour, routeCost, solveVrp } from './vrp.js';

async function setting(key: string, fallback: number | string) {
  const { data } = await admin.from('settings').select('value').eq('key', key).maybeSingle();
  return (data?.value ?? fallback) as number | string;
}

function etaFor(date: string, startHHMM: string, offsetSeconds: number) {
  const [h, m] = startHHMM.split(':').map(Number);
  const startUtc = Date.parse(`${date}T00:00:00+02:00`) + ((h ?? 7) * 3600 + (m ?? 0) * 60) * 1000;
  return new Date(startUtc + offsetSeconds * 1000).toISOString();
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export interface ZonePlan {
  zone_id: string;
  zone: string;
  skipped?: string;
  model_version?: string;
  households_total?: number;
  households_selected?: number;
  unassigned?: number;
  unassigned_households?: string[];
  distance_source?: string;
  routes?: RoutePlanSummary[];
  baseline_distance_m?: number;
  distance_m?: number;
}

/** Predict demand and build optimised routes for every crew, for one day. Re-planning replaces routes that are still "planned". */
export async function planDay(date: string, opts: { zoneId?: string; threshold?: number; userId?: string } = {}): Promise<ZonePlan[]> {
  const threshold = opts.threshold ?? Number(await setting('prediction_threshold', 0.5));
  const maxDays = Number(await setting('max_days_without_pickup', 14));
  const serviceS = Number(await setting('service_seconds_per_stop', 90));
  const start = String(await setting('route_start_time', '07:00'));

  let zq = admin.from('zones_geo').select('*');
  if (opts.zoneId) zq = zq.eq('id', opts.zoneId);
  const { data: zones, error: zErr } = await zq;
  if (zErr) throw zErr;

  const { data: features, error: fErr } = await admin.rpc('demand_features', { p_date: date });
  if (fErr) throw fErr;
  const { version, predictions } = await predictDemand(features as FeatureRow[]);
  const probOf = new Map(predictions.map((p) => [p.household_id, p.probability]));
  const featOf = new Map((features as FeatureRow[]).map((f) => [f.household_id, f]));

  // store predictions (evidence for accuracy evaluation later)
  if (predictions.length) {
    const { error } = await admin.from('demand_predictions').upsert(
      predictions.map((p) => ({ household_id: p.household_id, for_date: date, probability: p.probability,
                                needs_pickup: p.probability >= threshold, model_version: version })),
    );
    if (error) throw error;
  }

  const results: ZonePlan[] = [];
  for (const zone of zones ?? []) {
    const result: ZonePlan = { zone_id: zone.id, zone: zone.name };
    results.push(result);
    if (zone.depot_lat == null) { result.skipped = 'Zone has no depot location'; continue; }

    const { data: crews } = await admin.from('crews').select('id, name, truck_id, trucks(capacity_bins, fuel_l_per_100km)')
      .eq('zone_id', zone.id).eq('active', true).not('truck_id', 'is', null).order('name');
    if (!crews?.length) { result.skipped = 'No active crew with a truck in this zone'; continue; }

    const { data: houses } = await admin.from('households_geo').select('id, lat, lng').eq('zone_id', zone.id).eq('active', true);
    if (!houses?.length) { result.skipped = 'No households in this zone'; continue; }

    // which households need a pickup today
    const reported = new Set<string>();
    const selected = houses.filter((h) => {
      const f = featOf.get(h.id);
      if (f && (f.reports_since_pickup > 0 || f.extra_requested > 0)) { reported.add(h.id); return true; }
      if (f && f.days_since_pickup >= maxDays) return true;
      return (probOf.get(h.id) ?? 0) >= threshold;
    });

    const points: LatLng[] = [{ lat: zone.depot_lat, lng: zone.depot_lng }, ...houses.map((h) => ({ lat: h.lat, lng: h.lng }))];
    const matrix = await roadMatrix(points);
    const idxOf = new Map(houses.map((h, i) => [h.id, i + 1]));
    const demand = [0, ...houses.map(() => 1)];
    const capacity = Math.min(...crews.map((c: any) => c.trucks?.capacity_bins ?? 80));
    const fuelPer100 = sum(crews.map((c: any) => Number(c.trucks?.fuel_l_per_100km ?? 30))) / crews.length;

    // replace still-unstarted routes; crews that already started keep their route
    await admin.from('routes').delete().eq('route_date', date).in('crew_id', crews.map((c) => c.id)).eq('status', 'planned');
    const { data: started } = await admin.from('routes').select('crew_id').eq('route_date', date).in('crew_id', crews.map((c) => c.id));
    const busy = new Set((started ?? []).map((r) => r.crew_id));
    const freeCrews = crews.filter((c) => !busy.has(c.id));
    if (!freeCrews.length) { result.skipped = 'All crews in this zone have already started today'; continue; }

    // more demand than the fleet can carry: keep reported > overdue > most likely, defer the rest
    const priority = (id: string) =>
      reported.has(id) ? 3 : (featOf.get(id)?.days_since_pickup ?? 0) >= maxDays ? 2 : probOf.get(id) ?? 0;
    const ranked = [...selected].sort((a, b) => priority(b.id) - priority(a.id));
    const fleetCapacity = capacity * freeCrews.length;
    const served = ranked.slice(0, fleetCapacity);
    const deferred = ranked.slice(fleetCapacity);

    const vrp = solveVrp({ cost: matrix.distance, demand, capacity, vehicles: freeCrews.length,
                           customers: served.map((h) => idxOf.get(h.id)!) });
    vrp.unassigned.push(...deferred.map((h) => idxOf.get(h.id)!));

    // baseline: fixed route visiting every household in habitual nearest-neighbour order
    const baseTours = nearestNeighbourTour(houses.map((h) => idxOf.get(h.id)!), matrix.distance, demand, capacity);
    const baseDist = sum(baseTours.map((t) => routeCost(t, matrix.distance)));
    const baseDur = sum(baseTours.map((t) => routeCost(t, matrix.duration))) + houses.length * serviceS;

    const summaries: RoutePlanSummary[] = [];
    for (let r = 0; r < vrp.routes.length; r++) {
      const crew = freeCrews[r]!;
      const seq = vrp.routes[r]!;
      const dist = routeCost(seq, matrix.distance);
      const dur = routeCost(seq, matrix.duration) + seq.length * serviceS;
      const geometry = await roadGeometry([points[0]!, ...seq.map((i) => points[i]!), points[0]!]);
      const { data: route, error } = await admin.from('routes').insert({
        route_date: date, zone_id: zone.id, crew_id: crew.id, truck_id: crew.truck_id, status: 'planned',
        distance_m: Math.round(dist), duration_s: Math.round(dur), geometry,
      }).select('id').single();
      if (error) throw error;

      let t = 0;
      let prev = 0;
      const stops = seq.map((node, k) => {
        t += matrix.duration[prev]![node]!;
        const eta = etaFor(date, start, t);
        t += serviceS;
        prev = node;
        const hid = houses[node - 1]!.id;
        return { route_id: route.id, household_id: hid, seq: k + 1, eta, probability: probOf.get(hid) ?? null,
                 reason: reported.has(hid) ? 'reported' : (featOf.get(hid)?.days_since_pickup ?? 0) >= maxDays ? 'scheduled' : 'predicted' };
      });
      if (stops.length) {
        const { error: sErr } = await admin.from('route_stops').insert(stops);
        if (sErr) throw sErr;
      }
      const share = sum(vrp.routes.map((x) => x.length)) ? seq.length / sum(vrp.routes.map((x) => x.length)) : 0;
      const savedM = baseDist * share - dist;
      const savedFuel = (savedM / 1000) * (fuelPer100 / 100);
      summaries.push({
        route_id: route.id, crew_id: crew.id, stops: seq.length, distance_m: Math.round(dist), duration_s: Math.round(dur),
        baseline_distance_m: Math.round(baseDist * share), baseline_duration_s: Math.round(baseDur * share),
        saved_distance_m: Math.round(savedM), saved_fuel_l: +savedFuel.toFixed(2), saved_co2_kg: +(savedFuel * CO2_KG_PER_L_DIESEL).toFixed(2),
      });
      await admin.from('routes').update({ baseline_distance_m: Math.round(baseDist * share), baseline_duration_s: Math.round(baseDur * share) }).eq('id', route.id);
    }

    // reports included in a route are now "scheduled"
    const routed = new Set(vrp.routes.flat().map((i) => houses[i - 1]!.id));
    const scheduled = [...reported].filter((id) => routed.has(id));
    if (scheduled.length) await admin.from('bin_reports').update({ status: 'scheduled' }).in('household_id', scheduled).eq('status', 'open');

    const totalDist = sum(summaries.map((s) => s.distance_m));
    const totalDur = sum(summaries.map((s) => s.duration_s));
    const fuelSaved = Math.max(0, ((baseDist - totalDist) / 1000) * (fuelPer100 / 100));
    await admin.from('plan_runs').insert({
      run_date: date, zone_id: zone.id, model_version: version, distance_source: matrix.source,
      households_total: houses.length, households_selected: selected.length, households_reported: reported.size,
      unassigned: vrp.unassigned.length, routes: summaries.length, distance_m: totalDist, duration_s: totalDur,
      baseline_distance_m: Math.round(baseDist), baseline_duration_s: Math.round(baseDur),
      fuel_saved_l: +fuelSaved.toFixed(2), co2_saved_kg: +(fuelSaved * CO2_KG_PER_L_DIESEL).toFixed(2), created_by: opts.userId ?? null,
    });

    Object.assign(result, {
      model_version: version, households_total: houses.length, households_selected: selected.length,
      unassigned: vrp.unassigned.length, unassigned_households: vrp.unassigned.map((i) => houses[i - 1]!.id),
      distance_source: matrix.source, routes: summaries,
      baseline_distance_m: Math.round(baseDist), distance_m: totalDist,
    });
  }
  return results;
}

/** Add an urgent household to a route that is already planned or running, at the cheapest position. */
export async function addUrgentStop(routeId: string, householdId: string) {
  const { data: route } = await admin.from('routes').select('id, route_date, status, zone_id').eq('id', routeId).single();
  if (!route) throw new HttpError(404, 'Route not found');
  if (route.status === 'completed') throw new HttpError(409, 'Route is already completed');
  const { data: zone } = await admin.from('zones_geo').select('depot_lat, depot_lng').eq('id', route.zone_id).single();
  const { data: stops } = await admin.from('route_stops').select('id, household_id, seq, status').eq('route_id', routeId).order('seq');
  if (stops?.some((s) => s.household_id === householdId)) throw new HttpError(409, 'Household is already on this route');
  const ids = [...(stops ?? []).map((s) => s.household_id), householdId];
  const { data: houses } = await admin.from('households_geo').select('id, lat, lng').in('id', ids);
  const pos = new Map((houses ?? []).map((h) => [h.id, { lat: h.lat, lng: h.lng }]));
  if (!pos.has(householdId)) throw new HttpError(404, 'Household not found');

  const points: LatLng[] = [{ lat: zone!.depot_lat, lng: zone!.depot_lng }, ...ids.map((id) => pos.get(id)!)];
  const matrix = await roadMatrix(points);
  const order = (stops ?? []).map((_, k) => k + 1);
  const firstPending = Math.max(0, (stops ?? []).findIndex((s) => s.status === 'pending'));
  const insertAt = cheapestInsertion(order, ids.length, matrix.distance, firstPending === -1 ? order.length : firstPending);
  order.splice(insertAt, 0, ids.length);

  const serviceS = Number(await setting('service_seconds_per_stop', 90));
  const start = String(await setting('route_start_time', '07:00'));
  // shift seqs to make room, then insert
  for (const s of [...(stops ?? [])].reverse()) {
    if (s.seq > insertAt) await admin.from('route_stops').update({ seq: s.seq + 1 }).eq('id', s.id);
  }
  let t = 0;
  let prev = 0;
  for (const node of order.slice(0, insertAt + 1)) { t += matrix.duration[prev]![node]! + serviceS; prev = node; }
  const { error } = await admin.from('route_stops').insert({
    route_id: routeId, household_id: householdId, seq: insertAt + 1, reason: 'urgent',
    eta: etaFor(route.route_date, start, t - serviceS),
  });
  if (error) throw error;
  const geometry = await roadGeometry([points[0]!, ...order.map((i) => points[i]!), points[0]!]);
  await admin.from('routes').update({
    distance_m: Math.round(routeCost(order, matrix.distance)),
    duration_s: Math.round(routeCost(order, matrix.duration) + order.length * serviceS), geometry,
  }).eq('id', routeId);
  return { position: insertAt + 1, stops: order.length };
}
