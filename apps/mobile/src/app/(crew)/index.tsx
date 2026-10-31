import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, Flag, Play, ScanLine } from 'lucide-react-native';
import { supabase, q } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useCrewRoute } from '../../lib/crew';
import { outboxRows } from '../../lib/outbox';
import { isTracking, startTracking, stopTracking } from '../../lib/tracking';
import { useRealtimeInvalidate } from '../../lib/useRealtime';
import { time } from '../../lib/format';
import { LeafletMap } from '../../components/LeafletMap';
import { Badge, Button, Card, EmptyState, QueryState, Row, Screen, Text } from '../../components/ui';
import { useColors } from '../../lib/theme';

export default function CrewRoute() {
  const c = useColors();
  const qc = useQueryClient();
  const { profile, signOut } = useAuth();
  const route = useCrewRoute(profile?.id);
  const local = useQuery({ queryKey: ['outbox'], queryFn: () => outboxRows(500), refetchInterval: 5000 });
  const [err, setErr] = useState<string | null>(null);
  const r = route.data?.route;
  useRealtimeInvalidate(r ? [{ table: 'route_stops', filter: `route_id=eq.${r.id}` }, { table: 'routes', filter: `id=eq.${r.id}` }] : [], [['crew-route']]);

  // resume GPS sharing if the app restarted mid-route
  useEffect(() => {
    if (r?.status === 'in_progress' && r.truck_id && !isTracking()) startTracking(r.truck_id, r.id).catch((e) => setErr(e.message));
  }, [r?.status, r?.truck_id, r?.id]);

  const setStatus = useMutation({
    mutationFn: async (status: 'in_progress' | 'completed') => {
      if (status === 'in_progress') await startTracking(r!.truck_id!, r!.id);
      else {
        stopTracking();
        await q(supabase.from('route_stops').update({ status: 'missed' }).eq('route_id', r!.id).eq('status', 'pending').select());
      }
      return q(supabase.from('routes').update({ status }).eq('id', r!.id).select());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crew-route'] }),
    onError: (e: Error) => setErr(e.message),
  });

  const scannedLocally = new Set((local.data ?? []).filter((o) => o.status !== 'rejected' && o.scanned_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).map((o) => o.qr.split('.')[1]));
  const stops = r?.stops ?? [];
  const done = stops.filter((s) => s.status === 'collected' || scannedLocally.has(s.household_id)).length;

  return (
    <Screen refreshing={route.isRefetching} onRefresh={() => route.refetch()}>
      <QueryState query={route} skeletons={3}>
        {(d) => !d.crew ? (
          <EmptyState title="You are not in a crew yet" text="Ask your manager to add you to a crew." action={<Button title="Sign out" variant="ghost" onPress={signOut} />} />
        ) : !d.route ? (
          <EmptyState title={`No route for ${d.crew.name} today`} text="Routes are planned every morning from household reports and predicted demand. Pull down to refresh." />
        ) : (
          <>
            {d.offline && <Badge tone="warning" label={`Offline copy from ${time(d.savedAt)}`} />}
            <Row style={{ justifyContent: 'space-between' }}>
              <View><Text variant="h1">{d.route.crew}</Text><Text muted>Truck {d.route.plate ?? '—'} · {stops.length} {stops.length === 1 ? 'stop' : 'stops'} · {d.route.distance_m ? (d.route.distance_m / 1000).toFixed(1) : '—'} km</Text></View>
              <Badge tone={d.route.status === 'in_progress' ? 'primary' : d.route.status === 'completed' ? 'success' : 'neutral'} label={d.route.status.replace('_', ' ')} />
            </Row>
            <LeafletMap style={{ height: 240 }} line={d.route.geometry?.coordinates}
              markers={stops.filter((s) => s.lat).map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, kind: s.status === 'collected' || scannedLocally.has(s.household_id) ? 'done' as const : 'stop' as const, label: String(s.seq) }))} />
            <Text variant="label">{done} of {stops.length} collected</Text>
            {err && <Text color={c.danger}>{err}</Text>}
            {d.route.status !== 'in_progress' && d.route.status !== 'completed' && (
              <Button title="Start route & share location" icon={Play} onPress={() => setStatus.mutate('in_progress')} loading={setStatus.isPending} disabled={!d.route.truck_id} />
            )}
            {d.route.status === 'in_progress' && (
              <Row>
                <Button style={{ flex: 1 }} title="Scan QR" icon={ScanLine} onPress={() => router.push('/(crew)/scan')} />
                <Button style={{ flex: 1 }} title="Finish" variant="secondary" icon={Flag} onPress={() => setStatus.mutate('completed')} loading={setStatus.isPending} />
              </Row>
            )}
            {stops.map((s) => {
              const ok = s.status === 'collected' || scannedLocally.has(s.household_id);
              return (
                <Card key={s.id}>
                  <Row>
                    {ok ? <CheckCircle2 color={c.success} size={22} /> : <CircleDot color={s.status === 'missed' ? c.danger : c.mutedFg} size={22} />}
                    <View style={{ flex: 1 }}>
                      <Text variant="label">{s.seq}. {s.label}</Text>
                      <Text variant="small" muted>{s.address ?? ''}{s.address ? ' · ' : ''}ETA {time(s.eta)}</Text>
                    </View>
                    {s.reason !== 'predicted' && <Badge tone={s.reason === 'urgent' ? 'danger' : 'warning'} label={s.reason} />}
                  </Row>
                </Card>
              );
            })}
          </>
        )}
      </QueryState>
    </Screen>
  );
}
