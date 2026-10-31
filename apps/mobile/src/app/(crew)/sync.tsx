import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react-native';
import { flushOutbox, outboxRows } from '../../lib/outbox';
import { useAuth } from '../../lib/auth';
import { dateTime, label } from '../../lib/format';
import { Button, Card, EmptyState, QueryState, Row, Screen, Text } from '../../components/ui';
import { useColors } from '../../lib/theme';

export default function Sync() {
  const c = useColors();
  const { signOut } = useAuth();
  const rows = useQuery({ queryKey: ['outbox'], queryFn: () => outboxRows(200), refetchInterval: 4000 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pending = (rows.data ?? []).filter((r) => r.status === 'pending').length;

  return (
    <Screen refreshing={rows.isRefetching} onRefresh={() => rows.refetch()}>
      <Text variant="h1">Sync</Text>
      <Text muted>Scans are stored on the phone first and sent when there is network. Each scan is sent once, even if retried.</Text>
      <Card>
        <Text variant="title">{pending} waiting to send</Text>
        <Button title="Sync now" icon={RefreshCw} loading={busy} onPress={async () => {
          setBusy(true); const r = await flushOutbox(); setBusy(false); void rows.refetch();
          setMsg(r.sent || r.failed ? `${r.sent} sent, ${r.failed} still waiting` : 'Nothing to send');
        }} />
        {msg && <Text variant="small" muted>{msg}</Text>}
      </Card>
      <QueryState query={rows}>
        {(list) => list.length === 0 ? <EmptyState title="No scans yet today" /> : list.map((r) => {
          const res = r.result ? JSON.parse(r.result) : null;
          return (
            <Card key={r.client_id}>
              <Row>
                {r.status === 'sent' ? <CheckCircle2 color={c.success} /> : r.status === 'rejected' ? <XCircle color={c.danger} /> : <Clock color={c.warning} />}
                <View style={{ flex: 1 }}>
                  <Text variant="label">{r.household_label ?? res?.household ?? 'Household'}</Text>
                  <Text variant="small" muted>{dateTime(r.scanned_at)} · bin {label(r.fill)}{r.photo_uri ? ' · photo' : ''}</Text>
                  {r.status === 'rejected' && <Text variant="small" color={c.danger}>{res?.reason ?? r.last_error}</Text>}
                  {r.status === 'pending' && r.last_error && <Text variant="small" color={c.warning}>Retrying: {r.last_error}</Text>}
                </View>
              </Row>
            </Card>
          );
        })}
      </QueryState>
      <Button title="Sign out" variant="ghost" onPress={() => {
        if (!pending) { void signOut(); return; }
        Alert.alert('Scans not sent yet', `${pending} ${pending === 1 ? 'scan is' : 'scans are'} still waiting for network. Sync before signing out, otherwise they are sent the next time someone from this crew signs in on this phone.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out anyway', style: 'destructive', onPress: () => void signOut() },
        ]);
      }} />
    </Screen>
  );
}
