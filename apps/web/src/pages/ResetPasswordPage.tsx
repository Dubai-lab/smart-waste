import { useState, type FormEvent } from 'react';
import { KeyRound, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';

/** Shown after opening the link from a "reset your password" email. The link has already signed the user in. */
export function ResetPasswordPage() {
  const { session, finishRecovery, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    const confirm = String(f.get('confirm') ?? '');
    const errs: Record<string, string> = {};
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    else if (confirm !== password) errs.confirm = 'The two passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(/different from the old/i.test(error.message) ? 'Choose a password different from your old one.' : error.message);
      return;
    }
    toast.success('Password changed. You are signed in.');
    finishRecovery();
    navigate('/', { replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-lg font-semibold"><Leaf className="size-6 text-primary-strong" aria-hidden /> Smart Waste</div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mb-6 text-muted-fg">For {session?.user.email}. You will use it on the website and in the mobile app.</p>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="New password" required error={errors.password} hint="At least 8 characters">
            {(id, d) => <Input id={id} name="password" type="password" autoComplete="new-password" autoFocus aria-describedby={d} aria-invalid={!!errors.password} />}
          </Field>
          <Field label="Repeat new password" required error={errors.confirm}>
            {(id, d) => <Input id={id} name="confirm" type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={!!errors.confirm} />}
          </Field>
          <Button type="submit" loading={busy} icon={KeyRound}>Save new password</Button>
          <button type="button" className="min-h-9 cursor-pointer text-sm text-muted-fg hover:text-fg hover:underline" onClick={() => void signOut()}>
            Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  );
}
