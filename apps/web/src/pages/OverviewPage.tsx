import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GeoJSON, Marker, Popup } from 'react-leaflet';
import { AlertTriangle, Fuel, Home, ScanLine, Wallet } from 'lucide-react';
import { supabase, q } from '../lib/supabase';
import { kigaliToday, km, money, num, relative } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Card, PageHeader, QueryView, Stat, StatusBadge, Table } from '../components/ui';
import { MapView, truckIcon, FitBounds } from '../components/MapView';

const daysAgo = (n: number) => new Date(Date.now() + 2 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);

export default function OverviewPage() {
  const today = kigaliToday();
  const period = today.slice(0, 7);

  const kpis = useQuery({
    queryKey: ['overview-kpis', today],
    queryFn: async () => {
      const [hh, todayPk, complaints, overdue, revenue, runs] = await Promise.all([
        supabase.from('households').select('id', { count: 'exact', head: true }).eq('active', true),
        q(supabase.from('v_daily_pickups').select('valid, rejected').eq('day', today)),
        supabase.from('complaints').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'escalated']),
        supabase.from('v_complaints').select('id', { count: 'exact', head: true }).eq('overdue', true),
        q(supabase.from('v_revenue').select('collected, outstanding').eq('period', period)),
        q(supabase.from('plan_runs').select('distance_m, baseline_distance_m, fuel_saved_l, co2_saved_kg').gte('run_date', daysAgo(30))),
      ]);
      const sum = <T,>(rows: T[], k: keyof T) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      return {
        households: hh.count ?? 0,
        validToday: sum(todayPk, 'valid'),
        rejectedToday: sum(todayPk, 'rejected'),
        openComplaints: complaints.count ?? 0,
        overdue: overdue.count ?? 0,
        collected: sum(revenue, 'collected'),
        outstanding: sum(revenue, 'outstanding'),
        savedKm: (sum(runs, 'baseline_distance_m') - sum(runs, 'distance_m')) / 1000,
        fuel: sum(runs, 'fuel_saved_l'),
        co2: sum(runs, 'co2_saved_kg'),
      };
    },
  });

  const chart = useQuery({
    queryKey: ['overview-chart'],
    queryFn: async () => {
      const rows = await q(supabase.from('v_daily_pickups').select('day, valid, rejected, sorted_ok').gte('day', daysAgo(13)));
      return Array.from({ length: 14 }, (_, i) => {
        const day = daysAgo(13 - i);
        const r = rows.filter((x: any) => x.day === day);
        return { day: day.slice(5), Valid: r.reduce((s: number, x: any) => s + x.valid, 0), Rejected: r.reduce((s: number, x: any) => s + x.rejected, 0), Sorted: r.reduce((s: number, x: any) => s + x.sorted_ok, 0) };
      });
    },
  });

  const live = useQuery({
    queryKey: ['overview-live', today],
    queryFn: async () => {
      const [trucks, routes] = await Promise.all([
        q(supabase.from('truck_locations').select('truck_id, lat, lng, updated_at, trucks(plate)')),
        q(supabase.from('routes').select('id, status, distance_m, geometry, crews(name), trucks(plate), route_stops(status)').eq('route_date', today)),
      ]);
      return { trucks, routes };
    },
    refetchInterval: 60_000,
  });
  useRealtimeInvalidate(['truck_locations', 'route_stops', 'pickups', 'complaints'], [['overview-live', today], ['overview-kpis', today], ['overview-chart']]);

  const k = kpis.data;
  return (
    <>
      <PageHeader title="Overview" description="Today's collection, service quality and savings at a glance." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} icon={Home} label="Active households" value={k?.households} />
        <Stat index={1} icon={ScanLine} label="Verified pickups today" value={k?.validToday} tone="success" hint={k ? `${k.rejectedToday} rejected scans` : undefined} />
        <Stat index={2} icon={AlertTriangle} label="Open complaints" value={k?.openComplaints} tone="danger" hint={k ? `${k.overdue} past deadline` : undefined} />
        <Stat index={3} icon={Wallet} label={`Collected ${period}`} value={k?.collected} format={(n) => money(Math.round(n))} tone="accent" hint={k ? `${money(k.outstanding)} outstanding` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Pickups — last 14 days" description="Valid = QR + GPS + time checks passed">
          <QueryView query={chart}>
            {(data) => (
              <div className="h-64" role="img" aria-label="Bar chart of valid and rejected pickups per day for the last 14 days">
                <ResponsiveContainer>
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--color-muted-fg)' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted-fg)' }} width={32} />
                    <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="Valid" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Rejected" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryView>
        </Card>
        <Card className="xl:col-span-2" title="Route optimisation — last 30 days" description="Optimised routes vs. fixed route visiting every house">
          {k ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><Fuel className="mx-auto size-5 text-primary" aria-hidden /><p className="num mt-1 text-2xl font-semibold">{num(k.savedKm, 1)}</p><p className="text-xs text-muted-fg">km saved</p></div>
              <div><Fuel className="mx-auto size-5 text-accent" aria-hidden /><p className="num mt-1 text-2xl font-semibold">{num(k.fuel, 1)}</p><p className="text-xs text-muted-fg">litres diesel</p></div>
              <div><Fuel className="mx-auto size-5 text-success" aria-hidden /><p className="num mt-1 text-2xl font-semibold">{num(k.co2, 1)}</p><p className="text-xs text-muted-fg">kg CO₂</p></div>
            </div>
          ) : <div className="h-20" />}
          <p className="mt-4 text-xs text-muted-fg">Planning runs automatically every morning and can be re-run from <Link className="underline" to="/routes">Routes & planning</Link>.</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Live trucks and today's routes">
          <MapView className="h-[380px]" label="Live truck positions">
            {(live.data?.routes ?? []).map((r: any) => r.geometry && (
              <GeoJSON key={r.id + r.status} data={r.geometry} style={{ color: '#0d9488', weight: 4, opacity: 0.7 }} />
            ))}
            {(live.data?.trucks ?? []).map((t: any) => (
              <Marker key={t.truck_id} position={[t.lat, t.lng]} icon={truckIcon}>
                <Popup>{t.trucks?.plate} · updated {relative(t.updated_at)}</Popup>
              </Marker>
            ))}
            <FitBounds points={(live.data?.trucks ?? []).map((t: any) => [t.lat, t.lng] as [number, number])} />
          </MapView>
        </Card>
        <Card className="xl:col-span-2" title="Today's routes">
          <QueryView query={live} empty={{ title: 'No routes planned for today', text: 'Run planning from Routes & planning.', when: (d) => d.routes.length === 0 }}>
            {(d) => (
              <Table head={['Crew', 'Truck', 'Progress', 'Distance', 'Status']}>
                {d.routes.map((r: any) => {
                  const done = r.route_stops.filter((s: any) => s.status === 'collected').length;
                  return (
                    <tr key={r.id}>
                      <td>{r.crews?.name}</td>
                      <td className="num">{r.trucks?.plate}</td>
                      <td><span className="num">{done}/{r.route_stops.length}</span></td>
                      <td className="num">{km(r.distance_m)}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </QueryView>
        </Card>
      </div>
    </>
  );
}
