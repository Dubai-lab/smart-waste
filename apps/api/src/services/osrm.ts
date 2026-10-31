import { haversine, type LatLng } from '@sw/shared';
import { env } from '../lib/env.js';

export interface Matrix {
  distance: number[][]; // metres
  duration: number[][]; // seconds
  source: 'osrm' | 'estimate';
}

const BLOCK = 50; // the public OSRM server accepts ~100 coordinates per table request

const fmt = (p: LatLng) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

async function osrmGet(path: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${env.OSRM_URL}${path}`, { signal: ctrl.signal, headers: { 'User-Agent': 'smart-waste-fyp/1.0' } });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const body = (await res.json()) as any;
    if (body.code !== 'Ok') throw new Error(`OSRM ${body.code}: ${body.message ?? ''}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Road distance/duration matrix (driving). Falls back to a straight-line estimate if OSRM is unreachable. */
export async function roadMatrix(points: LatLng[]): Promise<Matrix> {
  const n = points.length;
  const distance = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const duration = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  try {
    for (let a = 0; a < n; a += BLOCK) {
      for (let b = 0; b < n; b += BLOCK) {
        const srcIdx = range(a, Math.min(a + BLOCK, n));
        const dstIdx = range(b, Math.min(b + BLOCK, n));
        const union = a === b ? srcIdx : [...srcIdx, ...dstIdx];
        const coords = union.map((i) => fmt(points[i]!)).join(';');
        const sources = srcIdx.map((_, k) => k).join(';');
        const destinations = (a === b ? dstIdx.map((_, k) => k) : dstIdx.map((_, k) => srcIdx.length + k)).join(';');
        const body = await osrmGet(
          `/table/v1/driving/${coords}?annotations=distance,duration&sources=${sources}&destinations=${destinations}`,
        );
        srcIdx.forEach((i, si) =>
          dstIdx.forEach((j, dj) => {
            distance[i]![j] = body.distances[si][dj] ?? estimateDistance(points[i]!, points[j]!);
            duration[i]![j] = body.durations[si][dj] ?? estimateDuration(points[i]!, points[j]!);
          }),
        );
      }
    }
    return { distance, duration, source: 'osrm' };
  } catch (err) {
    console.warn('OSRM unavailable, using straight-line estimate:', (err as Error).message);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        distance[i]![j] = estimateDistance(points[i]!, points[j]!);
        duration[i]![j] = estimateDuration(points[i]!, points[j]!);
      }
    return { distance, duration, source: 'estimate' };
  }
}

/** GeoJSON LineString following the roads through the given points in order. */
export async function roadGeometry(points: LatLng[]): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null> {
  if (points.length < 2) return null;
  const coordinates: [number, number][] = [];
  try {
    for (let i = 0; i < points.length - 1; i += 79) {
      const chunk = points.slice(i, i + 80);
      const body = await osrmGet(`/route/v1/driving/${chunk.map(fmt).join(';')}?overview=full&geometries=geojson`);
      coordinates.push(...(body.routes[0].geometry.coordinates as [number, number][]));
    }
    return { type: 'LineString', coordinates };
  } catch {
    return { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) };
  }
}

const DETOUR = 1.35; // typical road/straight-line ratio in Kigali's hilly street grid
const SPEED_MPS = 20 / 3.6;
const estimateDistance = (a: LatLng, b: LatLng) => haversine(a, b) * DETOUR;
const estimateDuration = (a: LatLng, b: LatLng) => estimateDistance(a, b) / SPEED_MPS;
const range = (s: number, e: number) => Array.from({ length: e - s }, (_, k) => s + k);
