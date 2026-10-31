import * as Location from 'expo-location';
import { supabase } from './supabase';

/** Shares the crew phone's GPS as the truck position while a route is in progress (foreground only). */
let sub: Location.LocationSubscription | null = null;
let lastSent = 0;

export async function startTracking(truckId: string, routeId: string) {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error('Location permission is needed to share the truck position');
  stopTracking();
  sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 },
    async (pos) => {
      if (Date.now() - lastSent < 15_000) return;
      lastSent = Date.now();
      await supabase.from('truck_locations').upsert({
        truck_id: truckId, route_id: routeId, lat: pos.coords.latitude, lng: pos.coords.longitude,
        heading: pos.coords.heading, speed_mps: pos.coords.speed, reported_by: (await supabase.auth.getUser()).data.user?.id,
      }).then(({ error }) => { if (error) console.warn('position not sent', error.message); });
    },
  );
}

export function stopTracking() {
  sub?.remove();
  sub = null;
}

export const isTracking = () => sub != null;
