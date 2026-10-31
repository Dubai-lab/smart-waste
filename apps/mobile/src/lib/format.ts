const tz = { timeZone: 'Africa/Kigali' } as const;
export const money = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('en')} RWF`);
export const time = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('en-GB', { ...tz, hour: '2-digit', minute: '2-digit' }) : '—');
export const day = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T12:00:00+02:00` : s).toLocaleDateString('en-GB', { ...tz, weekday: 'long', day: 'numeric', month: 'short' }) : '—');
export const dateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-GB', { ...tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const kigaliToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
