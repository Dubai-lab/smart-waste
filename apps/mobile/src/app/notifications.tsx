import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react-native';
import { supabase, q } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useRealtimeInvalidate } from '../lib/useRealtime';
import { dateTime } from '../lib/format';
import { Card, EmptyState, QueryState, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

export default function Notifications() {
  const c = useColors();
  const { profile } = useAuth();
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => q(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) });
  useRealtimeInvalidate([{ table: 'notifications', filter: `user_id=eq.${profile?.id}` }], [['notifications']]);
  useEffect(() => { void supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('user_id', profile!.id); }, [profile]);
  return (
    <Screen edges={[]} refreshing={list.isRefetching} onRefresh={() => list.refetch()}>
      <QueryState query={list}>
        {(rows: any[]) => rows.length === 0 ? <EmptyState icon={Bell} title="No notifications yet" /> : rows.map((n) => (
          <Card key={n.id} style={!n.read_at ? { borderColor: c.primary } : undefined}>
            <Text variant="label">{n.title}</Text>
            <Text variant="small">{n.body}</Text>
            <Text variant="small" muted>{dateTime(n.created_at)}</Text>
          </Card>
        ))}
      </QueryState>
    </Screen>
  );
}
