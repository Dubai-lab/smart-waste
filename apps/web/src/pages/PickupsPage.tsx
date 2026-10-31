import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, Search, WifiOff, XCircle } from 'lucide-react';
import { supabase, q, signedUrl } from '../lib/supabase';
import { dateTime, kigaliToday, label, num, pct } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Badge, Card, Field, Input, Modal, PageHeader, QueryView, Select, Stat, Table } from '../components/ui';

const daysBefore = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() - n * 86400_000).toISOString().slice(0, 10);

export default function PickupsPage() {
  const [from, setFrom] = useState(daysBefore(kigaliToday(), 6));
  const [to, setTo] = useState(kigaliToday());
  const [validity, setValidity] = useState<'all' | 'valid' | 'invalid'>('all');
  const [search, setSearch] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const key = ['pickups', from, to, validity];
  const list = useQuery({
    queryKey: key,
    queryFn: () => {
      let rq = supabase.from('v_pickups').select('*')
        .gte('scanned_at', `${from}T00:00:00+02:00`).lte('scanned_at', `${to}T23:59:59+02:00`)
        .order('scanned_at', { ascending: false }).limit(500);
      if (validity !== 'all') rq = rq.eq('valid', validity === 'valid');
      return q(rq);
    },
  });
  useRealtimeInvalidate(['pickups'], [key]);

  const rows = (list.data ?? []).filter((p: any) => !search || p.household?.toLowerCase().includes(search.toLowerCase()));
  const valid = rows.filter((p: any) => p.valid).length;
  const offline = rows.filter((p: any) => new Date(p.synced_at).getTime() - new Date(p.scanned_at).getTime() > 5 * 60_000).length;
  const sortedRate = valid ? rows.filter((p: any) => p.valid && p.sorted_ok).length / valid : null;

  async function openPhoto(path: string) { setPhoto(await signedUrl(path)); }

  return (
    <>
      <PageHeader title="Proof of service" description="Every pickup is a QR scan checked against the household's secret, the crew phone's GPS position and the time. Use this log to settle missed-pickup disputes." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} icon={CheckCircle2} tone="success" label="Valid pickups" value={valid} hint={rows.length ? `${pct(valid / rows.length)} of ${rows.length} scans` : undefined} />
        <Stat index={1} icon={XCircle} tone="danger" label="Rejected scans" value={rows.length - valid} />
        <Stat index={2} icon={WifiOff} label="Synced later (offline)" value={offline} hint="Recorded without network, uploaded later" />
        <Stat index={3} icon={CheckCircle2} tone="accent" label="Sorted correctly" value={sortedRate == null ? null : Math.round(sortedRate * 100)} format={(n) => `${Math.round(n)}%`} hint="Confirmed by crew at pickup" />
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />}</Field>
          <Field label="Result">{(id) => (
            <Select id={id} value={validity} onChange={(e) => setValidity(e.target.value as any)} className="w-36">
              <option value="all">All</option><option value="valid">Valid</option><option value="invalid">Rejected</option>
            </Select>
          )}</Field>
          <Field label="Household">{(id) => (
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
              <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} className="w-64 pl-9" placeholder="Filter by household" /></div>
          )}</Field>
        </div>
        <QueryView query={list} empty={{ title: 'No scans in this period', when: () => rows.length === 0 }}>
          {() => (
            <Table head={['Scanned', 'Household', 'Crew member', 'GPS distance', 'Bin', 'Sorted', 'Photo', 'Result']}>
              {rows.map((p: any) => {
                const lateMin = (new Date(p.synced_at).getTime() - new Date(p.scanned_at).getTime()) / 60000;
                return (
                  <tr key={p.id}>
                    <td className="num whitespace-nowrap">{dateTime(p.scanned_at)}{lateMin > 5 && <p className="text-xs text-muted-fg">synced {Math.round(lateMin)} min later</p>}</td>
                    <td>{p.household}</td>
                    <td>{p.crew_member ?? '—'}</td>
                    <td className="num">{p.distance_m == null ? '—' : `${num(p.distance_m)} m`}{p.gps_accuracy_m != null && <span className="text-xs text-muted-fg"> ±{num(p.gps_accuracy_m)}</span>}</td>
                    <td>{label(p.fill_level)}</td>
                    <td>{p.sorted_ok == null ? '—' : p.sorted_ok ? <Badge tone="success">Yes</Badge> : <Badge tone="warning">No</Badge>}</td>
                    <td>{p.photo_path ? <button aria-label="View photo" onClick={() => openPhoto(p.photo_path)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-muted"><Camera className="size-4" /></button> : '—'}</td>
                    <td>{p.valid ? <Badge tone="success">Valid</Badge> : <span><Badge tone="danger">Rejected</Badge><p className="mt-0.5 max-w-56 text-xs text-muted-fg">{p.rejection_reason}</p></span>}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </QueryView>
      </Card>
      <Modal open={!!photo} onClose={() => setPhoto(null)} title="Pickup photo">
        {photo && <img src={photo} alt="Photo taken by the crew at pickup" className="w-full rounded-lg" />}
      </Modal>
    </>
  );
}
