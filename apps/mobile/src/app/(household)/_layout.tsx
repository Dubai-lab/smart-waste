import { Tabs } from 'expo-router/js-tabs';
import { Home, Leaf, MoreHorizontal, Truck, Wallet } from 'lucide-react-native';
import { useT } from '../../lib/i18n';
import { font, useColors } from '../../lib/theme';

export default function HouseholdTabs() {
  const c = useColors();
  const t = useT();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.primaryStrong, tabBarInactiveTintColor: c.mutedFg,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, minHeight: 64 },
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('home'), tabBarIcon: ({ color }) => <Home color={color} size={24} /> }} />
      <Tabs.Screen name="track" options={{ title: t('track'), tabBarIcon: ({ color }) => <Truck color={color} size={24} /> }} />
      <Tabs.Screen name="sort" options={{ title: t('sort'), tabBarIcon: ({ color }) => <Leaf color={color} size={24} /> }} />
      <Tabs.Screen name="pay" options={{ title: t('pay'), tabBarIcon: ({ color }) => <Wallet color={color} size={24} /> }} />
      <Tabs.Screen name="more" options={{ title: t('more'), tabBarIcon: ({ color }) => <MoreHorizontal color={color} size={24} /> }} />
    </Tabs>
  );
}
