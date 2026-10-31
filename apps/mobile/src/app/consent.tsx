import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, ShieldCheck } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Button, Card, Row, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

const POINTS = [
  'This is a final year research project pilot, not a registered company. Payments run in test (sandbox) mode — no real money.',
  'We store your name, phone, email, house location and service records (pickups, reports, bills, points).',
  'Collection crews in your zone see your house label and location. Local authority officers see service quality and complaints.',
  'Crew phones share GPS only while a route is in progress. AI sorting photos stay on your phone.',
  'Data is kept until the end of the project, then deleted or anonymised. You can ask for access, correction or deletion at any time (Law N° 058/2021).',
];

export default function Consent() {
  const c = useColors();
  const { profile, refresh, signOut } = useAuth();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    await supabase.from('profiles').update({ consent_at: new Date().toISOString() }).eq('id', profile!.id);
    await refresh();
    setBusy(false);
    router.replace('/');
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Row><ShieldCheck color={c.primary} size={28} /><Text variant="h1" style={{ flex: 1 }}>Your privacy</Text></Row>
      <Card>{POINTS.map((p) => <Row key={p} style={{ alignItems: 'flex-start' }}><Check size={18} color={c.primary} style={{ marginTop: 3 }} /><Text style={{ flex: 1 }}>{p}</Text></Row>)}</Card>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ok }} onPress={() => setOk(!ok)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 }}>
        <View style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: ok ? c.primary : c.border, backgroundColor: ok ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{ok && <Check size={18} color="#fff" />}</View>
        <Text style={{ flex: 1 }}>I agree that my data is processed for this pilot as described.</Text>
      </Pressable>
      <Button title="Accept and continue" onPress={accept} disabled={!ok} loading={busy} />
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
