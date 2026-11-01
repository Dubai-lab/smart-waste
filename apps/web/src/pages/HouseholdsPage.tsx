import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleMarker, Marker, Popup } from 'react-leaflet';
import QRCode from 'qrcode';
import { Edit3, MapPin, Plus, Printer, QrCode, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, q } from '../lib/supabase';
import { money } from '../lib/format';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, QueryView, Select, Table } from '../components/ui';
import { ClickToPick, FitBounds, MapView, PlaceSearch } from '../components/MapView';

export default function HouseholdsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [printing, setPrinting] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const zones = useQuery({ queryKey: ['zones-geo'], queryFn: () => q(supabase.from('zones_geo').select('*').order('name')) });
  const list = useQuery({
    queryKey: ['households', zone],
    queryFn: () => {
      let rq = supabase.from('households_geo').select('*, zones(name, color), villages(name, cell, sector), profiles:owner_id(full_name, email, phone)').order('created_at', { ascending: false });
      if (zone) rq = rq.eq('zone_id', zone);
      return q(rq);
    },
  });
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (list.data ?? []).filter((h: any) => !s || [h.label, h.address, h.phone, h.profiles?.full_name, h.profiles?.email].some((v) => v?.toLowerCase().includes(s)));
  }, [list.data, search]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHeader title="Households" description="Registered households, their zone, fee and QR sticker."
        actions={<>
          <Button variant="secondary" icon={Printer} disabled={!picked.size} onClick={() => setPrinting(filtered.filter((h: any) => picked.has(h.id)))}>Print QR ({picked.size})</Button>
          <Button icon={Plus} onClick={() => setEditing({})}>Add household</Button>
        </>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search">{(id) => (
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" aria-hidden />
            <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, label, phone…" className="w-72 pl-9" /></div>
        )}</Field>
        <Field label="Zone">{(id) => (
          <Select id={id} value={zone} onChange={(e) => setZone(e.target.value)} className="w-56">
            <option value="">All zones</option>
            {(zones.data ?? []).map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </Select>
        )}</Field>
      </div>

      <div className="space-y-4">
        <Card title="Map">
          <MapView className="h-80" label="Households map">
            {filtered.map((h: any) => (
              <CircleMarker key={h.id} center={[h.lat, h.lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: h.zones?.color ?? '#94a3b8', fillOpacity: 0.9 }}>
                <Popup>{h.label}<br />{h.zones?.name ?? 'No zone'}</Popup>
              </CircleMarker>
            ))}
            <FitBounds points={filtered.map((h: any) => [h.lat, h.lng] as [number, number])} />
          </MapView>
        </Card>
        <Card>
          <QueryView query={list} empty={{ title: 'No households yet', text: 'Residents register in the mobile app, or add one here.' }}>
            {() => (
              <Table head={[
                <input key="all" type="checkbox" aria-label="Select all" className="size-4 cursor-pointer"
                  checked={filtered.length > 0 && filtered.every((h: any) => picked.has(h.id))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(filtered.map((h: any) => h.id)) : new Set())} />,
                'Household', 'Owner', 'Zone', 'Size', 'Fee', 'Status', '', '']}>
                {filtered.map((h: any) => (
                  <tr key={h.id}>
                    <td><input type="checkbox" aria-label={`Select ${h.label}`} className="size-4 cursor-pointer" checked={picked.has(h.id)} onChange={() => toggle(h.id)} /></td>
                    <td><p className="font-medium">{h.label}</p><p className="text-xs text-muted-fg">{h.villages ? `${h.villages.name}, ${h.villages.cell}` : h.address ?? ''}</p></td>
                    <td><p>{h.profiles?.full_name ?? <span className="text-muted-fg">No account (USSD)</span>}</p><p className="text-xs text-muted-fg">{h.profiles?.phone ?? h.phone ?? ''}</p></td>
                    <td className="whitespace-nowrap">{h.zones ? <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: h.zones.color }} />{h.zones.name}</span> : <Badge tone="warning">Unassigned</Badge>}</td>
                    <td className="num">{h.size}</td>
                    <td className="num whitespace-nowrap">{money(h.monthly_fee)}</td>
                    <td>{h.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="text-right">
                      <button aria-label={`QR for ${h.label}`} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-muted" onClick={() => setPrinting([h])}><QrCode className="size-4" /></button>
                    </td>
                    <td><button aria-label={`Edit ${h.label}`} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-muted" onClick={() => setEditing(h)}><Edit3 className="size-4" /></button></td>
                  </tr>
                ))}
              </Table>
            )}
          </QueryView>
        </Card>
      </div>

      {editing && <HouseholdForm household={editing} zones={zones.data ?? []} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['households'] })} />}
      {printing && <QrSheet households={printing} onClose={() => setPrinting(null)} />}
    </>
  );
}

