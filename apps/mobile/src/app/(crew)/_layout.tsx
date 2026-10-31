import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { addNetworkStateListener } from 'expo-network';
import { CloudUpload, Route, ScanLine } from 'lucide-react-native';
import { flushOutbox, pendingCount } from '../../lib/outbox';
import { useT } from '../../lib/i18n';
import { font, useColors } from '../../lib/theme';

export default function CrewTabs() {
  const c = useColors();
  const t = useT();
  const [pending, setPending] = useState(0);
  // background sync: when the network returns, when the app comes back, and every 30 s
  useEffect(() => {
    const run = () => flushOutbox().finally(async () => setPending(await pendingCount()));
    void run();
    const net = addNetworkStateListener((s) => { if (s.isInternetReachable) void run(); });
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void run(); });
    const timer = setInterval(run, 30_000);
    return () => { net.remove(); app.remove(); clearInterval(timer); };
  }, []);
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: c.primaryStrong, tabBarInactiveTintColor: c.mutedFg,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, minHeight: 64 }, tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('route'), tabBarIcon: ({ color }) => <Route color={color} size={24} /> }} />
      <Tabs.Screen name="scan" options={{ title: t('scan'), tabBarIcon: ({ color }) => <ScanLine color={color} size={24} /> }} />
      <Tabs.Screen name="sync" options={{ title: t('sync'), tabBarBadge: pending || undefined, tabBarIcon: ({ color }) => <CloudUpload color={color} size={24} /> }} />
    </Tabs>
  );
}
