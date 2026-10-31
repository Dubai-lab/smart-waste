import { Component, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Inbox, Loader2, RefreshCw, X, XCircle, type LucideIcon } from 'lucide-react';

export const EASE = [0.22, 1, 0.36, 1] as const;
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ───────── Button ─────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const variants: Record<Variant, string> = {
  primary: 'bg-primary-strong text-white hover:bg-primary dark:text-bg',
  secondary: 'bg-card text-fg border border-border hover:bg-muted',
  ghost: 'text-fg hover:bg-muted',
  danger: 'bg-danger text-white hover:opacity-90',
  accent: 'bg-accent text-stone-900 hover:opacity-90',
};
export function Button({ variant = 'primary', loading, icon: Icon, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: LucideIcon }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50', variants[variant], className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

// ───────── Card ─────────
export function Card({ className, children, title, action, description }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <section className={cx('min-w-0 rounded-xl border border-border bg-card', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-fg">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-muted-fg">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ───────── Form fields ─────────
export function Field({ label, error, hint, required, children, id }: { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, describedBy?: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const desc = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fid} className="text-sm font-medium">
        {label} {required && <span className="text-danger" aria-hidden>*</span>}
      </label>
      {children(fid, desc)}
      {error ? <p id={`${fid}-err`} role="alert" className="text-xs text-danger">{error}</p>
        : hint ? <p id={`${fid}-hint`} className="text-xs text-muted-fg">{hint}</p> : null}
    </div>
  );
}
const inputCls = 'min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-fg placeholder:text-muted-fg/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 aria-[invalid=true]:border-danger';
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, 'cursor-pointer', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(inputCls, 'min-h-24 py-2', p.className)} />;

// ───────── Badges ─────────
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-fg',
  success: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  primary: 'bg-primary-soft text-primary-strong',
};
const toneIcon: Record<Tone, LucideIcon> = { neutral: CircleDashed, success: CheckCircle2, warning: Clock, danger: XCircle, info: Clock, primary: CheckCircle2 };
export function Badge({ tone = 'neutral', children, icon = true }: { tone?: Tone; children: ReactNode; icon?: boolean }) {
  const I = toneIcon[tone];
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {icon && <I className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  open: 'warning', in_progress: 'info', escalated: 'danger', resolved: 'success', rejected: 'neutral',
  unpaid: 'warning', pending: 'info', paid: 'success', waived: 'neutral', successful: 'success', failed: 'danger',
  planned: 'neutral', approved: 'info', completed: 'success', collected: 'success', missed: 'danger', skipped: 'neutral',
  booked: 'info', cancelled: 'neutral', scheduled: 'info', done: 'success', valid: 'success', invalid: 'danger',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

// ───────── States ─────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}
export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-2" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>;
}
export function EmptyState({ icon: Icon = Inbox, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Icon className="size-8 text-muted-fg" aria-hidden />
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-md text-sm text-muted-fg">{children}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900 dark:bg-red-950/40">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="font-medium">Could not load this</p>
      <p className="text-sm text-muted-fg">{error instanceof Error ? error.message : 'Unknown error'}</p>
      {retry && <Button variant="secondary" icon={RefreshCw} onClick={retry}>Try again</Button>}
    </div>
  );
}

/** Wraps a React Query result: loading → skeleton, error → retry, empty → message. */
export function QueryView<T>({ query, empty, children, loading }: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  empty?: { title: string; text?: string; when?: (d: T) => boolean; action?: ReactNode };
  loading?: ReactNode;
  children: (d: T) => ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <LoadingRows />}</>;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const d = query.data as T;
  const isEmpty = empty && (empty.when ? empty.when(d) : Array.isArray(d) && d.length === 0);
  if (isEmpty) return <EmptyState title={empty.title} action={empty.action}>{empty.text}</EmptyState>;
  return <>{children(d)}</>;
}

// ───────── Stat with count-up ─────────
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en') }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView || reduce) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduce]);
  return <span ref={ref} className="num">{format(shown)}</span>;
}

export function Stat({ label, value, format, icon: Icon, hint, tone = 'primary', index = 0 }: {
  label: string; value: number | null | undefined; format?: (n: number) => string; icon: LucideIcon; hint?: ReactNode; tone?: 'primary' | 'accent' | 'danger' | 'success'; index?: number;
}) {
  const reduce = useReducedMotion();
  const toneCls = { primary: 'bg-primary-soft text-primary-strong', accent: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', danger: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', success: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' }[tone];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: EASE }}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
    >
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-lg', toneCls)}><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">{label}</p>
        <p className="text-2xl font-semibold leading-tight">{value == null ? '—' : <CountUp value={value} format={format} />}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-fg">{hint}</p>}
      </div>
    </motion.div>
  );
}

// ───────── Modal ─────────
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog" aria-modal="true" aria-label={title}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: EASE } }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.18 } }}
            className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted"><X className="size-5" /></button>
            </header>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ───────── Table ─────────
export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-fg">
            {head.map((h, i) => <th key={i} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&>tr:hover]:bg-muted/50 [&_td]:px-3 [&_td]:py-2.5">{children}</tbody>
      </table>
    </div>
  );
}

// ───────── Error boundary ─────────
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('UI error', error); }
  render() {
    if (this.state.error) {
      return <ErrorState error={new Error(`${this.props.label ?? 'This section'} failed to display. ${this.state.error.message}`)} retry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-9 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors', value === o.value ? 'bg-card text-fg shadow-sm' : 'text-muted-fg hover:text-fg')}>
          {o.label}{o.count != null && <span className="num ml-1.5 text-xs text-muted-fg">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
