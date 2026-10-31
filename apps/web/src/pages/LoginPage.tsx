import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Leaf, LogIn, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { authLinkError, supabase } from '../lib/supabase';
import { Button, EASE, Field, Input, Select, Tabs } from '../components/ui';

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!authLinkError) return;
    toast.error(/expired|invalid/i.test(authLinkError) ? 'That email link has expired or was already used. Request a new one.' : authLinkError);
    if (/expired|invalid/i.test(authLinkError)) setMode('reset');
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email') ?? '').trim();
    const password = String(f.get('password') ?? '');
    const errs: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Enter a valid email address, e.g. name@example.com';
    if (mode !== 'reset' && password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (mode === 'signup' && String(f.get('full_name') ?? '').trim().length < 2) errs.full_name = 'Enter your full name';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: String(f.get('full_name')).trim(), phone: String(f.get('phone') ?? ''), role: String(f.get('role')) } },
        });
        if (error) throw error;
        if (!data.session) toast.success('Account created. Check your email to confirm, then sign in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        toast.success('If that email is registered, a reset link is on its way.');
      }
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg === 'Invalid login credentials' ? 'Email or password is incorrect. Check them and try again.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary-strong p-10 text-white lg:flex">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold"><Leaf className="size-6" aria-hidden /> Smart Waste</Link>
        <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <h1 className="max-w-md text-4xl font-semibold leading-tight">Collect where it is needed. Prove every pickup.</h1>
          <p className="mt-4 max-w-md text-white/80">Demand-driven routes, QR + GPS proof of service, and green points that lower the monthly fee — without sensors.</p>
        </motion.div>
        <ul className="grid max-w-md grid-cols-3 gap-4 text-sm text-white/80">
          <li><span className="num block text-2xl font-semibold text-white">QR+GPS</span>verified pickups</li>
          <li><span className="num block text-2xl font-semibold text-white">VRP</span>optimised routes</li>
          <li><span className="num block text-2xl font-semibold text-white">USSD</span>basic phones</li>
        </ul>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-6 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-fg hover:text-fg"><ArrowLeft className="size-4" aria-hidden /> Back to home</Link>
          <h2 className="text-2xl font-semibold">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset password'}</h2>
          <p className="mb-5 text-muted-fg">Managers, officers and recyclers use this dashboard. Households and crews use the mobile app.</p>
          {mode !== 'reset' && (
            <div className="mb-5"><Tabs value={mode} onChange={(v) => { setMode(v); setErrors({}); }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} /></div>
          )}
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === 'signup' && (
              <>
                <Field label="Full name" required error={errors.full_name}>{(id, d) => <Input id={id} name="full_name" autoComplete="name" aria-describedby={d} aria-invalid={!!errors.full_name} />}</Field>
                <Field label="Phone (MTN/Airtel)" hint="Used for USSD and Mobile Money">{(id, d) => <Input id={id} name="phone" type="tel" autoComplete="tel" placeholder="0788 123 456" aria-describedby={d} />}</Field>
                <Field label="I am a">{(id) => (
                  <Select id={id} name="role" defaultValue="recycler">
                    <option value="recycler">Recycler / cooperative</option>
                    <option value="household">Household (resident)</option>
                  </Select>
                )}</Field>
              </>
            )}
            <Field label="Email" required error={errors.email}>{(id, d) => <Input id={id} name="email" type="email" autoComplete="email" aria-describedby={d} aria-invalid={!!errors.email} />}</Field>
            {mode !== 'reset' && (
              <Field label="Password" required error={errors.password} hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
                {(id, d) => <Input id={id} name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} aria-describedby={d} aria-invalid={!!errors.password} />}
              </Field>
            )}
            <Button type="submit" loading={busy} icon={mode === 'signup' ? UserPlus : LogIn}>
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
            <button type="button" className="min-h-9 cursor-pointer text-sm text-primary-strong hover:underline" onClick={() => setMode(mode === 'reset' ? 'signin' : 'reset')}>
              {mode === 'reset' ? 'Back to sign in' : 'Forgot your password?'}
            </button>
          </form>
          <p className="mt-6 text-xs text-muted-fg">By continuing you accept the <a className="underline" href="/privacy">privacy notice</a>. Staff accounts (manager, crew, officer) are created by the administrator.</p>
        </div>
      </div>
    </div>
  );
}
