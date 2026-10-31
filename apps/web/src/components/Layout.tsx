import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Bell, Building2, ClipboardList, Gauge, Home, LogOut, Map, Menu, Moon, Recycle, Route, ScanLine,
  Settings, ShieldCheck, Sun, Truck, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS, type UserRole } from '@sw/shared';
import { useAuth } from '../lib/auth';
import { supabase, q } from '../lib/supabase';
import { relative } from '../lib/format';
import { useRealtimeInvalidate } from '../hooks/useRealtime';
import { EASE, ErrorBoundary } from './ui';

interface NavItem { to: string; label: string; icon: LucideIcon; roles: UserRole[] }
const NAV: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: Gauge, roles: ['manager', 'admin'] },
  { to: '/authority', label: 'Authority view', icon: ShieldCheck, roles: ['officer', 'manager', 'admin'] },
  { to: '/routes', label: 'Routes & planning', icon: Route, roles: ['manager', 'admin'] },
  { to: '/households', label: 'Households', icon: Home, roles: ['manager', 'admin'] },
  { to: '/pickups', label: 'Proof of service', icon: ScanLine, roles: ['manager', 'admin', 'officer'] },
  { to: '/complaints', label: 'Complaints', icon: ClipboardList, roles: ['manager', 'admin', 'officer'] },
  { to: '/billing', label: 'Billing', icon: Wallet, roles: ['manager', 'admin'] },
  { to: '/fleet', label: 'Zones & fleet', icon: Truck, roles: ['manager', 'admin'] },
  { to: '/recyclables', label: 'Recyclables', icon: Recycle, roles: ['manager', 'admin'] },
  { to: '/marketplace', label: 'Marketplace', icon: Recycle, roles: ['recycler'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['manager', 'admin', 'officer'] },
  { to: '/users', label: 'Users & roles', icon: Users, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

function NavList({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.filter((n) => n.roles.includes(role)).map((n) => (
        <NavLink key={n.to} to={n.to} onClick={onNavigate}
          className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-primary-soft text-primary-strong' : 'text-muted-fg hover:bg-muted hover:text-fg'}`}>
          <n.icon className="size-[18px]" aria-hidden />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <span className="grid size-9 place-items-center rounded-lg bg-primary-strong text-white"><Map className="size-5" aria-hidden /></span>
      <div className="leading-tight">
        <p className="font-semibold">Smart Waste</p>
        <p className="text-xs text-muted-fg">Kigali collection</p>
      </div>
    </div>
  );
}

function Notifications() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ['notifications', profile?.id];
  const list = useQuery({
    queryKey: key,
    enabled: !!profile,
    queryFn: () => q(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20)),
  });
  useRealtimeInvalidate(['notifications'], [key]);
  const unread = (list.data ?? []).filter((n: any) => !n.read_at).length;
  async function markAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    void qc.invalidateQueries({ queryKey: key });
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}
        className="relative grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted">
        <Bell className="size-5" />
        {unread > 0 && <span className="num absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="absolute right-0 z-[900] mt-2 w-80 rounded-xl border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <p className="font-semibold">Notifications</p>
              {unread > 0 && <button className="min-h-8 cursor-pointer text-xs font-medium text-primary-strong hover:underline" onClick={markAll}>Mark all read</button>}
            </div>
            <ul className="max-h-96 overflow-y-auto" aria-live="polite">
              {(list.data ?? []).length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-fg">No notifications yet</li>}
              {(list.data ?? []).map((n: any) => (
                <li key={n.id} className={`border-b border-border px-4 py-2.5 last:border-0 ${n.read_at ? '' : 'bg-primary-soft/40'}`}>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-fg">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted-fg">{relative(n.created_at)}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  return (
    <button aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted"
      onClick={() => { const d = !dark; setDark(d); document.documentElement.classList.toggle('dark', d); localStorage.setItem('theme', d ? 'dark' : 'light'); }}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); setDrawer(false); }, [loc.pathname]);
  if (!profile) return null;

  const userBox = (
    <div className="border-t border-border p-3">
      <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
      <p className="flex items-center gap-1 text-xs text-muted-fg"><Building2 className="size-3" aria-hidden />{ROLE_LABELS[profile.role]}{profile.officer_sector ? ` · ${profile.officer_sector}` : ''}</p>
      <button onClick={signOut} className="mt-2 flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-950/40">
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[2000] focus:m-2 focus:rounded focus:bg-card focus:p-2">Skip to content</a>
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="py-4"><Brand /></div>
        <div className="flex-1 overflow-y-auto px-3"><NavList role={profile.role} /></div>
        {userBox}
      </aside>

      <AnimatePresence>
        {drawer && (
          <div className="fixed inset-0 z-[1500] lg:hidden">
            <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0, transition: { duration: 0.28, ease: EASE } }} exit={{ x: -280, transition: { duration: 0.18 } }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card">
              <div className="flex items-center justify-between py-3 pr-2"><Brand /><button aria-label="Close menu" onClick={() => setDrawer(false)} className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted"><X className="size-5" /></button></div>
              <div className="flex-1 overflow-y-auto px-3"><NavList role={profile.role} onNavigate={() => setDrawer(false)} /></div>
              {userBox}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-[800] flex h-14 items-center gap-2 border-b border-border bg-card/90 px-3 backdrop-blur lg:px-6">
          <button aria-label="Open menu" onClick={() => setDrawer(true)} className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-muted lg:hidden"><Menu className="size-5" /></button>
          <div className="flex-1" />
          <ThemeToggle />
          <Notifications />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 p-4 outline-none lg:p-6">
          <ErrorBoundary key={loc.pathname} label="This page">{children}</ErrorBoundary>
        </main>
        <footer className="no-print border-t border-border px-6 py-3 text-xs text-muted-fg">
          Final year project prototype · Payments and USSD run in sandbox (test) mode · <a className="underline" href="/privacy">Privacy notice</a>
        </footer>
      </div>
    </div>
  );
}
