import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { supabase, q } from '../lib/supabase';
import { Card, EmptyState, QueryState, Row, Screen, Text } from '../components/ui';
import { font, useColors } from '../lib/theme';

export default function Leaderboard() {
  const c = useColors();
  const board = useQuery({ queryKey: ['leaderboard'], queryFn: () => q(supabase.rpc('village_leaderboard', { p_days: 30 })) });
  return (
    <Screen edges={[]} refreshing={board.isRefetching} onRefresh={() => board.refetch()}>
      <Text muted>Green points per household in the last 30 days. Sort your waste, pay on time and report dumping to move your village up.</Text>
      <QueryState query={board}>
        {(rows: any[]) => rows.length === 0 ? <EmptyState icon={Trophy} title="No villages ranked yet" /> : rows.map((v, i) => (
          <Card key={v.village_id} index={i}>
            <Row>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: i === 0 ? c.warningSoft : c.muted }}>
                <Text variant="label" style={{ fontFamily: font.mono }} color={i === 0 ? c.warning : c.fg}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label">{v.village}</Text>
                <Text variant="small" muted>{v.cell} · {v.sector} · {v.households} {v.households === 1 ? 'household' : 'households'}{v.sorted_rate != null ? ` · ${Math.round(v.sorted_rate * 100)}% sorted` : ''}</Text>
              </View>
              <Text variant="title" style={{ fontFamily: font.mono }}>{v.points_per_household}</Text>
            </Row>
          </Card>
        ))}
      </QueryState>
    </Screen>
  );
}
