import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Leaf } from 'lucide-react-native';
import { phoneRw } from '@sw/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Button, Chips, Field, Screen, Text } from '../components/ui';
import { useColors } from '../lib/theme';

export default function SignIn() {
  const c = useColors();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (mode !== 'reset' && form.password.length < 8) e.password = 'At least 8 characters';
    if (mode === 'signup') {
      if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name';
      if (form.phone && !phoneRw.safeParse(form.phone).success) e.phone = 'Use a Rwandan mobile number, e.g. 0788 123 456';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true); setNotice(null);
    try {
      if (mode === 'reset') {
        // The email link opens the website, where the new password is chosen; then sign in here with it.
        const web = process.env.EXPO_PUBLIC_WEB_URL;
        const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), web ? { redirectTo: web } : undefined);
        if (error) throw error;
        setNotice('Sent. If that email has an account, open the link in the email to choose a new password, then sign in here.');
        setMode('signin');
        return;
      }
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is incorrect' : error.message);
      } else {
        const phone = form.phone ? phoneRw.parse(form.phone) : '';
        const { data, error } = await supabase.auth.signUp({ email: form.email.trim(), password: form.password, options: { data: { full_name: form.full_name.trim(), phone, role: 'household' } } });
        if (error) throw error;
        if (!data.session) { setNotice('Account created. Confirm your email, then sign in.'); setMode('signin'); return; }
      }
      await refresh();
      router.replace('/');
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: c.primaryStrong, alignItems: 'center', justifyContent: 'center' }}><Leaf color="#fff" size={32} /></View>
          <Text variant="h1">Smart Waste</Text>
          <Text muted style={{ textAlign: 'center' }}>Report full bins, track the truck, pay and earn green points.</Text>
        </View>
        {mode === 'reset'
          ? <Text variant="title">Reset password</Text>
          : <Chips label="" value={mode} onChange={(m) => { setMode(m); setErrors({}); }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />}
        {mode === 'signup' && <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} error={errors.full_name} autoComplete="name" textContentType="name" />}
        {mode === 'signup' && <Field label="Phone (for MoMo and USSD)" value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" placeholder="0788 123 456" />}
        <Field label="Email" value={form.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        {mode !== 'reset' && <Field label="Password" value={form.password} onChangeText={set('password')} error={errors.password} secureTextEntry autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} textContentType={mode === 'signin' ? 'password' : 'newPassword'} hint={mode === 'signup' ? 'At least 8 characters' : undefined} />}
        {notice && <Text accessibilityRole="alert" color={/^(Account|Sent)/.test(notice) ? c.success : c.danger}>{notice}</Text>}
        <Button title={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'} onPress={submit} loading={busy} />
        {mode !== 'signup' && (
          <Button variant="ghost" title={mode === 'reset' ? 'Back to sign in' : 'Forgot your password?'} onPress={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setErrors({}); setNotice(null); }} />
        )}
        <Text variant="small" muted style={{ textAlign: 'center' }}>Collection crews: use the account given by your company.</Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
