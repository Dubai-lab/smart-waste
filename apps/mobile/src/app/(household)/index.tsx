import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BatteryLow, Bell, CalendarDays, CheckCircle2, Gift, PackagePlus, RadioTower, Trash2, Truck, Wallet } from 'lucide-react-native';
import type { HouseholdSummary } from '@sw/shared';
import { supabase, q } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { useRealtimeInvalidate } from '../../lib/useRealtime';
import { dateTime, day, money, time } from '../../lib/format';
import { Badge, Button, Card, IconCircle, QueryState, Row, Screen, Text } from '../../components/ui';
import { font, useColors } from '../../lib/theme';

/** Same window as public.has_live_sensor(): a sensor that checked in within 3 h reports full bins itself. */
const SENSOR_LIVE_MS = 3 * 3600_000;

export default function Home() {
  const c = useColors();
  const t = useT();
  const qc = useQueryClient();
  const { profile, household } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const key = ['summary', household?.id];
  const summary = useQuery({ queryKey: key, enabled: !!household, queryFn: () => q(supabase.rpc('household_summary', { hid: household!.id })) as Promise<HouseholdSummary> });
  const sensor = useQuery({
    queryKey: ['bin-sensor', household?.id], enabled: !!household,
    queryFn: async () => (await supabase.from('bin_sensors').select('last_fill_pct, last_battery_v, last_seen_at').eq('household_id', household!.id).maybeSingle()).data,
  });
  const unread = useQuery({ queryKey: ['unread'], queryFn: async () => (await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)).count ?? 0 });
  useRealtimeInvalidate(
    [{ table: 'route_stops', filter: `household_id=eq.${household?.id}` }, { table: 'notifications', filter: `user_id=eq.${profile?.id}` }, { table: 'invoices', filter: `household_id=eq.${household?.id}` },
      { table: 'bin_sensors', filter: `household_id=eq.${household?.id}` }],
    [key, ['unread'], ['bin-sensor', household?.id]],
  );

  const sensorLive = !!sensor.data?.last_seen_at && Date.now() - new Date(sensor.data.last_seen_at).getTime() < SENSOR_LIVE_MS;

  const report = useMutation({
    mutationFn: (type: 'bin_full' | 'extra_pickup') => q(supabase.from('bin_reports').insert({ household_id: household!.id, type, created_by: profile!.id, channel: 'app' }).select()),
    onSuccess: () => { setMsg(t('reported')); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <Screen refreshing={summary.isRefetching} onRefresh={() => { void summary.refetch(); void unread.refetch(); void sensor.refetch(); }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="small" muted>Muraho, {profile?.full_name?.split(' ')[0] ?? ''}</Text>
          <Text variant="h1" numberOfLines={1}>{household?.label}</Text>
        </View>
        <Button title={unread.data ? String(unread.data) : ''} accessibilityLabel={`${t('notifications')}, ${unread.data ?? 0} unread`} variant="secondary" icon={Bell} onPress={() => router.push('/notifications')} style={{ minWidth: 52 }} />
      </Row>

      <QueryState query={summary} skeletons={3}>
        {(s) => (
          <>
            <Card index={0}>
              {s.today_stop ? (
                <Row>
                  <IconCircle icon={s.today_stop.status === 'collected' ? CheckCircle2 : Truck} color={s.today_stop.status === 'collected' ? c.success : c.accent} bg={s.today_stop.status === 'collected' ? c.successSoft : c.warningSoft} />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" muted>{t('today')}</Text>
                    <Text variant="title">{s.today_stop.status === 'collected' ? t('collectedToday') : t('eta', { t: time(s.today_stop.eta) })}</Text>
                    {s.today_stop.status !== 'collected' && <Text variant="small" muted>Stop #{s.today_stop.seq} on today's route</Text>}
                  </View>
                </Row>
              ) : (
                <Row>
                  <IconCircle icon={CalendarDays} color={c.primaryStrong} bg={c.primarySoft} />
                  <View style={{ flex: 1 }}>
                    <Text variant="caption" muted>{t('nextCollection')}</Text>
                    <Text variant="title">{s.next_collection ? day(s.next_collection) : 'Not scheduled yet'}</Text>
                    <Text variant="small" muted>{s.zone ?? 'Waiting for zone assignment'} · {sensorLive ? t('soonerSensor') : t('soonerReport')}</Text>
                  </View>
                </Row>
              )}
            </Card>

            {sensor.data?.last_fill_pct != null && (() => {
              const fill = Math.round(sensor.data.last_fill_pct);
              const tone = fill >= 90 ? c.danger : fill >= 60 ? c.warning : c.primary;
              return (
                <Card index={1}>
                  <Row>
                    <IconCircle icon={RadioTower} color={c.primaryStrong} bg={c.primarySoft} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text variant="caption" muted>{t('binSensor')}</Text>
                      <Text variant="title">{t('binLevel', { p: fill })}</Text>
                    </View>
                    <Text variant="small" muted>{t('sensorSeen', { t: dateTime(sensor.data.last_seen_at) })}</Text>
                  </Row>
                  <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: fill }}
                    style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
                    <View style={{ width: `${fill}%`, height: '100%', borderRadius: 4, backgroundColor: tone }} />
                  </View>
                  {sensor.data.last_battery_v != null && sensor.data.last_battery_v > 1 && sensor.data.last_battery_v < 3.4 &&
                    <Badge tone="warning" icon={BatteryLow} label={t('sensorBattery')} />}
                </Card>
              );
            })()}

            <Card index={1}>
              {s.open_report ? (
                <Badge tone="success" icon={CheckCircle2} label={t('reported')} />
              ) : (
                <View style={{ gap: 10 }}>
                  {sensorLive ? (
                    <Row>
                      <IconCircle icon={RadioTower} color={c.primaryStrong} bg={c.primarySoft} size={36} />
                      <Text variant="small" muted style={{ flex: 1 }}>{t('sensorReports')}</Text>
                    </Row>
                  ) : <Button title={t('binFull')} icon={Trash2} variant="accent" loading={report.isPending && report.variables === 'bin_full'} onPress={() => report.mutate('bin_full')} />}
                  <Button title={t('extraPickup')} icon={PackagePlus} variant="secondary" loading={report.isPending && report.variables === 'extra_pickup'} onPress={() => report.mutate('extra_pickup')} />
                </View>
              )}
              {msg && !s.open_report && <Text variant="small" muted accessibilityLiveRegion="polite">{msg}</Text>}
            </Card>

            <Row style={{ alignItems: 'stretch' }}>
              <Card index={2} grow onPress={() => router.push('/(household)/pay')} accessibilityLabel={t('pay')}>
                <IconCircle icon={Wallet} color={s.unpaid_invoice ? c.warning : c.success} bg={s.unpaid_invoice ? c.warningSoft : c.successSoft} size={36} />
                <Text variant="caption" muted>{s.unpaid_invoice ? t('billDue') : t('allPaid')}</Text>
                <Text variant="title" style={{ fontFamily: font.mono }}>{money(s.unpaid_invoice ? s.unpaid_invoice.amount_due : 0)}</Text>
              </Card>
              <Card index={3} grow onPress={() => router.push('/leaderboard')} accessibilityLabel={t('points')}>
                <IconCircle icon={Gift} color={c.primaryStrong} bg={c.primarySoft} size={36} />
                <Text variant="caption" muted>{t('points')}</Text>
                <Text variant="title" style={{ fontFamily: font.mono }}>{s.points}</Text>
                <Text variant="small" muted>{t('worth', { v: s.points * s.point_value_rwf })}</Text>
              </Card>
            </Row>
          </>
        )}
      </QueryState>
    </Screen>
  );
}
