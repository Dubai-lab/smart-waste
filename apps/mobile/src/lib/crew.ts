import { useQuery } from '@tanstack/react-query';
import { supabase, q } from './supabase';
import { cacheGet, cacheSet } from './outbox';
import { kigaliToday } from './format';

export interface CrewStop { id: string; seq: number; status: string; eta: string | null; reason: string; household_id: string; label: string; address: string | null; lat: number; lng: number }
export interface CrewRoute { id: string; status: string; truck_id: string | null; plate: string | null; crew: string; distance_m: number | null; geometry: { coordinates: [number, number][] } | null; stops: CrewStop[] }
export interface CrewData { crew: { id: string; name: string; truck_id: string | null } | null; route: CrewRoute | null; offline?: boolean; savedAt?: string }

/** Today's route for the signed-in crew member; falls back to the copy saved on the phone when offline. */
export function useCrewRoute(userId: string | undefined) {
  return useQuery({
    queryKey: ['crew-route', userId, kigaliToday()],
    enabled: !!userId,
    networkMode: 'always',
    queryFn: async (): Promise<CrewData> => {
      const key = `route-${kigaliToday()}`;
      try {
        const m = await q(supabase.from('crew_members').select('crew_id, crews(id, name, truck_id)').eq('profile_id', userId!).limit(1).maybeSingle()) as any;
        const crew = m?.crews ?? null;
        if (!crew) return { crew: null, route: null };
        const r = await q(supabase.from('routes').select('id, status, truck_id, distance_m, geometry, trucks(plate), route_stops(id, seq, status, eta, reason, household_id)')
          .eq('crew_id', crew.id).eq('route_date', kigaliToday()).maybeSingle()) as any;
        let route: CrewRoute | null = null;
        if (r) {
          const ids = r.route_stops.map((s: any) => s.household_id);
          const houses = ids.length ? await q(supabase.from('households_geo').select('id, label, address, lat, lng').in('id', ids)) as any[] : [];
          const byId = new Map(houses.map((h) => [h.id, h]));
          route = {
            id: r.id, status: r.status, truck_id: r.truck_id, plate: r.trucks?.plate ?? null, crew: crew.name, distance_m: r.distance_m, geometry: r.geometry,
            stops: r.route_stops.map((s: any) => ({ ...s, label: byId.get(s.household_id)?.label ?? '?', address: byId.get(s.household_id)?.address ?? null, lat: byId.get(s.household_id)?.lat, lng: byId.get(s.household_id)?.lng }))
              .sort((a: CrewStop, b: CrewStop) => a.seq - b.seq),
          };
        }
        const data = { crew, route };
        await cacheSet(key, data);
        return data;
      } catch (e) {
        const cached = await cacheGet<CrewData>(key);
        if (cached) return { ...cached.value, offline: true, savedAt: cached.saved_at };
        throw e;
      }
    },
  });
}

export function householdIdFromQr(qr: string): string | null {
  const p = qr.split('.');
  return p.length === 4 && p[0] === 'SW1' ? p[1]! : null;
}
