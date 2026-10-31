import { useState } from 'react';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Send } from 'lucide-react-native';
import { COMPLAINT_CATEGORIES, type ComplaintCategory } from '@sw/shared';
import { supabase, q, uploadEvidence } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dateTime, label } from '../lib/format';
import { Badge, Button, Card, Chips, EmptyState, Field, QueryState, Row, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

const TONE: Record<string, 'warning' | 'primary' | 'danger' | 'success' | 'neutral'> = { open: 'warning', in_progress: 'primary', escalated: 'danger', resolved: 'success', rejected: 'neutral' };

export default function Complaint() {
  const c = useColors();
  const qc = useQueryClient();
  const { profile, household } = useAuth();
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['my-complaints'], queryFn: () => q(supabase.from('complaints').select('id, category, description, status, created_at, resolution_note, due_at').eq('reporter_id', profile!.id).order('created_at', { ascending: false })) });

  const send = useMutation({
    mutationFn: async () => {
      let lat: number | null = null, lng: number | null = null;
      if (category === 'illegal_dumping') {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) { const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); lat = p.coords.latitude; lng = p.coords.longitude; }
      }
      const photo_path = photo ? await uploadEvidence(photo, 'complaint') : null;
      return q(supabase.from('complaints').insert({
        reporter_id: profile!.id, household_id: category === 'illegal_dumping' ? null : household?.id ?? null,
        category, description: text.trim(), photo_path, lat, lng, channel: 'app',
      }).select());
    },
    onSuccess: () => { setDone('Sent. The company must answer before the deadline, otherwise it goes to your Sector/Cell officer.'); setText(''); setPhoto(null); setCategory(null); void qc.invalidateQueries({ queryKey: ['my-complaints'] }); },
    onError: (e: Error) => setErrors({ form: e.message }),
  });

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!r.canceled) setPhoto(r.assets[0]!.uri);
  }

  function submit() {
    const e: Record<string, string> = {};
    if (!category) e.category = 'Choose what happened';
    if (text.trim().length < 3) e.text = 'Describe the problem in a few words';
    setErrors(e); setDone(null);
    if (!Object.keys(e).length) send.mutate();
  }

  return (
    <Screen edges={[]}>
      <Chips label="What happened?" value={category} onChange={setCategory} options={COMPLAINT_CATEGORIES.map((k) => ({ value: k, label: label(k) }))} />
      {errors.category && <Text variant="small" color={c.danger}>{errors.category}</Text>}
      {category === 'illegal_dumping' && <Text variant="small" muted>Your current GPS position is attached so officers can find the dumping site. Verified reports earn green points.</Text>}
      <Field label="Details" value={text} onChangeText={setText} multiline error={errors.text} placeholder="e.g. The truck did not come on Tuesday" />
      <Row>
        <Button style={{ flex: 1 }} title={photo ? 'Retake photo' : 'Add photo'} variant="secondary" icon={Camera} onPress={takePhoto} />
        <Button style={{ flex: 1 }} title="Send" icon={Send} onPress={submit} loading={send.isPending} />
      </Row>
      {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 180, borderRadius: 12 }} accessibilityLabel="Attached photo" />}
      {errors.form && <Text color={c.danger}>{errors.form}</Text>}
      {done && <Text color={c.success} accessibilityLiveRegion="polite">{done}</Text>}
      <Text variant="title">My reports</Text>
      <QueryState query={list}>
        {(rows) => rows.length === 0 ? <EmptyState title="No reports yet" /> : rows.map((r: any) => (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}><Text variant="label">{label(r.category)}</Text><Badge tone={TONE[r.status]} label={label(r.status)} /></Row>
            <Text variant="small">{r.description}</Text>
            {r.resolution_note && <Text variant="small" color={c.primaryStrong}>Answer: {r.resolution_note}</Text>}
            <Text variant="small" muted>{dateTime(r.created_at)}</Text>
          </Card>
        ))}
      </QueryState>
    </Screen>
  );
}
