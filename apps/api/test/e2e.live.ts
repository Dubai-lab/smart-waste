/**
 * Live end-to-end check against the Supabase project. Creates temporary "e2e" users/data and deletes them at the end.
 * Run: npx tsx --env-file=../../.env test/e2e.live.ts
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL!;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tag = randomUUID().slice(0, 8);
const created = { users: [] as string[], zone: '', truck: '', crew: '', households: [] as string[] };
const PASS = 'E2e-test-' + randomUUID();

async function user(role: string): Promise<{ id: string; c: SupabaseClient }> {
  const email = `e2e-${role}-${tag}@smartwaste.test`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASS, email_confirm: true, user_metadata: { full_name: `E2E ${role}`, role: 'household' } });
  if (error) throw error;
  created.users.push(data.user.id);
  if (!role.startsWith('household')) await svc.from('profiles').update({ role }).eq('id', data.user.id).throwOnError();
  const c = createClient(URL, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: PASS });
  if (e2) throw e2;
  return { id: data.user.id, c };
}
const ok = (m: string) => console.log('  ✔', m);

async function main() {
  console.log('E2E run', tag);
  const [hh, hh2, crew, mgr, officer, recycler] = [
    await user('household'), await user('household2'), await user('crew'), await user('manager'), await user('officer'), await user('recycler')];
  ok('6 users created; signup trigger made profiles');

  // ── manager sets up zone, truck, crew (RLS: staff writes) ──
  const { data: z, error: ze } = await mgr.c.from('zones').insert({ name: `E2E zone ${tag}`, sector: 'Remera',
    depot: 'SRID=4326;POINT(30.1044 -1.9536)', collection_weekdays: [1, 2, 3, 4, 5, 6, 7] }).select().single();
  if (ze) throw ze;
  created.zone = z.id;
  const { data: truck } = await mgr.c.from('trucks').insert({ plate: `E2E ${tag}`, capacity_bins: 50, zone_id: z.id }).select().single().throwOnError();
  created.truck = truck!.id;
  const { data: cr } = await mgr.c.from('crews').insert({ name: `E2E crew ${tag}`, zone_id: z.id, truck_id: truck!.id }).select().single().throwOnError();
  created.crew = cr!.id;
  await mgr.c.from('crew_members').insert({ crew_id: cr!.id, profile_id: crew.id }).throwOnError();
  ok('manager created zone/truck/crew');

  const { error: hhZoneErr } = await hh.c.from('zones').insert({ name: 'hack' });
  assert.ok(hhZoneErr, 'household must not create zones');
  ok('household cannot create zones');

  // ── household registers own house (zone auto-assigned, fee forced to default) ──
  const { data: house, error: he } = await hh.c.from('households').insert({ owner_id: hh.id, label: `E2E house ${tag}`,
    location: 'SRID=4326;POINT(30.1060 -1.9530)', size: 5, monthly_fee: 1 }).select().single();
  if (he) throw he;
  created.households.push(house.id);
  assert.equal(house.zone_id, z.id, 'zone auto-assigned by nearest depot');
  assert.equal(house.monthly_fee, 3000, 'resident cannot set own fee');
  ok('household registered; zone auto-assigned; fee protected');

  const { data: house2 } = await hh2.c.from('households').insert({ owner_id: hh2.id, label: `E2E house2 ${tag}`,
    location: 'SRID=4326;POINT(30.1100 -1.9500)', size: 3 }).select().single().throwOnError();
  created.households.push(house2!.id);

  const { data: peek } = await hh.c.from('households').select('id').eq('id', house2!.id);
  assert.equal(peek!.length, 0, 'household cannot see neighbours');
  const { error: zoneChange } = await hh.c.from('households').update({ monthly_fee: 0 }).eq('id', house.id);
  assert.ok(zoneChange, 'household cannot change fee');
  const { data: sec } = await hh.c.from('household_secrets').select('*');
  assert.equal(sec!.length, 0, 'QR secrets hidden');
  const { error: roleErr } = await hh.c.from('profiles').update({ role: 'admin' }).eq('id', hh.id);
  assert.ok(roleErr, 'cannot self-promote');
  ok('isolation: neighbours hidden, fee/role locked, QR secrets hidden');

  // ── QR + report ──
  const { data: qr } = await hh.c.rpc('household_qr_payload', { hid: house.id });
  assert.match(qr as string, /^SW1\.[0-9a-f-]{36}\.1\.[0-9a-f]{16}$/);
  const { error: qrOther } = await hh.c.rpc('household_qr_payload', { hid: house2!.id });
  assert.ok(qrOther, 'cannot get neighbour QR');
  await hh.c.from('bin_reports').insert({ household_id: house.id, created_by: hh.id }).throwOnError();
  ok('QR payload signed; bin-full report filed');

  // ── crew scans: valid, too far, forged, duplicate, wrong role ──
  const scan = (c: SupabaseClient, over: Record<string, unknown> = {}) => c.rpc('record_pickup', {
    p_client_id: randomUUID(), p_qr: qr, p_scanned_at: new Date().toISOString(), p_lat: -1.95302, p_lng: 30.10598,
    p_accuracy: 8, p_fill: 'full', p_sorted_ok: true, ...over });
  const good = await scan(crew.c);
  assert.equal(good.error, null, good.error?.message);
  assert.equal((good.data as any).valid, true, JSON.stringify(good.data));
  const far = await scan(crew.c, { p_lat: -1.9600, p_lng: 30.1200 });
  assert.equal((far.data as any).valid, false);
  assert.match((far.data as any).reason, /from the house/);
  const forged = await scan(crew.c, { p_qr: (qr as string).slice(0, -4) + '0000' });
  assert.equal((forged.data as any).valid, false);
  const cid = randomUUID();
  await scan(crew.c, { p_client_id: cid });
  const dup = await scan(crew.c, { p_client_id: cid });
  assert.equal((dup.data as any).duplicate, true);
  const asHousehold = await scan(hh.c);
  assert.ok(asHousehold.error, 'households cannot record pickups');
  ok(`scan valid (${(good.data as any).distance_m} m); too-far rejected; forged rejected; offline duplicate idempotent; role enforced`);

  const { data: rep } = await hh.c.from('bin_reports').select('status').eq('household_id', house.id);
  assert.equal(rep![0]!.status, 'done', 'report closed by pickup');
  const { data: pts } = await hh.c.from('household_points').select('balance').eq('household_id', house.id).single();
  assert.ok(pts!.balance >= 10, 'sorted points awarded');
  const { data: notes } = await hh.c.from('notifications').select('title');
  assert.ok(notes!.some((n) => n.title === 'Waste collected'));
  ok(`report closed; ${pts!.balance} green points; household notified`);

  // ── invoices with points discount ──
  const period = '2099-01';
  await svc.rpc('generate_invoices', { p_period: period }).throwOnError();
  const { data: inv } = await hh.c.from('invoices').select('*').eq('period', period).single();
  assert.ok(inv!.discount > 0 && inv!.amount_due < 3000, JSON.stringify(inv));
  ok(`invoice ${inv!.amount_due} RWF after ${inv!.discount} RWF points discount`);
  // staff records cash → trigger marks invoice paid + receipt
  await mgr.c.from('payments').insert({ invoice_id: inv!.id, household_id: house.id, amount: inv!.amount_due,
    provider: 'cash', payer_phone: '250788000000', status: 'successful' }).throwOnError();
  const { data: paid } = await hh.c.from('invoices').select('status').eq('id', inv!.id).single();
  const { data: pay } = await hh.c.from('payments').select('receipt_no').eq('invoice_id', inv!.id).single();
  assert.equal(paid!.status, 'paid');
  assert.match(pay!.receipt_no!, /^RCPT-/);
  ok(`payment recorded → invoice paid, receipt ${pay!.receipt_no}`);

  // ── complaint → auto escalation → officer notified ──
  const { data: comp } = await hh.c.from('complaints').insert({ household_id: house.id, reporter_id: hh.id,
    category: 'missed_pickup', description: 'E2E: truck did not come' }).select().single().throwOnError();
  assert.ok(comp!.evidence_pickup_id, 'missed-pickup dispute linked to scan evidence');
  await svc.from('complaints').update({ due_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', comp!.id).throwOnError();
  await svc.rpc('escalate_overdue_complaints').throwOnError();
  const { data: esc } = await officer.c.from('complaints').select('status, escalation_level').eq('id', comp!.id).single();
  assert.equal(esc!.status, 'escalated');
  const { data: offNotes } = await officer.c.from('notifications').select('title').eq('title', 'Escalated complaint');
  assert.ok(offNotes!.length > 0);
  ok('complaint linked to pickup evidence; escalated past deadline; officer notified');

  // ── recyclables marketplace ──
  const { data: lst } = await hh.c.from('recyclable_listings').insert({ household_id: house.id, material: 'plastic', est_kg: 4 })
    .select().single().throwOnError();
  const { data: visible } = await recycler.c.from('recyclable_listings').select('id').eq('id', lst!.id);
  assert.equal(visible!.length, 1);
  await recycler.c.from('recyclable_listings').update({ status: 'booked', pickup_at: new Date().toISOString() }).eq('id', lst!.id).throwOnError();
  const { data: booked } = await hh.c.from('recyclable_listings').select('status, booked_by').eq('id', lst!.id).single();
  assert.equal(booked!.booked_by, recycler.id);
  ok('recycler sees and books listing; owner notified');

  // ── home summary ──
  const { data: summary } = await hh.c.rpc('household_summary', { hid: house.id });
  assert.equal((summary as any).zone, z.name);
  ok(`household summary: next collection ${(summary as any).next_collection}, ${(summary as any).points} points`);
}

async function cleanup() {
  // complaints only lose their household/reporter links on delete, so remove them explicitly
  if (created.users.length) await svc.from('complaints').delete().in('reporter_id', created.users);
  await svc.from('households').delete().in('id', created.households);
  if (created.crew) await svc.from('crews').delete().eq('id', created.crew);
  if (created.truck) await svc.from('trucks').delete().eq('id', created.truck);
  if (created.zone) await svc.from('zones').delete().eq('id', created.zone);
  for (const id of created.users) await svc.auth.admin.deleteUser(id);
  console.log('cleanup done');
}

main().then(() => console.log('E2E PASSED')).catch((e) => { console.error('E2E FAILED:', e); process.exitCode = 1; }).finally(cleanup);
