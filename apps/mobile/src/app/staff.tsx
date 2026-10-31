import { Monitor } from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { Button, EmptyState, Screen } from '../components/ui';
import { ROLE_LABELS } from '@sw/shared';

export default function Staff() {
  const { profile, signOut } = useAuth();
  return (
    <Screen edges={['top', 'bottom']}>
      <EmptyState icon={Monitor} title={`Signed in as ${profile ? ROLE_LABELS[profile.role] : ''}`}
        text="Managers, officers, administrators and recyclers use the web dashboard. The mobile app is for households and collection crews." />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
