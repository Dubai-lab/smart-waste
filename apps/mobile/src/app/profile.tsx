import { useState } from 'react';
import type { Lang } from '@sw/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Button, Card, Chips, Field, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

export default function Profile() {
  const c = useColors();
  const { profile, refresh } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveLang(lang: Lang) {
    await supabase.from('profiles').update({ lang }).eq('id', profile!.id);
    await refresh();
  }
  async function save() {
    setBusy(true); setMsg(null);
    try {
      if (name.trim().length >= 2) await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id);
      if (pw) {
        if (pw.length < 8) throw new Error('New password must have at least 8 characters');
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) throw error;
        setPw('');
      }
      await refresh();
      setMsg({ ok: true, text: 'Saved' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }

  return (
    <Screen edges={[]}>
      <Card>
        <Chips label="Language / Ururimi / Langue" value={profile?.lang ?? 'en'} onChange={saveLang}
          options={[{ value: 'rw', label: 'Kinyarwanda' }, { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
      </Card>
      <Card>
        <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
        <Text variant="small" muted>{profile?.email} · {profile?.phone ?? 'no phone'}</Text>
        <Field label="New password (optional)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
        {msg && <Text color={msg.ok ? c.success : c.danger}>{msg.text}</Text>}
        <Button title="Save" onPress={save} loading={busy} />
      </Card>
    </Screen>
  );
}
