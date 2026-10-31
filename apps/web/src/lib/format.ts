const rwf = new Intl.NumberFormat('en-RW', { maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => (n == null ? '—' : `${rwf.format(n)} RWF`);
export const num = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: d }).format(n);
export const km = (m: number | null | undefined) => (m == null ? '—' : `${(m / 1000).toFixed(1)} km`);
export const mins = (s: number | null | undefined) => (s == null ? '—' : `${Math.round(s / 60)} min`);
export const pct = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : `${Math.round(n * 100)}%`);
const tz = { timeZone: 'Africa/Kigali' } as const;
export const dateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('en-GB', { ...tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const date = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? `${s}T12:00:00+02:00` : s).toLocaleDateString('en-GB', { ...tz, day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const time = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleTimeString('en-GB', { ...tz, hour: '2-digit', minute: '2-digit' }) : '—';
export const kigaliToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export function relative(s: string) {
  const diff = (new Date(s).getTime() - Date.now()) / 60000;
  const abs = Math.abs(diff);
  const v = abs < 60 ? `${Math.round(abs)} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return diff >= 0 ? `in ${v}` : `${v} ago`;
}
