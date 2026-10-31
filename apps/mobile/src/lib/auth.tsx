import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '@sw/shared';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  household: { id: string; label: string; zone_id: string | null; lat: number; lng: number } | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<AuthState['household']>(null);
  const [loading, setLoading] = useState(true);

  async function load(uid?: string) {
    if (!uid) { setProfile(null); setHousehold(null); return; }
    const { data: p, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (error) return; // keep previous state on transient network errors
    let h: AuthState['household'] = null;
    if (p.role === 'household') {
      const { data } = await supabase.from('households_geo').select('id, label, zone_id, lat, lng').eq('owner_id', uid).eq('active', true).limit(1).maybeSingle();
      h = data ?? null;
    }
    // Set both together: index.tsx routes as soon as a profile exists, so a household arriving later
    // would send an existing household to "Register your household".
    setHousehold(h);
    setProfile(p as Profile);
  }

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await load(data.session?.user.id);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN') void load(s?.user.id);
      if (event === 'SIGNED_OUT') { setProfile(null); setHousehold(null); }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <Ctx.Provider value={{ session, profile, household, loading, refresh: () => load(session?.user.id), signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
