import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Plus } from 'lucide-react-native';
import { MATERIALS, type Material } from '@sw/shared';
import { supabase, q, uploadEvidence } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateTime, label, money } from '../lib/format';
import { Badge, Button, Card, Chips, EmptyState, Field, QueryState, Row, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

export default function Recyclables() {
  const c = useColors();
  const qc = useQueryClient();
  const { household } = useAuth();
  const [material, setMaterial] = useState<Material | null>(null);
  const [kg, setKg] = useState('');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['my-listings'], queryFn: () => q(supabase.from('recyclable_listings').select('*').eq('household_id', household!.id).order('created_at', { ascending: false })) });

  const add = useMutation({
    mutationFn: async () => q(supabase.from('recyclable_listings').insert({
      household_id: household!.id, material, est_kg: Number(kg), asking_price_rwf: price ? Number(price) : null,
      photo_path: photo ? await uploadEvidence(photo, 'listing') : null,
    }).select()),
    onSuccess: () => { setMaterial(null); setKg(''); setPrice(''); setPhoto(null); void qc.invalidateQueries({ queryKey: ['my-listings'] }); },
    onError: (e: Error) => setErr(e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => q(supabase.from('recyclable_listings').update({ status: 'cancelled' }).eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-listings'] }),
  });

  function submit() {
    setErr(null);
    if (!material) return setErr('Choose the material');
    if (!(Number(kg) > 0)) return setErr('Enter an estimated weight in kg');
    add.mutate();
  }

  return (
    <Screen edges={[]}>
      <Text muted>Keep recyclables clean and sorted. Registered recyclers and cooperatives book a pickup; you earn green points when it is collected.</Text>
      <Card>
        <Chips label="Material" value={material} onChange={setMaterial} options={MATERIALS.filter((m) => m !== 'organic').map((m) => ({ value: m, label: label(m) }))} />
        <Row>
          <Field label="Weight (kg)" value={kg} onChangeText={setKg} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </Row>
        <Field label="Asking price RWF (optional)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" hint="Leave empty to give it for free" />
        <Row>
          <Button style={{ flex: 1 }} variant="secondary" icon={Camera} title={photo ? 'Photo added' : 'Photo'} onPress={async () => {
            const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) return;
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }); if (!r.canceled) setPhoto(r.assets[0]!.uri);
          }} />
          <Button style={{ flex: 1 }} icon={Plus} title="List" onPress={submit} loading={add.isPending} />
        </Row>
        {err && <Text variant="small" color={c.danger}>{err}</Text>}
      </Card>
      <QueryState query={list}>
        {(rows) => rows.length === 0 ? <EmptyState title="Nothing listed yet" /> : rows.map((l: any) => (
          <Card key={l.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="label">{label(l.material)} · {l.actual_kg ?? l.est_kg} kg</Text>
              <Badge tone={l.status === 'collected' ? 'success' : l.status === 'booked' ? 'primary' : l.status === 'open' ? 'warning' : 'neutral'} label={label(l.status)} />
            </Row>
            <Text variant="small" muted>{l.asking_price_rwf ? money(l.asking_price_rwf) : 'Free'} · listed {dateTime(l.created_at)}{l.pickup_at ? ` · pickup ${dateTime(l.pickup_at)}` : ''}</Text>
            {l.status === 'open' && <Button title="Cancel listing" variant="ghost" onPress={() => cancel.mutate(l.id)} />}
          </Card>
        ))}
      </QueryState>
    </Screen>
  );
}
