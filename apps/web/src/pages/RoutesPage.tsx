import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GeoJSON, Marker, Popup } from 'react-leaflet';
import { CheckCircle2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, q } from '../lib/supabase';
import { api } from '../lib/api';
import { kigaliToday, km, label, mins, num, pct, time } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, QueryView, Select, StatusBadge, Table } from '../components/ui';
import { depotIcon, FitBounds, MapView, numberIcon } from '../components/MapView';

const STOP_COLOR: Record<string, string> = { pending: '#475569', collected: '#15803d', missed: '#dc2626', skipped: '#94a3b8' };
const ROUTE_COLORS = ['#0d9488', '#d97706', '#0369a1', '#7c3aed', '#be123c'];

export default function RoutesPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(kigaliToday());
  const [zone, setZone] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [urgentFor, setUrgentFor] = useState<any | null>(null);

  const zones = useQuery({ queryKey: ['zones-geo'], queryFn: () => q(supabase.from('zones_geo').select('*').order('name')) });
  const key = ['routes', date, zone];
  const routes = useQuery({
    queryKey: key,
    queryFn: async () => {
      let rq = supabase.from('routes').select('*, crews(name), trucks(plate), route_stops(id, seq, status, eta, reason, probability, household_id, households(label, lat, lng))')
        .eq('route_date', date).order('created_at');
      if (zone) rq = rq.eq('zone_id', zone);
      return q(rq);
    },
  });
  const runs = useQuery({
    queryKey: ['plan-runs', date, zone],
    queryFn: () => {
      let rq = supabase.from('plan_runs').select('*, zones(name)').eq('run_date', date).order('created_at', { ascending: false });
      if (zone) rq = rq.eq('zone_id', zone);
      return q(rq);
    },
  });
  useRealtimeInvalidate(['route_stops', 'routes'], [key]);

  const plan = useMutation({
    mutationFn: () => api<{ zones: any[] }>('/planning/run', { body: { date, zone_id: zone || undefined } }),
    onSuccess: (r) => {
      const skipped = r.zones.filter((z) => z.skipped);
      const planned = r.zones.filter((z) => !z.skipped);
      { const n = planned.reduce((s, z) => s + (z.routes?.length ?? 0), 0); toast.success(`Planned ${n} route${n === 1 ? "" : "s"} in ${planned.length} zone${planned.length === 1 ? "" : "s"}`); }
      skipped.forEach((z) => toast.warning(`${z.zone}: ${z.skipped}`));
      planned.filter((z) => z.unassigned).forEach((z) => toast.warning(`${z.zone}: ${z.unassigned} ${z.unassigned === 1 ? 'household' : 'households'} did not fit in the trucks and ${z.unassigned === 1 ? 'was' : 'were'} deferred`));
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['plan-runs', date, zone] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (routeId: string) => {
      const { data: u } = await supabase.auth.getUser();
      return q(supabase.from('routes').update({ status: 'approved', approved_by: u.user?.id }).eq('id', routeId).select());
    },
    onSuccess: () => { toast.success('Route approved — the crew can start'); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const allPoints = useMemo(() => {
    const pts: [number, number][] = [];
    for (const r of routes.data ?? []) for (const s of r.route_stops) if (s.households) pts.push([s.households.lat, s.households.lng]);
    return pts;
  }, [routes.data]);

  return (
    <>
      <PageHeader
        title="Routes & planning"
        description="Each morning the system predicts which bins need collection and builds the shortest route for every truck. Re-run any time; routes already started are kept."
        actions={<Button icon={Sparkles} loading={plan.isPending} onClick={() => plan.mutate()}>Predict & optimise</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />}</Field>
        <Field label="Zone">{(id) => (
          <Select id={id} value={zone} onChange={(e) => setZone(e.target.value)} className="w-56">
            <option value="">All zones</option>
            {(zones.data ?? []).map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </Select>
        )}</Field>
      </div>

      <QueryView query={runs} loading={null} empty={{ title: '', when: () => false }}>
        {(rs) => rs.length > 0 && (
          <Card className="mb-4" title="Optimised vs fixed route" description="Fixed route = the truck visits every household in habitual nearest-neighbour order. Same road network (OpenStreetMap / OSRM).">
            <Table head={['Zone', 'Model', 'Selected / total', 'Optimised', 'Fixed route', 'Saved', 'Fuel / CO₂ saved', 'Roads']}>
              {rs.slice(0, 5).map((r: any) => (
                <tr key={r.id}>
                  <td>{r.zones?.name}</td>
                  <td><Badge tone={r.model_version.startsWith('cold') ? 'warning' : 'primary'}>{r.model_version}</Badge></td>
                  <td className="num">{r.households_selected}/{r.households_total}{r.unassigned ? <span className="text-danger"> (+{r.unassigned} deferred)</span> : null}</td>
                  <td className="num">{km(r.distance_m)} · {mins(r.duration_s)}</td>
                  <td className="num">{km(r.baseline_distance_m)} · {mins(r.baseline_duration_s)}</td>
                  <td className="num font-semibold text-success">{r.households_selected === 0 ? <span className="font-normal text-muted-fg">no pickups needed</span> : pct(1 - r.distance_m / Math.max(r.baseline_distance_m, 1))}</td>
                  <td className="num">{num(r.fuel_saved_l, 1)} L · {num(r.co2_saved_kg, 1)} kg</td>
                  <td>{r.distance_source === 'osrm' ? <Badge tone="success">road network</Badge> : <Badge tone="warning">estimate</Badge>}</td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </QueryView>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Route map">
          <MapView className="h-[520px]" label="Planned routes map">
            {(zones.data ?? []).filter((z: any) => z.depot_lat && (!zone || z.id === zone)).map((z: any) => (
              <Marker key={z.id} position={[z.depot_lat, z.depot_lng]} icon={depotIcon}><Popup>Depot · {z.name}</Popup></Marker>
            ))}
            {(routes.data ?? []).map((r: any, i: number) => (
              <div key={r.id}>
                {r.geometry && (
                  <GeoJSON key={r.id + (selected === r.id)} data={r.geometry}
                    style={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: selected === r.id ? 6 : 4, opacity: selected && selected !== r.id ? 0.25 : 0.85 }} />
                )}
                {r.route_stops.filter((s: any) => s.households).map((s: any) => (
                  <Marker key={s.id} position={[s.households.lat, s.households.lng]} icon={numberIcon(s.seq, STOP_COLOR[s.status] ?? '#475569')}>
                    <Popup>
                      <strong>#{s.seq} {s.households.label}</strong><br />
                      {label(s.reason)} · ETA {time(s.eta)}<br />
                      {s.probability != null && <>P(full) {pct(s.probability)}<br /></>}
                      Status: {s.status}
                    </Popup>
                  </Marker>
                ))}
              </div>
            ))}
            <FitBounds points={allPoints} />
          </MapView>
          <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-fg">
            <span>Stop colours:</span>
            {Object.entries(STOP_COLOR).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-full" style={{ background: c }} />{k}</span>)}
          </p>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <QueryView query={routes} empty={{ title: 'No routes for this day', text: 'Press “Predict & optimise” to plan routes from household reports and predicted demand.' }}>
            {(rs) => rs.map((r: any, i: number) => {
              const stops = [...r.route_stops].sort((a: any, b: any) => a.seq - b.seq);
              const done = stops.filter((s: any) => s.status === 'collected').length;
              return (
                <Card key={r.id}
                  title={<button className="flex cursor-pointer items-center gap-2 text-left" onClick={() => setSelected(selected === r.id ? null : r.id)}>
                    <span className="inline-block size-3 rounded-full" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />{r.crews?.name} · <span className="num">{r.trucks?.plate}</span>
                  </button>}
                  description={`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} · ${km(r.distance_m)} · ${mins(r.duration_s)} · ${done} collected`}
                  action={<div className="flex gap-1">
                    <StatusBadge status={r.status} />
                  </div>}>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {r.status === 'planned' && <Button variant="secondary" icon={CheckCircle2} loading={approve.isPending} onClick={() => approve.mutate(r.id)}>Approve</Button>}
                    {r.status !== 'completed' && <Button variant="secondary" icon={Plus} onClick={() => setUrgentFor(r)}>Add urgent stop</Button>}
                  </div>
                  <ol className="max-h-64 space-y-1 overflow-y-auto text-sm">
                    {stops.map((s: any) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted">
                        <span className="min-w-0 truncate"><span className="num mr-2 text-muted-fg">{s.seq}.</span>{s.households?.label}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="num text-xs text-muted-fg">{time(s.eta)}</span>
                          <Badge tone={s.reason === 'reported' ? 'warning' : s.reason === 'urgent' ? 'danger' : 'neutral'} icon={false}>{s.reason}</Badge>
                          <StatusBadge status={s.status} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>
              );
            })}
          </QueryView>
        </div>
      </div>
      {urgentFor && <UrgentModal route={urgentFor} onClose={() => setUrgentFor(null)} onDone={() => qc.invalidateQueries({ queryKey: key })} />}
    </>
  );
}

function UrgentModal({ route, onClose, onDone }: { route: any; onClose: () => void; onDone: () => void }) {
  const [hid, setHid] = useState('');
  const onRoute = new Set(route.route_stops.map((s: any) => s.household_id));
  const houses = useQuery({
    queryKey: ['zone-households', route.zone_id],
    queryFn: () => q(supabase.from('households').select('id, label').eq('zone_id', route.zone_id).eq('active', true).order('label')),
  });
  const add = useMutation({
    mutationFn: () => api<{ position: number }>('/planning/urgent', { body: { route_id: route.id, household_id: hid } }),
    onSuccess: (r) => { toast.success(`Inserted as stop #${r.position} at the cheapest point of the route`); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title={`Urgent stop · ${route.crews?.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!hid} loading={add.isPending} onClick={() => add.mutate()}>Insert stop</Button></>}>
      <p className="mb-3 text-sm text-muted-fg">The household is inserted where it adds the least distance, after stops already visited. ETAs and the road path are updated.</p>
      <Field label="Household" required>{(id) => (
        <Select id={id} value={hid} onChange={(e) => setHid(e.target.value)}>
          <option value="">Choose a household…</option>
          {(houses.data ?? []).filter((h: any) => !onRoute.has(h.id)).map((h: any) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </Select>
      )}</Field>
    </Modal>
  );
}
