import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useColors } from '../lib/theme';

/** Sends each user to the right place: sign in → consent → (register house) → role home. */
export default function Index() {
  const { session, profile, household, loading } = useAuth();
  const c = useColors();
  if (loading || (session && !profile)) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.primary} size="large" /></View>;
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile!.consent_at) return <Redirect href="/consent" />;
  if (profile!.role === 'crew') return <Redirect href="/(crew)" />;
  if (profile!.role === 'household') return household ? <Redirect href="/(household)" /> : <Redirect href="/register-household" />;
  return <Redirect href="/staff" />;
}
