import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Button, Card } from '../components/ui';
import { PrivacyText } from './PrivacyPage';

/** Shown once: users must accept the privacy notice before their data is processed (Law N° 058/2021). */
export function ConsentPage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ consent_at: new Date().toISOString() }).eq('id', profile!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
  }
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card title={<span className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" aria-hidden />Before you continue</span>}>
        <div className="max-h-[50dvh] overflow-y-auto pr-2"><PrivacyText /></div>
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 cursor-pointer accent-[var(--color-primary)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I have read the privacy notice and agree that my data is processed for this pilot as described.</span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
          <Button disabled={!checked} loading={busy} onClick={accept}>Accept and continue</Button>
        </div>
      </Card>
    </div>
  );
}
