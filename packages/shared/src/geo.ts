export interface LatLng { lat: number; lng: number }

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Parse a PostGIS geography returned by PostgREST as GeoJSON or EWKB hex is not supported; we always select lat/lng. */
export const KIGALI_CENTER: LatLng = { lat: -1.9441, lng: 30.0619 };

/** Litres of diesel → kg CO2 (IPCC default for diesel ≈ 2.68 kg/L). */
export const CO2_KG_PER_L_DIESEL = 2.68;