function HouseholdForm({ household, zones, onClose, onSaved }: { household: any; zones: any[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !household.id;
  const [pos, setPos] = useState<[number, number] | null>(household.lat ? [household.lat, household.lng] : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const villages = useQuery({ queryKey: ['villages'], queryFn: () => q(supabase.from('villages').select('*').order('sector').order('cell').order('name')) });

  const save = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      if (isNew) return q(supabase.from('households').insert(row).select());
      return q(supabase.from('households').update(row).eq('id', household.id).select());
    },
    onSuccess: () => { toast.success(isNew ? 'Household added' : 'Household updated'); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const errs: Record<string, string> = {};
    if (String(f.get('label')).trim().length < 2) errs.label = 'Give the household a recognisable name, e.g. “House 12, KG 9 Ave”';
    if (!pos) errs.location = 'Click the map to place the house';
    const fee = Number(f.get('monthly_fee'));
    if (!(fee >= 0)) errs.monthly_fee = 'Fee must be 0 or more';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      label: String(f.get('label')).trim(),
      address: String(f.get('address') ?? '').trim() || null,
      phone: String(f.get('phone') ?? '').trim() || null,
      size: Number(f.get('size')) || 1,
      monthly_fee: fee,
      zone_id: f.get('zone_id') || null,
      village_id: f.get('village_id') || null,
      active: f.get('active') === 'on',
      location: `SRID=4326;POINT(${pos![1]} ${pos![0]})`,
    });
  }

  return (
    <Modal open wide onClose={onClose} title={isNew ? 'Add household' : `Edit · ${household.label}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="hh-form" loading={save.isPending}>Save</Button></>}>
      <form id="hh-form" onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Name / label" required error={errors.label}>{(id, d) => <Input id={id} name="label" defaultValue={household.label} aria-describedby={d} aria-invalid={!!errors.label} />}</Field>
          <Field label="Address / directions">{(id) => <Input id={id} name="address" defaultValue={household.address ?? ''} />}</Field>
          <Field label="Phone for USSD/SMS" hint="For residents without a smartphone account">{(id, d) => <Input id={id} name="phone" type="tel" defaultValue={household.phone ?? ''} aria-describedby={d} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="People">{(id) => <Input id={id} name="size" type="number" min={1} max={50} defaultValue={household.size ?? 4} />}</Field>
            <Field label="Monthly fee (RWF)" error={errors.monthly_fee}>{(id, d) => <Input id={id} name="monthly_fee" type="number" min={0} step={100} defaultValue={household.monthly_fee ?? 3000} aria-describedby={d} />}</Field>
          </div>
          <Field label="Zone" hint="Leave empty to assign automatically from the location">{(id, d) => (
            <Select id={id} name="zone_id" defaultValue={household.zone_id ?? ''} aria-describedby={d}>
              <option value="">Automatic</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </Select>
          )}</Field>
          <Field label="Village (Umudugudu)">{(id) => (
            <Select id={id} name="village_id" defaultValue={household.village_id ?? ''}>
              <option value="">—</option>
              {(villages.data ?? []).map((v: any) => <option key={v.id} value={v.id}>{v.name} · {v.cell} · {v.sector}</option>)}
            </Select>
          )}</Field>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" name="active" defaultChecked={household.active ?? true} className="size-4" /> Active (billed and collected)</label>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-sm font-medium"><MapPin className="size-4" aria-hidden /> Location <span className="text-danger">*</span></p>
          <MapView className="h-[340px]" label="Click to place the household" center={pos ?? undefined} zoom={pos ? 17 : 13}>
            <PlaceSearch onPick={(lat, lng) => setPos([lat, lng])} />
            <ClickToPick onPick={(lat, lng) => setPos([lat, lng])} />
            {pos && <Marker position={pos} draggable eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); setPos([p.lat, p.lng]); } }} />}
          </MapView>
          {errors.location ? <p role="alert" className="mt-1 text-xs text-danger">{errors.location}</p> : <p className="mt-1 text-xs text-muted-fg">Search or use your location, then click or drag the pin onto the house's gate (Satellite helps). The QR scan is only accepted near this point (50 m by default).</p>}
        </div>
      </form>
    </Modal>
  );
}

function QrSheet({ households, onClose }: { households: any[]; onClose: () => void }) {
  const [codes, setCodes] = useState<{ id: string; label: string; img: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const out = [];
        for (const h of households) {
          const payload = await q(supabase.rpc('household_qr_payload', { hid: h.id }));
          out.push({ id: h.id, label: h.label, img: await QRCode.toDataURL(payload as string, { margin: 1, width: 360, errorCorrectionLevel: 'M' }) });
        }
        setCodes(out);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [households]);

  function print() {
    const w = window.open('', '_blank');
    if (!w) return toast.error('Allow pop-ups to print the QR sheet');
    w.document.write(`<html><head><title>QR stickers</title><style>
      body{font-family:'Fira Sans',sans-serif;margin:12mm}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
      .s{border:1px dashed #94a3b8;border-radius:8px;padding:6mm;text-align:center;break-inside:avoid}
      img{width:45mm;height:45mm}.t{font-weight:600;margin-top:2mm;font-size:12px}.h{font-size:10px;color:#475569}
    </style></head><body><div class="grid">${(codes ?? []).map((c) => `<div class="s"><div class="h">Smart Waste · scan at pickup</div><img src="${c.img}"/><div class="t">${c.label.replace(/</g, '&lt;')}</div></div>`).join('')}</div>
    <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <Modal open wide onClose={onClose} title={`QR stickers (${households.length})`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button icon={Printer} disabled={!codes} onClick={print}>Print</Button></>}>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!codes && !error && <p className="text-muted-fg">Generating signed QR codes…</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {codes?.map((c) => (
          <figure key={c.id} className="rounded-lg border border-dashed border-border p-3 text-center">
            <img src={c.img} alt={`QR code for ${c.label}`} className="mx-auto aspect-square w-full max-w-40" />
            <figcaption className="mt-1 text-sm font-medium">{c.label}</figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-fg">Each code is signed with a secret only the server knows. Re-issuing a household's QR (Settings) invalidates old stickers.</p>
    </Modal>
  );
}
