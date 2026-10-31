import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !anon) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set');

// Read before createClient strips the hash: password-reset links arrive as #...&type=recovery,
// expired or reused links as #error=...&error_description=...
const hash = new URLSearchParams(window.location.hash.slice(1));
export const recoveryLinkOpened = hash.get('type') === 'recovery';
export const authLinkError = hash.get('error_description')?.replace(/\+/g, ' ') ?? null;

/** One client for the whole app. Session is persisted in localStorage and refreshed automatically. */
export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
});

/** Throw on Supabase errors so React Query shows an error state instead of a blank screen. */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('evidence').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
