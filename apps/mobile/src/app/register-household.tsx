import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, MapPin } from 'lucide-react-native';
import { supabase, q } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { LeafletMap } from '../components/LeafletMap';
import { Button, Card, Chips, Field, Row, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

export default function RegisterHousehold() {
  const c = useColors();
  const { profile, refresh, signOut } = useAuth();
  const [pos, setPos] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsFix, setGpsFix] = useState(0);
  const [form, setForm] = useState({ label: '', address: '', size: '4' });
  const [village, setVillage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const villages = useQuery({ queryKey: ['villages'], queryFn: () => q(supabase.from('villages').select('id, name, cell, sector').order('name')) });

  async function locate() {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setErrors((e) => ({ ...e, location: 'Allow location, or tap your house on the map' })); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? undefined });
      setGpsFix((n) => n + 1);
    } catch {
      setErrors((e) => ({ ...e, location: 'Could not get GPS. Tap your house on the map instead.' }));
    } finally { setLocating(false); }
  }
  useEffect(() => { void locate(); }, []);

  async function save() {
    const e: Record<string, string> = {};
    if (form.label.trim().length < 2) e.label = 'Give your house a name the crew will recognise, e.g. “House 12, KG 9 Ave”';
    const size = Number(form.size);
    if (!(size >= 1 && size <= 50)) e.size = 'Number of people living in the house (1–50)';
    if (!pos) e.location = 'Set your house location';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await supabase.from('households').insert({
      owner_id: profile!.id, label: form.label.trim(), address: form.address.trim() || null, size, village_id: village,
      phone: profile!.phone, location: `SRID=4326;POINT(${pos!.lng} ${pos!.lat})`,
    });
    setBusy(false);
    if (error) { setErrors({ form: error.message }); return; }
    await refresh();
    router.replace('/');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="h1">Register your household</Text>
      <Text muted>The collection crew scans a QR sticker at your gate. Pickups are only accepted near the location you set here.</Text>
      <Field label="House name" value={form.label} onChangeText={(v) => setForm({ ...form, label: v })} error={errors.label} placeholder="House 12, KG 9 Ave" />
      <Field label="Directions (optional)" value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} placeholder="Blue gate next to the church" />
      <Field label="People in the house" value={form.size} onChangeText={(v) => setForm({ ...form, size: v.replace(/\D/g, '') })} error={errors.size} keyboardType="number-pad" />
      {(villages.data ?? []).length > 0 && (
        <Chips label="Village (Umudugudu)" value={village} onChange={setVillage}
          options={(villages.data ?? []).map((v: any) => ({ value: v.id, label: `${v.name} · ${v.cell}` }))} />
      )}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row><MapPin size={18} color={c.primary} /><Text variant="label">House location</Text></Row>
          <Button title={locating ? 'Locating…' : 'Use GPS'} variant="ghost" icon={Crosshair} onPress={locate} loading={locating} style={{ minHeight: 44 }} />
        </Row>
        <LeafletMap style={{ height: 280 }} pickable focusKey={gpsFix} onPick={(lat, lng) => setPos({ lat, lng })}
          markers={pos ? [{ id: 'home', lat: pos.lat, lng: pos.lng, kind: 'home' }] : []} />
        <Text variant="small" muted>{pos ? `Tap the map to move the pin to your gate${pos.acc ? ` · GPS ±${Math.round(pos.acc)} m` : ''}.` : 'Tap the map at your house.'}</Text>
        {errors.location && <Text variant="small" color={c.danger}>{errors.location}</Text>}
      </Card>
      {errors.form && <Text color={c.danger} accessibilityRole="alert">{errors.form}</Text>}
      <Button title="Register household" onPress={save} loading={busy} />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
