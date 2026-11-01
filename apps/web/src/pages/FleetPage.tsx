import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Marker } from 'react-leaflet';
import { Edit3, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, q } from '../lib/supabase';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, QueryView, Select, Table, Tabs } from '../components/ui';
import { ClickToPick, depotIcon, MapView, PlaceSearch } from '../components/MapView';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function FleetPage() {
  const [tab, setTab] = useState<'zones' | 'trucks' | 'crews' | 'villages'>('zones');
  return (
    <>
      <PageHeader title="Zones & fleet" description="Collection zones with their depot, trucks, crews and villages (Imidugudu)." />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} options={[{ value: 'zones', label: 'Zones' }, { value: 'trucks', label: 'Trucks' }, { value: 'crews', label: 'Crews' }, { value: 'villages', label: 'Villages' }]} /></div>
      {tab === 'zones' && <Zones />}
      {tab === 'trucks' && <Trucks />}
      {tab === 'crews' && <Crews />}
      {tab === 'villages' && <Villages />}
    </>
  );
}

function useSave(table: string, invalidate: string[], onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, row }: { id?: string; row: Record<string, unknown> }) =>
      id ? q(supabase.from(table).update(row).eq('id', id).select()) : q(supabase.from(table).insert(row).select()),
    onSuccess: () => { toast.success('Saved'); invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onDone(); },
    onError: (e: Error) => toast.error(e.message.includes('duplicate') ? 'That name is already used' : e.message),
  });
}

