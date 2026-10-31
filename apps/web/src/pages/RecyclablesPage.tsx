import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleMarker, Popup } from 'react-leaflet';
import { CalendarClock, CheckCircle2, Package, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { supabase, q } from '../lib/supabase';
import { dateTime, label, money, num } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Button, Card, Field, Input, Modal, PageHeader, QueryView, Stat, StatusBadge, Table, Tabs } from '../components/ui';
import { FitBounds, MapView } from '../components/MapView';

const MATERIAL_COLOR: Record<string, string> = { plastic: '#0369a1', paper: '#a16207', cardboard: '#92400e', metal: '#475569', glass: '#0d9488', organic: '#15803d', e_waste: '#7c3aed', other: '#64748b' };

export default function RecyclablesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const recycler = profile?.role === 'recycler';
  const [tab, setTab] = useState<'open' | 'mine' | 'all'>(recycler ? 'open' : 'all');
  const [book, setBook] = useState<any | null>(null);
  const [collect, setCollect] = useState<any | null>(null);

  const key = ['listings', tab];
  const list = useQuery({
    queryKey: key,
    queryFn: () => {
      let rq = supabase.from('v_listings').select('*').order('created_at', { ascending: false }).limit(300);
      if (tab === 'open') rq = rq.eq('status', 'open');
      if (tab === 'mine') rq = rq.eq('booked_by', profile!.id);
      return q(rq);
    },
  });
  useRealtimeInvalidate(['recyclable_listings'], [key]);

  const update = useMutation({
    mutationFn: ({ id, row }: { id: string; row: Record<string, unknown> }) => q(supabase.from('recyclable_listings').update(row).eq('id', id).select()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['listings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const kg = rows.reduce((s: number, r: any) => s + Number(r.actual_kg ?? r.est_kg ?? 0), 0);

  return (
    <>
      <PageHeader title={recycler ? 'Recyclables marketplace' : 'Recyclables'}
        description={recycler ? 'Households list sorted recyclables. Book a pickup, collect, then confirm the weight — the household earns green points.' : 'Sorted recyclables listed by households and booked by registered recyclers/cooperatives.'} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat index={0} icon={Package} label="Listings shown" value={rows.length} />
        <Stat index={1} icon={Package} tone="success" label="Material (kg)" value={kg} format={(n) => num(n, 1)} />
        <Stat index={2} icon={CheckCircle2} tone="accent" label="Collected" value={rows.filter((r: any) => r.status === 'collected').length} />
      </div>
      <div className="mb-4"><Tabs value={tab} onChange={setTab} options={recycler
        ? [{ value: 'open', label: 'Available' }, { value: 'mine', label: 'My bookings' }]
        : [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }]} /></div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <QueryView query={list} empty={{ title: tab === 'open' ? 'No recyclables available right now' : 'Nothing here yet' }}>
            {() => (
              <Table head={['Listed', 'Material', 'Weight', 'Asking', 'Household', 'Pickup', 'Status', '']}>
                {rows.map((l: any) => (
                  <tr key={l.id}>
                    <td className="num whitespace-nowrap">{dateTime(l.created_at)}</td>
                    <td><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: MATERIAL_COLOR[l.material] }} />{label(l.material)}</span>{l.description && <p className="max-w-48 truncate text-xs text-muted-fg">{l.description}</p>}</td>
                    <td className="num">{l.actual_kg ? `${num(l.actual_kg, 1)} kg` : `~${num(l.est_kg, 1)} kg`}</td>
                    <td className="num">{l.asking_price_rwf ? money(l.asking_price_rwf) : 'Free'}</td>
                    <td>{l.household}</td>
                    <td className="num">{l.pickup_at ? dateTime(l.pickup_at) : '—'}{l.recycler && !recycler && <p className="text-xs text-muted-fg">{l.recycler}</p>}</td>
                    <td><StatusBadge status={l.status} /></td>
                    <td className="whitespace-nowrap text-right">
                      {recycler && l.status === 'open' && <Button variant="secondary" icon={CalendarClock} onClick={() => setBook(l)}>Book</Button>}
                      {recycler && l.status === 'booked' && l.booked_by === profile!.id && (
                        <div className="flex justify-end gap-1">
                          <Button variant="secondary" icon={CheckCircle2} onClick={() => setCollect(l)}>Collected</Button>
                          <Button variant="ghost" icon={Undo2} aria-label="Release booking" onClick={() => update.mutate({ id: l.id, row: { status: 'open' } })} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Card>
        <Card className="xl:col-span-2" title="Map">
          <MapView className="h-[460px]" label="Recyclables map">
            {rows.filter((l: any) => l.lat).map((l: any) => (
              <CircleMarker key={l.id} center={[l.lat, l.lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: MATERIAL_COLOR[l.material], fillOpacity: 0.9 }}>
                <Popup>{label(l.material)} · ~{num(l.est_kg, 1)} kg<br />{l.household}</Popup>
              </CircleMarker>
            ))}
            <FitBounds points={rows.filter((l: any) => l.lat).map((l: any) => [l.lat, l.lng] as [number, number])} />
          </MapView>
        </Card>
      </div>

      {book && (
        <Modal open onClose={() => setBook(null)} title={`Book ${label(book.material)} · ~${num(book.est_kg, 1)} kg`}
          footer={<><Button variant="ghost" onClick={() => setBook(null)}>Cancel</Button><Button type="submit" form="book-form" loading={update.isPending}>Book pickup</Button></>}>
          <form id="book-form" onSubmit={(e) => {
            e.preventDefault(); const at = new FormData(e.currentTarget).get('at') as string;
            if (!at) return toast.error('Choose when you will collect');
            update.mutate({ id: book.id, row: { status: 'booked', pickup_at: new Date(at).toISOString() } }, { onSuccess: () => { toast.success('Booked — the household is notified'); setBook(null); } });
          }}>
            <Field label="Pickup time" required hint="The household receives a notification">{(id, d) => <Input id={id} name="at" type="datetime-local" aria-describedby={d} min={new Date().toISOString().slice(0, 16)} />}</Field>
          </form>
        </Modal>
      )}
      {collect && (
        <Modal open onClose={() => setCollect(null)} title="Confirm collection"
          footer={<><Button variant="ghost" onClick={() => setCollect(null)}>Cancel</Button><Button type="submit" form="collect-form" loading={update.isPending}>Confirm</Button></>}>
          <form id="collect-form" onSubmit={(e) => {
            e.preventDefault(); const kgv = Number(new FormData(e.currentTarget).get('kg'));
            if (!(kgv > 0)) return toast.error('Enter the weight you collected');
            update.mutate({ id: collect.id, row: { status: 'collected', actual_kg: kgv } }, { onSuccess: () => { toast.success('Collected — green points awarded to the household'); setCollect(null); } });
          }}>
            <Field label="Actual weight (kg)" required>{(id) => <Input id={id} name="kg" type="number" min={0.1} step={0.1} defaultValue={collect.est_kg} />}</Field>
          </form>
        </Modal>
      )}
    </>
  );
}
