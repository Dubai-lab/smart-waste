import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, q } from '../lib/supabase';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, QueryView, Select, Table } from '../components/ui';

/** A sensor that wakes every 30–60 min is "offline" after 3 missed check-ins. */
const STALE_MS = 3 * 3600_000;
const LOW_BATTERY_V = 3.4;
const FULL_PCT = 90;

interface Sensor {
  id: string; household_id: string; empty_cm: number; full_cm: number;
  last_distance_cm: number | null; last_fill_pct: number | null; last_battery_v: number | null; last_seen_at: string | null;
  households: { label: string; address: string | null } | null;
}

export default function SensorsPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Sensor | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const sensors = useQuery({
    queryKey: ['bin-sensors'],
    queryFn: () => q(supabase.from('bin_sensors')
      .select('id, household_id, empty_cm, full_cm, last_distance_cm, last_fill_pct, last_battery_v, last_seen_at, households(label, address)')
      .order('created_at')) as unknown as Promise<Sensor[]>,
  });
  useRealtimeInvalidate(['bin_sensors'], [['bin-sensors']]);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/iot/sensors/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Sensor removed'); void qc.invalidateQueries({ queryKey: ['bin-sensors'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Bin sensors"
        description={`Ultrasonic sensors in bin lids report how full each bin is. At ${FULL_PCT}% the system files a "bin full" report, so the bin joins the next route.`}
        actions={<Button icon={Plus} onClick={() => setAdding(true)}>Add sensor</Button>} />
      <Card>
        <QueryView query={sensors} empty={{ title: 'No sensors yet', text: 'Add a sensor to a household to get its device key.' }}>
          {(rows) => (
            <Table head={['Household', 'Fill', 'Distance', 'Battery', 'Last seen', 'Calibration', '']}>
              {rows.map((s) => {
                const stale = !s.last_seen_at || Date.now() - new Date(s.last_seen_at).getTime() > STALE_MS;
                const fill = s.last_fill_pct;
                return (
                  <tr key={s.id}>
                    <td><p className="font-medium">{s.households?.label ?? '—'}</p><p className="text-xs text-muted-fg">{s.households?.address ?? ''}</p></td>
                    <td className="min-w-40">
                      {fill == null ? <span className="text-muted-fg">No data</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fill} aria-label="Fill level">
                            <div className={`h-full rounded-full ${fill >= FULL_PCT ? 'bg-danger' : fill >= 60 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${fill}%` }} />
                          </div>
                          <span className="num font-medium">{Math.round(fill)}%</span>
                        </div>
                      )}
                    </td>
                    <td className="num">{s.last_distance_cm == null ? '—' : `${s.last_distance_cm.toFixed(1)} cm`}</td>
                    <td>{s.last_battery_v == null ? '—'
                      : s.last_battery_v < LOW_BATTERY_V ? <Badge tone="danger">{s.last_battery_v.toFixed(2)} V low</Badge>
                      : <span className="num">{s.last_battery_v.toFixed(2)} V</span>}</td>
                    <td>{stale ? <Badge tone="warning">{s.last_seen_at ? `Offline · ${relative(s.last_seen_at)}` : 'Never'}</Badge> : relative(s.last_seen_at!)}</td>
                    <td><button className="num cursor-pointer text-left underline decoration-dotted underline-offset-2 hover:text-primary" onClick={() => setEditing(s)}>
                      empty {s.empty_cm} cm · full {s.full_cm} cm</button></td>
                    <td><Button variant="ghost" icon={Trash2} aria-label={`Remove sensor for ${s.households?.label ?? 'household'}`}
                      onClick={() => confirm('Remove this sensor? Its readings are deleted and its key stops working.') && remove.mutate(s.id)} /></td>
                  </tr>
                );
              })}
            </Table>
          )}
        </QueryView>
      </Card>
      {adding && <SensorForm onClose={() => setAdding(false)} onKey={(k) => { setAdding(false); setKey(k); void qc.invalidateQueries({ queryKey: ['bin-sensors'] }); }} />}
      {editing && <SensorForm sensor={editing} onClose={() => setEditing(null)} onKey={setKey} />}
      {key && (
        <Modal open onClose={() => setKey(null)} title="Device key" footer={<Button onClick={() => setKey(null)}>Done</Button>}>
          <div className="space-y-3">
            <p>Put this key in the sensor's <code>secrets.h</code> as <code>DEVICE_KEY</code>. It is shown only once.</p>
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <code className="num flex-1 break-all">{key}</code>
              <Button variant="secondary" icon={Copy} onClick={() => { void navigator.clipboard.writeText(key); toast.success('Copied'); }}>Copy</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function SensorForm({ sensor, onClose, onKey }: { sensor?: Sensor; onClose: () => void; onKey: (key: string) => void }) {
  const qc = useQueryClient();
  const households = useQuery({
    queryKey: ['households-min'], enabled: !sensor,
    queryFn: () => q(supabase.from('households').select('id, label, address').eq('active', true).order('label')) as Promise<{ id: string; label: string; address: string | null }[]>,
  });
  const save = useMutation({
    mutationFn: (b: { household_id?: string; empty_cm: number; full_cm: number; newKey?: boolean }) => sensor && !b.newKey
      ? api(`/iot/sensors/${sensor.id}`, { method: 'PATCH', body: { empty_cm: b.empty_cm, full_cm: b.full_cm } })
      : api<{ device_key: string }>('/iot/sensors', { body: { household_id: b.household_id ?? sensor!.household_id, empty_cm: b.empty_cm, full_cm: b.full_cm } }),
    onSuccess: (r: any) => {
      void qc.invalidateQueries({ queryKey: ['bin-sensors'] });
      onClose();
      if (r?.device_key) onKey(r.device_key); else toast.success('Calibration saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const read = (form: HTMLFormElement) => {
    const f = new FormData(form);
    return { household_id: (f.get('household_id') as string) || undefined, empty_cm: Number(f.get('empty_cm')), full_cm: Number(f.get('full_cm')) };
  };

  return (
    <Modal open onClose={onClose} title={sensor ? `Sensor · ${sensor.households?.label ?? ''}` : 'Add sensor'}
      footer={<>
        {sensor && <Button variant="ghost" className="mr-auto" onClick={() => {
          const form = document.getElementById('sensor-form') as HTMLFormElement;
          if (form.reportValidity() && confirm('Issue a new key? The old key stops working right away.')) save.mutate({ ...read(form), newKey: true });
        }}>New key</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="sensor-form" loading={save.isPending}>{sensor ? 'Save' : 'Add and get key'}</Button>
      </>}>
      <form id="sensor-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(read(e.currentTarget)); }}>
        {!sensor && <Field label="Household" required>{(id) => (
          <Select id={id} name="household_id" required defaultValue="">
            <option value="" disabled>{households.isLoading ? 'Loading…' : 'Choose a household'}</option>
            {(households.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.label}{h.address ? ` · ${h.address}` : ''}</option>)}
          </Select>
        )}</Field>}
        <Field label="Empty distance (cm)" required hint="From the probe to the bottom of the empty bin. Point the sensor into the empty bin and use its reading.">
          {(id, d) => <Input id={id} name="empty_cm" type="number" step="0.5" min={10} max={500} required defaultValue={sensor?.empty_cm ?? 60} aria-describedby={d} />}
        </Field>
        <Field label="Full distance (cm)" required hint="From the probe to the waste when the bin counts as full. Not less than 22 cm: the probe cannot see closer than about 20 cm.">
          {(id, d) => <Input id={id} name="full_cm" type="number" step="0.5" min={5} max={400} required defaultValue={sensor?.full_cm ?? 25} aria-describedby={d} />}
        </Field>
      </form>
    </Modal>
  );
}
