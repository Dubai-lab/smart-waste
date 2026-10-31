import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@sw/shared';
import { recoveryLinkOpened, supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** true after opening a password-reset link, until a new password is saved */
  recovering: boolean;
  finishRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(recoveryLinkOpened);

  async function loadProfile(uid: string | undefined) {
    if (!uid) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
    // keep the previous profile on transient network errors — never log the user out for that
    if (!error) setProfile(data as Profile);
  }

  useEffect(() => {
    let alive = true;
    // 1. restore the stored session before rendering protected routes
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (alive) setLoading(false);
    });
    // 2. follow sign-in, sign-out and silent token refresh
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void loadProfile(s?.user.id);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') { setProfile(null); setRecovering(false); }
      // TOKEN_REFRESHED: session updated silently, no redirect
    });
    // 3. re-validate when the tab becomes visible again (minimise / tab switch / phone unlock)
    const revalidate = () => { if (document.visibilityState === 'visible') void supabase.auth.getSession(); };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
    };
  }, []);

  const value: AuthState = {
    session, profile, loading, recovering,
    finishRecovery: () => setRecovering(false),
    refreshProfile: () => loadProfile(session?.user.id),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
