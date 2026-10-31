import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImageIcon, Info, Leaf } from 'lucide-react-native';
import { SORT_CLASSES, SORT_TIPS, type SortClass } from '@sw/shared';
import { classify, preloadClassifier, type Classification } from '../../lib/classifier';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { Badge, Button, Card, Chips, ErrorView, Row, Screen, Text } from '../../components/ui';
import { useColors } from '../../lib/theme';

export default function Sort() {
  const c = useColors();
  const t = useT();
  const { profile } = useAuth();
  const lang = profile?.lang ?? 'en';
  const [uri, setUri] = useState<string | null>(null);
  const [res, setRes] = useState<Classification | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SortClass | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { preloadClassifier(); }, []);

  async function pick(camera: boolean) {
    setErr(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr(new Error(camera ? 'Camera permission is needed to identify waste' : 'Photo access is needed')); return; }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (r.canceled) return;
    const u = r.assets[0]!.uri;
    setUri(u); setRes(null); setFeedback(null); setBusy(true);
    try {
      const out = await classify(u);
      setRes(out);
      const { data } = await supabase.rpc('log_sorting', { p_label: out.label, p_confidence: out.confidence, p_ms: out.ms });
      setLogId((data as string) ?? null);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  async function sendFeedback(v: SortClass) {
    setFeedback(v);
    if (logId) await supabase.from('sorting_classifications').update({ user_feedback: v }).eq('id', logId);
  }

  const tip = res ? SORT_TIPS[res.label][lang] : null;
  const unsure = res && res.confidence < 0.55;

  return (
    <Screen>
      <Text variant="h1">{t('identify')}</Text>
      <Text muted>Take a photo of one item. The AI runs on your phone — it works without internet and the photo is not uploaded.</Text>
      <Row>
        <Button style={{ flex: 1 }} title={t('takePhoto')} icon={Camera} onPress={() => pick(true)} loading={busy} />
        <Button style={{ flex: 1 }} title="Gallery" variant="secondary" icon={ImageIcon} onPress={() => pick(false)} disabled={busy} />
      </Row>
      {err ? <ErrorView error={err} /> : null}
      {uri && <Image source={{ uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} accessibilityLabel="Photo of the waste item" />}
      {res && tip && (
        <Card index={0}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row><Leaf color={c.primary} /><Text variant="h1">{tip.title}</Text></Row>
            <Badge tone={unsure ? 'warning' : 'success'} label={`${Math.round(res.confidence * 100)}%`} />
          </Row>
          <Text variant="label" color={c.primaryStrong}>{tip.bin}</Text>
          <Text>{tip.tip}</Text>
          {unsure && <Row><Info size={16} color={c.warning} /><Text variant="small" color={c.warning} style={{ flex: 1 }}>Not sure. Other possibilities: {res.scores.slice(1, 3).map((s) => SORT_TIPS[s.label][lang].title).join(', ')}</Text></Row>}
          <Text variant="small" muted>Analysed on this phone in {res.ms} ms</Text>
        </Card>
      )}
      {res && (
        <Card>
          <Chips label={feedback ? 'Thank you! This helps improve the model.' : 'Was this right? Choose the correct type:'} value={feedback} onChange={sendFeedback}
            options={SORT_CLASSES.map((k) => ({ value: k, label: SORT_TIPS[k][lang].title }))} />
        </Card>
      )}
    </Screen>
  );
}
