import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleMarker } from 'react-leaflet';
import { AlertTriangle, Camera, MapPin, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, q, signedUrl } from '../lib/supabase';
import { dateTime, label, num, relative } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { Badge, Button, Card, Field, Modal, PageHeader, QueryView, Select, StatusBadge, Table, Tabs, Textarea } from '../components/ui';
import { MapView } from '../components/MapView';

type TabKey = 'active' | 'escalated' | 'resolved' | 'all';

export default function ComplaintsPage() {
  const [tab, setTab] = useState<TabKey>('active');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState<any | null>(null);
  const key = ['complaints', tab, category];
  const list = useQuery({
    queryKey: key,
    queryFn: () => {
      let rq = supabase.from('v_complaints').select('*').order('created_at', { ascending: false }).limit(300);
      if (tab === 'active') rq = rq.in('status', ['open', 'in_progress', 'escalated']);
      if (tab === 'escalated') rq = rq.eq('status', 'escalated');
      if (tab === 'resolved') rq = rq.in('status', ['resolved', 'rejected']);
      if (category) rq = rq.eq('category', category);
      return q(rq);
    },
  });
  useRealtimeInvalidate(['complaints'], [key]);

  return (
    <>
      <PageHeader title="Complaints" description="Missed pickups, illegal dumping and other reports. Unresolved complaints are escalated automatically to the Sector/Cell officer when their deadline passes." />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'escalated', label: 'Escalated' }, { value: 'resolved', label: 'Closed' }, { value: 'all', label: 'All' }]} />
        <Field label="Category">{(id) => (
          <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)} className="w-52">
            <option value="">All categories</option>
            {['missed_pickup', 'illegal_dumping', 'crew_conduct', 'billing', 'other'].map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </Select>
        )}</Field>
      </div>
      <Card>
        <QueryView query={list} empty={{ title: 'Nothing here', text: 'No complaints match this filter.' }}>
          {(rows) => (
            <Table head={['Reported', 'Category', 'Household / place', 'Description', 'Deadline', 'Status']}>
              {rows.map((c: any) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
                  <td className="num whitespace-nowrap">{dateTime(c.created_at)}<p className="text-xs text-muted-fg">via {c.channel}</p></td>
                  <td>{label(c.category)}</td>
                  <td>{c.household ?? c.sector ?? '—'}</td>
                  <td className="max-w-80"><button className="line-clamp-2 cursor-pointer text-left hover:underline" onClick={() => setOpen(c)}>{c.description}</button></td>
                  <td className="whitespace-nowrap">
                    {['resolved', 'rejected'].includes(c.status) ? '—' : c.overdue
                      ? <Badge tone="danger">Overdue {relative(c.due_at).replace(' ago', '')}</Badge>
                      : <span className="text-sm">{relative(c.due_at)}</span>}
                  </td>
                  <td><StatusBadge status={c.status} />{c.escalation_level > 0 && <p className="text-xs text-danger">Level {c.escalation_level}</p>}</td>
                </tr>
              ))}
            </Table>
          )}
        </QueryView>
      </Card>
      {open && <ComplaintDetail complaint={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ComplaintDetail({ complaint: c, onClose }: { complaint: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [status, setStatus] = useState(c.status === 'open' ? 'in_progress' : c.status);
  const [note, setNote] = useState(c.resolution_note ?? '');
  const [photo, setPhoto] = useState<string | null>(null);

  const extra = useQuery({
    queryKey: ['complaint', c.id],
    queryFn: async () => {
      const [events, evidence] = await Promise.all([
        q(supabase.from('complaint_events').select('*, profiles:actor_id(full_name)').eq('complaint_id', c.id).order('created_at')),
        c.evidence_pickup_id ? q(supabase.from('v_pickups').select('*').eq('id', c.evidence_pickup_id).maybeSingle()) : Promise.resolve(null),
      ]);
      return { events, evidence: evidence as any, photo: await signedUrl(c.photo_path) };
    },
  });

  const save = useMutation({
    mutationFn: () => q(supabase.from('complaints').update({ status, resolution_note: note || null, assigned_to: profile!.id }).eq('id', c.id).select()),
    onSuccess: () => { toast.success('Complaint updated — the resident is notified'); void qc.invalidateQueries({ queryKey: ['complaints'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const closing = status === 'resolved' || status === 'rejected';
  return (
    <Modal open wide onClose={onClose} title={`${label(c.category)} · ${c.household ?? c.sector ?? ''}`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button loading={save.isPending} disabled={closing && note.trim().length < 3} onClick={() => save.mutate()}>Save</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2"><StatusBadge status={c.status} />{c.overdue && <Badge tone="danger">Past deadline</Badge>}{c.escalation_level > 0 && <Badge tone="danger">Escalation level {c.escalation_level}</Badge>}</div>
          <p className="whitespace-pre-wrap">{c.description}</p>
          <p className="text-xs text-muted-fg">Reported {dateTime(c.created_at)} by {c.reporter ?? 'resident'} {c.reporter_phone ? `(${c.reporter_phone})` : ''} via {c.channel}. Deadline {dateTime(c.due_at)}.</p>
          {extra.data?.photo && <button onClick={() => setPhoto(extra.data!.photo)} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-primary-strong hover:underline"><Camera className="size-4" />View photo</button>}

          {c.category === 'missed_pickup' && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1 flex items-center gap-2 font-medium"><ScanLine className="size-4 text-primary" aria-hidden />Pickup evidence (last 7 days)</p>
              {extra.data?.evidence ? (
                <p className="text-sm">
                  {extra.data.evidence.valid ? <Badge tone="success">Valid scan</Badge> : <Badge tone="danger">Rejected scan</Badge>}{' '}
                  {dateTime(extra.data.evidence.scanned_at)} by {extra.data.evidence.crew_member ?? 'crew'}, {num(extra.data.evidence.distance_m)} m from the house, bin {label(extra.data.evidence.fill_level)}.
                </p>
              ) : <p className="text-sm text-muted-fg">No scan recorded for this household in the 7 days before the complaint.</p>}
            </div>
          )}

          <div className="space-y-3 rounded-lg bg-muted p-3">
            <Field label="Status">{(id) => (
              <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                {['open', 'in_progress', 'escalated', 'resolved', 'rejected'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </Select>
            )}</Field>
            <Field label="Resolution note" required={closing} hint="The resident sees this message" error={closing && note.trim().length < 3 ? 'Explain how it was resolved before closing' : undefined}>
              {(id, d) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={d} />}
            </Field>
          </div>
        </div>
        <div className="space-y-3">
          {c.lat && (
            <MapView className="h-56" center={[c.lat, c.lng]} zoom={16} label="Complaint location">
              <CircleMarker center={[c.lat, c.lng]} radius={10} pathOptions={{ color: '#dc2626', fillOpacity: 0.6 }} />
            </MapView>
          )}
          {!c.lat && <p className="flex items-center gap-2 text-sm text-muted-fg"><MapPin className="size-4" />No location</p>}
          <div>
            <p className="mb-2 font-medium">History</p>
            <QueryView query={extra}>
              {(d) => (
                <ol className="space-y-2 border-l-2 border-border pl-4">
                  {d.events.map((e: any) => (
                    <li key={e.id} className="text-sm">
                      <p className="font-medium">{e.event === 'auto_escalated' ? <span className="inline-flex items-center gap-1 text-danger"><AlertTriangle className="size-3.5" />Auto-escalated</span> : label(e.event)}</p>
                      <p className="text-xs text-muted-fg">{dateTime(e.created_at)} · {e.profiles?.full_name ?? 'system'}{e.note ? ` · ${e.note}` : ''}</p>
                    </li>
                  ))}
                </ol>
              )}
            </QueryView>
          </div>
        </div>
      </div>
      <Modal open={!!photo} onClose={() => setPhoto(null)} title="Complaint photo">{photo && <img src={photo} alt="Photo attached to the complaint" className="w-full rounded-lg" />}</Modal>
    </Modal>
  );
}
