import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleMarker, Popup } from 'react-leaflet';
import { AlertTriangle, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase, q } from '../lib/supabase';
import { api } from '../lib/api';
import { dateTime, kigaliToday, num, pct, relative } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Badge, Card, Field, Input, PageHeader, QueryView, Stat, Table, Tabs } from '../components/ui';
import { FitBounds, HeatLayer, MapView } from '../components/MapView';

const tomorrow = () => new Date(Date.now() + 26 * 3600_000).toISOString().slice(0, 10);

export default function AuthorityPage() {
  const { profile } = useAuth();
  const [layer, setLayer] = useState<'quality' | 'dumping'>('quality');
  const [forecastDate, setForecastDate] = useState(tomorrow());

  const quality = useQuery({ queryKey: ['service-quality'], queryFn: () => q(supabase.from('v_service_quality').select('*')) });
  const dumping = useQuery({
    queryKey: ['dumping'],
    queryFn: () => q(supabase.from('v_complaints').select('id, lat, lng, description, status, created_at, sector').eq('category', 'illegal_dumping').not('lat', 'is', null).order('created_at', { ascending: false }).limit(300)),
  });
  const escalated = useQuery({ queryKey: ['escalated'], queryFn: () => q(supabase.from('v_complaints').select('*').eq('status', 'escalated').order('escalated_at', { ascending: false })) });
  const kpis = useQuery({ queryKey: ['complaint-kpis'], queryFn: () => q(supabase.rpc('complaint_kpis', { p_days: 30 })) });
  const forecast = useQuery({ queryKey: ['forecast', forecastDate], queryFn: () => api<any>(`/planning/forecast?date=${forecastDate}`), retry: 1 });
  useRealtimeInvalidate(['complaints'], [['escalated'], ['dumping'], ['complaint-kpis']]);

  const heat = useMemo(() => (quality.data ?? []).map((h: any) => {
    const problems = h.missed_30d + h.complaints_30d;
    return [h.lat, h.lng, Math.min(1, 0.15 + problems * 0.3)] as [number, number, number];
  }), [quality.data]);

  const k = (kpis.data ?? []).reduce((a: any, r: any) => ({ total: a.total + r.total, resolved: a.resolved + r.resolved, onTime: a.onTime + r.resolved_on_time, open: a.open + r.open_now, escalated: a.escalated + r.escalated }), { total: 0, resolved: 0, onTime: 0, open: 0, escalated: 0 });

  return (
    <>
      <PageHeader title="Local authority dashboard" description={`Sanitation service quality${profile?.officer_sector ? ` in ${profile.officer_sector} sector` : ''}: where service is poor, illegal dumping, escalated complaints and the waste forecast.`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} icon={AlertTriangle} tone="danger" label="Escalated now" value={escalated.data?.length} />
        <Stat index={1} icon={Clock} label="Open complaints" value={k.open} />
        <Stat index={2} icon={CheckCircle2} tone="success" label="Resolved on time (30 d)" value={k.total ? Math.round((k.onTime / k.total) * 100) : null} format={(n) => `${Math.round(n)}%`} hint={`${k.onTime} of ${k.total} complaints`} />
        <Stat index={3} icon={Trash2} tone="accent" label="Dumping reports" value={dumping.data?.length} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Map" action={<Tabs value={layer} onChange={setLayer} options={[{ value: 'quality', label: 'Service heatmap' }, { value: 'dumping', label: 'Illegal dumping' }]} />}>
          <MapView className="h-[460px]" label={layer === 'quality' ? 'Service quality heatmap' : 'Illegal dumping reports'}>
            {layer === 'quality' && heat.length > 0 && <HeatLayer points={heat} />}
            {layer === 'dumping' && (dumping.data ?? []).map((d: any) => (
              <CircleMarker key={d.id} center={[d.lat, d.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: d.status === 'resolved' ? '#15803d' : '#dc2626', fillOpacity: 0.9 }}>
                <Popup><strong>{d.status}</strong> · {dateTime(d.created_at)}<br />{d.description}</Popup>
              </CircleMarker>
            ))}
            <FitBounds points={(layer === 'quality' ? heat.map((h) => [h[0], h[1]]) : (dumping.data ?? []).map((d: any) => [d.lat, d.lng])) as [number, number][]} />
          </MapView>
          <p className="mt-2 text-xs text-muted-fg">
            {layer === 'quality' ? 'Heat = missed stops + complaints per household over 30 days (green = good service, red = problems).' : 'Red = open, green = cleared.'}
          </p>
        </Card>
        <Card className="xl:col-span-2" title="Waste forecast" description="Expected full bins per zone, from the demand model."
          action={<Field label="Day">{(id) => <Input id={id} type="date" value={forecastDate} min={kigaliToday()} onChange={(e) => setForecastDate(e.target.value)} className="w-40" />}</Field>}>
          <QueryView query={forecast} empty={{ title: 'No zones yet', when: (d) => d.zones.length === 0 }}>
            {(d) => (
              <>
                <Table head={['Zone', 'Households', 'Expected full', 'Likely (≥50%)']}>
                  {d.zones.map((z: any) => (
                    <tr key={z.zone_id}><td>{z.zone}</td><td className="num">{z.households}</td><td className="num font-semibold">{num(z.expected_full, 1)}</td><td className="num">{z.likely_full}</td></tr>
                  ))}
                </Table>
                <p className="mt-2 text-xs text-muted-fg">Model: <Badge tone={d.model_version.startsWith('cold') ? 'warning' : 'primary'} icon={false}>{d.model_version}</Badge></p>
              </>
            )}
          </QueryView>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Escalated complaints" action={<Link to="/complaints" className="text-sm text-primary-strong hover:underline">Open complaints</Link>}>
          <QueryView query={escalated} empty={{ title: 'No escalated complaints', text: 'Every complaint is being handled within its deadline.' }}>
            {(list) => (
              <Table head={['Category', 'Household / place', 'Escalated', 'Level']}>
                {list.map((c: any) => (
                  <tr key={c.id}><td>{c.category.replace('_', ' ')}</td><td>{c.household ?? c.sector}</td><td>{relative(c.escalated_at)}</td><td><Badge tone="danger">L{c.escalation_level}</Badge></td></tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Card>
        <Card title="Complaint handling by sector — 30 days">
          <QueryView query={kpis} empty={{ title: 'No complaints in the last 30 days' }}>
            {(list) => (
              <Table head={['Sector', 'Total', 'Resolved', 'On time', 'Escalated', 'Avg hours']}>
                {list.map((r: any) => (
                  <tr key={r.sector}><td>{r.sector}</td><td className="num">{r.total}</td><td className="num">{r.resolved}</td><td className="num">{pct(r.total ? r.resolved_on_time / r.total : null)}</td><td className="num">{r.escalated}</td><td className="num">{num(r.avg_resolution_hours, 1)}</td></tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Card>
      </div>
    </>
  );
}
