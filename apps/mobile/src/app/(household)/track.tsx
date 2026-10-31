import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Truck } from 'lucide-react-native';
import { haversine, type HouseholdSummary } from '@sw/shared';
import { supabase, q } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { useRealtimeInvalidate } from '../../lib/useRealtime';
import { time } from '../../lib/format';
import { LeafletMap } from '../../components/LeafletMap';
import { Card, IconCircle, Row, Screen, Text } from '../../components/ui';
import { useColors } from '../../lib/theme';

export default function Track() {
  const c = useColors();
  const t = useT();
  const { household } = useAuth();
  const summary = useQuery({ queryKey: ['summary', household?.id], enabled: !!household, queryFn: () => q(supabase.rpc('household_summary', { hid: household!.id })) as Promise<HouseholdSummary> });
  const trucks = useQuery({
    queryKey: ['zone-trucks', household?.zone_id],
    enabled: !!household?.zone_id,
    queryFn: async () => {
      const ids = (await q(supabase.from('crews').select('truck_id').eq('zone_id', household!.zone_id!))).map((r: any) => r.truck_id).filter(Boolean);
      if (!ids.length) return [];
      return q(supabase.from('truck_locations').select('truck_id, lat, lng, updated_at, trucks(plate)').in('truck_id', ids)
        .gt('updated_at', new Date(Date.now() - 30 * 60_000).toISOString()));
    },
    refetchInterval: 30_000,
  });
  useRealtimeInvalidate([{ table: 'truck_locations' }], [['zone-trucks', household?.zone_id]]);

  const list = (trucks.data ?? []) as any[];
  const nearest = household && list.length
    ? list.map((tr) => ({ ...tr, d: haversine(tr, household) })).sort((a, b) => a.d - b.d)[0]
    : null;
  const etaMin = nearest ? Math.max(1, Math.round((nearest.d * 1.35) / (18_000 / 60))) : null; // ~18 km/h in town

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ flex: 1 }}>
        <LeafletMap style={{ flex: 1, height: undefined, borderRadius: 0 }}
          markers={[
            ...(household ? [{ id: 'home', lat: household.lat, lng: household.lng, kind: 'home' as const }] : []),
            ...list.map((tr) => ({ id: tr.truck_id, lat: tr.lat, lng: tr.lng, kind: 'truck' as const })),
          ]} />
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <Card>
            <Row>
              <IconCircle icon={Truck} color={c.accent} bg={c.warningSoft} />
              <View style={{ flex: 1 }}>
                {nearest ? (
                  <>
                    <Text variant="title">About {etaMin} min away</Text>
                    <Text variant="small" muted>{(nearest as any).trucks?.plate} · {(nearest.d / 1000).toFixed(1)} km · updated {time(nearest.updated_at)}</Text>
                  </>
                ) : (
                  <>
                    <Text variant="title">{t('truckNotOut')}</Text>
                    <Text variant="small" muted>{summary.data?.today_stop ? t('eta', { t: time(summary.data.today_stop.eta) }) : 'You will get an alert when the truck is about 10 minutes away.'}</Text>
                  </>
                )}
              </View>
            </Row>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
