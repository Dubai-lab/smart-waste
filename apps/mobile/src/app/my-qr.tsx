import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase, q } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Card, QueryState, Screen, Text } from '../components/ui';

export default function MyQr() {
  const { household } = useAuth();
  const qr = useQuery({ queryKey: ['my-qr', household?.id], enabled: !!household, queryFn: () => q(supabase.rpc('household_qr_payload', { hid: household!.id })) as Promise<string> });
  return (
    <Screen edges={[]}>
      <Text muted>The company prints this code as a sticker for your gate. The crew scans it at every pickup — together with their GPS position, it proves your waste was collected.</Text>
      <QueryState query={qr}>
        {(payload) => (
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
              <QRCode value={payload} size={240} ecl="M" />
            </View>
            <Text variant="title">{household?.label}</Text>
            <Text variant="small" muted>If your sticker is damaged, show this screen to the crew.</Text>
          </Card>
        )}
      </QueryState>
    </Screen>
  );
}
