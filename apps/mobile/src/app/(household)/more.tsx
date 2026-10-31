import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Bell, ChevronRight, LogOut, MessageSquareWarning, QrCode, Recycle, Trophy, UserCog, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { Card, IconCircle, Screen, Text } from '../../components/ui';
import { useColors } from '../../lib/theme';

export default function More() {
  const c = useColors();
  const t = useT();
  const { signOut, profile } = useAuth();
  const items: { icon: LucideIcon; label: string; href: Href; hint: string }[] = [
    { icon: MessageSquareWarning, label: t('complaint'), href: '/complaint', hint: 'Missed pickup, illegal dumping, billing…' },
    { icon: Recycle, label: t('recyclables'), href: '/recyclables', hint: 'List sorted plastic, metal, paper for recyclers' },
    { icon: Trophy, label: t('leaderboard'), href: '/leaderboard', hint: 'How your Umudugudu compares' },
    { icon: QrCode, label: t('myQr'), href: '/my-qr', hint: 'The code the crew scans at your gate' },
    { icon: Bell, label: t('notifications'), href: '/notifications', hint: 'Pickups, bills, alerts' },
    { icon: UserCog, label: t('profile'), href: '/profile', hint: `${profile?.full_name ?? ''} · ${t('language')}` },
  ];
  return (
    <Screen>
      <Text variant="h1">{t('more')}</Text>
      <Card style={{ padding: 0, gap: 0 }}>
        {items.map((it, i) => (
          <Pressable key={it.label} accessibilityRole="link" onPress={() => router.push(it.href)} android_ripple={{ color: c.muted }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64, opacity: pressed ? 0.8 : 1, borderTopWidth: i ? 1 : 0, borderTopColor: c.border })}>
            <IconCircle icon={it.icon} color={c.primaryStrong} bg={c.primarySoft} size={40} />
            <View style={{ flex: 1 }}><Text variant="label">{it.label}</Text><Text variant="small" muted>{it.hint}</Text></View>
            <ChevronRight color={c.mutedFg} size={20} />
          </Pressable>
        ))}
      </Card>
      <Pressable accessibilityRole="button" onPress={signOut} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 52, paddingHorizontal: 8 }}>
        <LogOut color={c.danger} size={20} /><Text variant="label" color={c.danger} style={{ flex: 1 }}>{t('signOut')}</Text>
      </Pressable>
    </Screen>
  );
}
