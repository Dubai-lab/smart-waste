import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, MapPin, RotateCcw, Save, XCircle } from 'lucide-react-native';
import { FILL_LEVELS, type FillLevel, type RecordPickupResult } from '@sw/shared';
import { useAuth } from '../../lib/auth';
import { householdIdFromQr, useCrewRoute } from '../../lib/crew';
import { flushOutbox, outboxRows, queuePickup } from '../../lib/outbox';
import { label } from '../../lib/format';
import { Button, Card, Chips, EmptyState, Row, Screen, Text } from '../../components/ui';
import { useColors } from '../../lib/theme';

type Pos = { lat: number; lng: number; acc: number | null };

export default function Scan() {
  const c = useColors();
  const qc = useQueryClient();
  const focused = useIsFocused();
  const { profile } = useAuth();
  const route = useCrewRoute(profile?.id);
  const [perm, requestPerm] = useCameraPermissions();
  const [qr, setQr] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [fill, setFill] = useState<FillLevel | null>(null);
  const [sorted, setSorted] = useState<'yes' | 'no' | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean | null; text: string } | null>(null);
  const locked = useRef(false);

  const hid = qr ? householdIdFromQr(qr) : null;
  const stop = route.data?.route?.stops.find((s) => s.household_id === hid) ?? null;

  async function onScan(data: string) {
    if (locked.current) return;
    if (!householdIdFromQr(data)) { setResult({ ok: false, text: 'This is not a Smart Waste household code' }); return; }
    locked.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setQr(data); setResult(null); setFill(null); setSorted(null); setPhoto(null); setPos(null); setGpsErr(null);
    // GPS at the moment of the scan — proof the phone was at the house
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
    } catch {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
      if (last) setPos({ lat: last.coords.latitude, lng: last.coords.longitude, acc: last.coords.accuracy });
      else setGpsErr('No GPS fix. Move to open sky; the scan will be rejected without a position.');
    }
  }

  async function save() {
    if (!qr || !fill) return;
    setSaving(true);
    try {
      const id = await queuePickup({ qr, lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.acc ?? null, fill, sortedOk: sorted == null ? null : sorted === 'yes', photoUri: photo, label: stop?.label ?? null, stopId: stop?.id ?? null });
      await flushOutbox();
      const row = (await outboxRows(50)).find((r) => r.client_id === id);
      const res = row?.result ? (JSON.parse(row.result) as RecordPickupResult) : null;
      if (res) setResult({ ok: res.valid, text: res.valid ? `Recorded: ${res.household} (${res.distance_m} m from the house)` : `Rejected: ${res.reason}` });
      else setResult({ ok: null, text: 'Saved on the phone. It will be sent automatically when the network returns.' });
      void Haptics.notificationAsync(res && !res.valid ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['crew-route'] });
      void qc.invalidateQueries({ queryKey: ['outbox'] });
      setQr(null);
    } finally {
      setSaving(false);
      locked.current = false;
    }
  }

  useEffect(() => { void Location.requestForegroundPermissionsAsync(); }, []);

  // Development builds only: smartwaste:///scan?devqr=<payload> feeds a code into the same flow, so emulator
  // tests can exercise scan → GPS → save → sync without a physical sticker. Stripped from release builds.
  const { devqr } = useLocalSearchParams<{ devqr?: string }>();
  useEffect(() => { if (__DEV__ && devqr) void onScan(devqr); }, [devqr]);

  if (!perm) return <Screen><Text>Checking camera…</Text></Screen>;
  if (!perm.granted) {
    return <Screen><EmptyState icon={Camera} title="Camera needed" text="Allow the camera to scan household QR codes." action={<Button title="Allow camera" onPress={requestPerm} />} /></Screen>;
  }

  return (
    <Screen>
      {!qr ? (
        <>
          <Text variant="h1">Scan the gate QR</Text>
          <View style={{ height: 340, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
            {focused && <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(e) => onScan(e.data)} />}
          </View>
          {result && (
            <Card>
              <Row>
                {result.ok === true ? <CheckCircle2 color={c.success} /> : result.ok === false ? <XCircle color={c.danger} /> : <Save color={c.warning} />}
                <Text style={{ flex: 1 }} accessibilityLiveRegion="assertive">{result.text}</Text>
              </Row>
            </Card>
          )}
        </>
      ) : (
        <>
          <Card>
            <Text variant="caption" muted>{stop ? `Stop #${stop.seq}` : 'Not on today\'s route'}</Text>
            <Text variant="h1">{stop?.label ?? 'Household'}</Text>
            <Row><MapPin size={16} color={pos ? c.success : c.danger} /><Text variant="small" color={pos ? c.success : c.danger}>{pos ? `GPS captured ±${Math.round(pos.acc ?? 0)} m` : gpsErr ?? 'Getting GPS…'}</Text></Row>
          </Card>
          <Chips label="How full was the bin?" value={fill} onChange={setFill} options={FILL_LEVELS.map((f) => ({ value: f, label: label(f) }))} />
          <Chips label="Was the waste sorted?" value={sorted} onChange={setSorted} options={[{ value: 'yes', label: 'Yes, sorted' }, { value: 'no', label: 'Not sorted' }]} />
          <Row>
            <Button style={{ flex: 1 }} variant="secondary" icon={Camera} title={photo ? 'Retake photo' : 'Photo (optional)'} onPress={async () => {
              const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4 }); if (!r.canceled) setPhoto(r.assets[0]!.uri);
            }} />
            <Button style={{ flex: 1 }} variant="ghost" icon={RotateCcw} title="Cancel" onPress={() => { setQr(null); locked.current = false; }} />
          </Row>
          {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 160, borderRadius: 12 }} accessibilityLabel="Pickup photo" />}
          <Button title="Confirm pickup" icon={CheckCircle2} disabled={!fill} loading={saving} onPress={save} />
          {!fill && <Text variant="small" muted>Choose the fill level — it trains the demand prediction model.</Text>}
        </>
      )}
    </Screen>
  );
}