function Zones() {
  const [edit, setEdit] = useState<any | null>(null);
  const zones = useQuery({ queryKey: ['zones-geo'], queryFn: () => q(supabase.from('zones_geo').select('*').order('name')) });
  return (
    <Card title="Zones" action={<Button icon={Plus} onClick={() => setEdit({})}>Add zone</Button>}>
      <QueryView query={zones} empty={{ title: 'No zones yet', text: 'Create a zone and place its depot on the map. Households are assigned to the nearest depot automatically.' }}>
        {(list) => (
          <Table head={['Zone', 'Sector', 'Fallback days', 'Depot', '']}>
            {list.map((z: any) => (
              <tr key={z.id}>
                <td><span className="inline-flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: z.color }} />{z.name}</span></td>
                <td>{z.sector ?? '—'}</td>
                <td>{(z.collection_weekdays ?? []).map((d: number) => DAYS[d - 1]).join(', ')}</td>
                <td>{z.depot_lat ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Missing</Badge>}</td>
                <td className="text-right"><button aria-label={`Edit ${z.name}`} onClick={() => setEdit(z)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-muted"><Edit3 className="size-4" /></button></td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {edit && <ZoneForm zone={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function ZoneForm({ zone, onClose }: { zone: any; onClose: () => void }) {
  const [depot, setDepot] = useState<[number, number] | null>(zone.depot_lat ? [zone.depot_lat, zone.depot_lng] : null);
  const [days, setDays] = useState<number[]>(zone.collection_weekdays ?? [2, 5]);
  const [err, setErr] = useState<string | null>(null);
  const save = useSave('zones', ['zones-geo'], onClose);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (String(f.get('name')).trim().length < 2) return setErr('Enter a zone name');
    if (!depot) return setErr('Click the map to set where trucks start and end');
    save.mutate({ id: zone.id, row: {
      name: String(f.get('name')).trim(), sector: String(f.get('sector') ?? '').trim() || null, color: String(f.get('color')),
      collection_weekdays: days.sort(), depot: `SRID=4326;POINT(${depot[1]} ${depot[0]})`,
    } });
  }
  return (
    <Modal open wide onClose={onClose} title={zone.id ? `Edit ${zone.name}` : 'Add zone'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="zone-form" loading={save.isPending}>Save</Button></>}>
      <form id="zone-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Name" required>{(id) => <Input id={id} name="name" defaultValue={zone.name} />}</Field>
          <Field label="Sector">{(id) => <Input id={id} name="sector" defaultValue={zone.sector ?? ''} placeholder="e.g. Remera" />}</Field>
          <Field label="Map colour">{(id) => <Input id={id} name="color" type="color" defaultValue={zone.color ?? '#0d9488'} className="h-10 w-20 p-1" />}</Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Fallback collection days</legend>
            <p className="mb-2 text-xs text-muted-fg">Shown to residents as the next collection day. Actual routes come from daily demand planning.</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className={`flex min-h-9 cursor-pointer items-center rounded-lg border px-3 text-sm ${days.includes(i + 1) ? 'border-primary bg-primary-soft text-primary-strong' : 'border-border'}`}>
                  <input type="checkbox" className="sr-only" checked={days.includes(i + 1)} onChange={() => setDays((s) => s.includes(i + 1) ? s.filter((x) => x !== i + 1) : [...s, i + 1])} />{d}
                </label>
              ))}
            </div>
          </fieldset>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Depot (truck start/end) <span className="text-danger">*</span></p>
          <MapView className="h-80" center={depot ?? undefined} zoom={depot ? 15 : 13} label="Click to set depot">
            <PlaceSearch onPick={(a, b) => setDepot([a, b])} />
            <ClickToPick onPick={(a, b) => setDepot([a, b])} />
            {depot && <Marker position={depot} icon={depotIcon} />}
          </MapView>
        </div>
      </form>
    </Modal>
  );
}

function Trucks() {
  const [edit, setEdit] = useState<any | null>(null);
  const trucks = useQuery({ queryKey: ['trucks'], queryFn: () => q(supabase.from('trucks').select('*, zones(name)').order('plate')) });
  const zones = useQuery({ queryKey: ['zones-geo'], queryFn: () => q(supabase.from('zones_geo').select('id, name').order('name')) });
  const save = useSave('trucks', ['trucks'], () => setEdit(null));
  return (
    <Card title="Trucks" action={<Button icon={Plus} onClick={() => setEdit({})}>Add truck</Button>}>
      <QueryView query={trucks} empty={{ title: 'No trucks yet' }}>
        {(list) => (
          <Table head={['Plate', 'Zone', 'Capacity (bins)', 'Fuel (L/100 km)', 'Status', '']}>
            {list.map((t: any) => (
              <tr key={t.id}>
                <td className="num font-medium">{t.plate}</td><td>{t.zones?.name ?? '—'}</td>
                <td className="num">{t.capacity_bins}</td><td className="num">{t.fuel_l_per_100km}</td>
                <td>{t.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td className="text-right"><button aria-label={`Edit ${t.plate}`} onClick={() => setEdit(t)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-muted"><Edit3 className="size-4" /></button></td>
              </tr>
            ))}
          </Table>
        )}
      </QueryView>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.plate}` : 'Add truck'}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" form="truck-form" loading={save.isPending}>Save</Button></>}>
          <form id="truck-form" className="space-y-3" onSubmit={(e) => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            if (String(f.get('plate')).trim().length < 2) return toast.error('Enter the plate number');
            save.mutate({ id: edit.id, row: { plate: String(f.get('plate')).trim().toUpperCase(), zone_id: f.get('zone_id') || null,
              capacity_bins: Number(f.get('capacity_bins')), fuel_l_per_100km: Number(f.get('fuel')), active: f.get('active') === 'on' } });
          }}>
            <Field label="Plate" required>{(id) => <Input id={id} name="plate" defaultValue={edit.plate} placeholder="RAB 123 C" />}</Field>
            <Field label="Zone">{(id) => <Select id={id} name="zone_id" defaultValue={edit.zone_id ?? ''}><option value="">—</option>{(zones.data ?? []).map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select>}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Capacity (bins)" hint="Bins per trip">{(id, d) => <Input id={id} name="capacity_bins" type="number" min={1} defaultValue={edit.capacity_bins ?? 80} aria-describedby={d} />}</Field>
              <Field label="Fuel L/100 km">{(id) => <Input id={id} name="fuel" type="number" min={1} step={0.5} defaultValue={edit.fuel_l_per_100km ?? 30} />}</Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" name="active" defaultChecked={edit.active ?? true} className="size-4" />Active</label>
          </form>
        </Modal>
      )}
    </Card>
  );
}

function Crews() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const crews = useQuery({ queryKey: ['crews'], queryFn: () => q(supabase.from('crews').select('*, zones(name), trucks(plate), crew_members(profile_id, profiles(full_name, email))').order('name')) });
  const zones = useQuery({ queryKey: ['zones-geo'], queryFn: () => q(supabase.from('zones_geo').select('id, name').order('name')) });
  const trucks = useQuery({ queryKey: ['trucks'], queryFn: () => q(supabase.from('trucks').select('id, plate').order('plate')) });
  const crewUsers = useQuery({ queryKey: ['crew-users'], queryFn: () => q(supabase.from('profiles').select('id, full_name, email').eq('role', 'crew').order('full_name')) });
  const save = useSave('crews', ['crews'], () => setEdit(null));
  const member = useMutation({
    mutationFn: async ({ crew, profile, add }: { crew: string; profile: string; add: boolean }) =>
      add ? q(supabase.from('crew_members').insert({ crew_id: crew, profile_id: profile }).select())
          : q(supabase.from('crew_members').delete().eq('crew_id', crew).eq('profile_id', profile).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crews'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card title="Crews" description="Crew members are users with the “crew” role (set in Users & roles)." action={<Button icon={Plus} onClick={() => setEdit({})}>Add crew</Button>}>
      <QueryView query={crews} empty={{ title: 'No crews yet' }}>
        {(list) => (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((c: any) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between">
                  <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-fg">{c.zones?.name ?? 'No zone'} · truck <span className="num">{c.trucks?.plate ?? '—'}</span></p></div>
                  <button aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-muted"><Edit3 className="size-4" /></button>
                </div>
                <ul className="mt-2 space-y-1">
                  {c.crew_members.map((m: any) => (
                    <li key={m.profile_id} className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-sm">
                      {m.profiles?.full_name || m.profiles?.email}
                      <button aria-label="Remove member" onClick={() => member.mutate({ crew: c.id, profile: m.profile_id, add: false })} className="grid size-8 cursor-pointer place-items-center rounded hover:bg-card"><Trash2 className="size-3.5 text-danger" /></button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  <UserPlus className="size-4 text-muted-fg" aria-hidden />
                  <Select aria-label={`Add member to ${c.name}`} value="" onChange={(e) => e.target.value && member.mutate({ crew: c.id, profile: e.target.value, add: true })}>
                    <option value="">Add member…</option>
                    {(crewUsers.data ?? []).filter((u: any) => !c.crew_members.some((m: any) => m.profile_id === u.id)).map((u: any) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryView>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : 'Add crew'}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" form="crew-form" loading={save.isPending}>Save</Button></>}>
          <form id="crew-form" className="space-y-3" onSubmit={(e) => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            if (String(f.get('name')).trim().length < 2) return toast.error('Enter a crew name');
            save.mutate({ id: edit.id, row: { name: String(f.get('name')).trim(), zone_id: f.get('zone_id') || null, truck_id: f.get('truck_id') || null, active: f.get('active') === 'on' } });
          }}>
            <Field label="Name" required>{(id) => <Input id={id} name="name" defaultValue={edit.name} placeholder="Crew A" />}</Field>
            <Field label="Zone">{(id) => <Select id={id} name="zone_id" defaultValue={edit.zone_id ?? ''}><option value="">—</option>{(zones.data ?? []).map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select>}</Field>
            <Field label="Truck">{(id) => <Select id={id} name="truck_id" defaultValue={edit.truck_id ?? ''}><option value="">—</option>{(trucks.data ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.plate}</option>)}</Select>}</Field>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" name="active" defaultChecked={edit.active ?? true} className="size-4" />Active</label>
          </form>
        </Modal>
      )}
    </Card>
  );
}

function Villages() {
  const villages = useQuery({ queryKey: ['villages'], queryFn: () => q(supabase.from('villages').select('*').order('sector').order('cell').order('name')) });
  const save = useSave('villages', ['villages'], () => undefined);
  return (
    <Card title="Villages (Imidugudu)" description="Used for village leaderboards and to route complaints to the right Sector/Cell officer.">
      <form className="mb-4 grid gap-3 sm:grid-cols-4" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        const row = { name: String(f.get('name')).trim(), cell: String(f.get('cell')).trim(), sector: String(f.get('sector')).trim(), district: String(f.get('district')).trim() || 'Gasabo' };
        if (!row.name || !row.cell || !row.sector) return toast.error('Village, cell and sector are required');
        save.mutate({ row }); e.currentTarget.reset();
      }}>
        <Field label="Village" required>{(id) => <Input id={id} name="name" />}</Field>
        <Field label="Cell" required>{(id) => <Input id={id} name="cell" />}</Field>
        <Field label="Sector" required>{(id) => <Input id={id} name="sector" />}</Field>
        <div className="flex items-end gap-2"><Field label="District">{(id) => <Input id={id} name="district" defaultValue="Gasabo" />}</Field><Button type="submit" icon={Plus} loading={save.isPending}>Add</Button></div>
      </form>
      <QueryView query={villages} empty={{ title: 'No villages yet' }}>
        {(list) => (
          <Table head={['Village', 'Cell', 'Sector', 'District']}>
            {list.map((v: any) => <tr key={v.id}><td>{v.name}</td><td>{v.cell}</td><td>{v.sector}</td><td>{v.district}</td></tr>)}
          </Table>
        )}
      </QueryView>
    </Card>
  );
}
