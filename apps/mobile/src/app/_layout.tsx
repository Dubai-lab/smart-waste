import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { AppState } from 'react-native';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { AuthProvider, useAuth } from '../lib/auth';
import { registerPush } from '../lib/push';
import { font, useColors } from '../lib/theme';
import { clearRouteCache } from '../lib/outbox';
import { stopTracking } from '../lib/tracking';
import { Button, Text } from '../components/ui';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2 } } });
// React Query refetches when the app returns to the foreground or the network comes back
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
onlineManager.setEventListener((setOnline) => {
  const sub = addNetworkStateListener((st) => setOnline(st.isInternetReachable !== false));
  return () => sub.remove();
});

/** On sign-out: forget the previous user's cached data (shared phones) and go back to sign-in. */
function SignOutGuard() {
  const { session } = useAuth();
  const had = useRef(false);
  useEffect(() => {
    if (session) { had.current = true; return; }
    if (!had.current) return;
    had.current = false;
    stopTracking(); // never keep sharing a crew phone's location after sign-out
    queryClient.clear();
    void clearRouteCache().catch(() => {});
    router.replace('/sign-in');
  }, [session]);
  return null;
}

/** Shown instead of a blank screen if any screen crashes. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const c = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.bg }}>
      <Text variant="h1">Something went wrong</Text>
      <Text muted>{error.message}</Text>
      <Button title="Try again" onPress={retry} />
      <Button title="Go to start" variant="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}

function PushRegistration() {
  const { profile } = useAuth();
  useEffect(() => { if (profile?.consent_at) void registerPush(profile.id); }, [profile?.id, profile?.consent_at]);
  return null;
}

export default function RootLayout() {
  const c = useColors();
  // Fira fonts are embedded at build time (expo-font plugin in app.json). Loading them at runtime made
  // Android measure some bold text with the wrong typeface and clip the last word.
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PushRegistration />
        <SignOutGuard />
        <StatusBar style="auto" />
        <Stack screenOptions={{
          headerShown: false, contentStyle: { backgroundColor: c.bg },
          headerStyle: { backgroundColor: c.card }, headerTintColor: c.fg, headerTitleStyle: { fontFamily: font.semibold },
        }}>
          <Stack.Screen name="complaint" options={{ headerShown: true, title: 'Report a problem' }} />
          <Stack.Screen name="recyclables" options={{ headerShown: true, title: 'Recyclables' }} />
          <Stack.Screen name="leaderboard" options={{ headerShown: true, title: 'Village leaderboard' }} />
          <Stack.Screen name="my-qr" options={{ headerShown: true, title: 'My QR code' }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
          <Stack.Screen name="profile" options={{ headerShown: true, title: 'Profile' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
