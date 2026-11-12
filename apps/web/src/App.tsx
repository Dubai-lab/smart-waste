import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { UserRole } from '@sw/shared';
import { useAuth } from './lib/auth';
import { authLinkError } from './lib/supabase';
import { Layout } from './components/Layout';
import { LoadingRows } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { ConsentPage } from './pages/ConsentPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const RoutesPage = lazy(() => import('./pages/RoutesPage'));
const HouseholdsPage = lazy(() => import('./pages/HouseholdsPage'));
const PickupsPage = lazy(() => import('./pages/PickupsPage'));
const SensorsPage = lazy(() => import('./pages/SensorsPage'));
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const FleetPage = lazy(() => import('./pages/FleetPage'));
const RecyclablesPage = lazy(() => import('./pages/RecyclablesPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AuthorityPage = lazy(() => import('./pages/AuthorityPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const MobileOnlyPage = lazy(() => import('./pages/MobileOnlyPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

const STAFF: UserRole[] = ['manager', 'admin'];

export function homeFor(role: UserRole) {
  return { manager: '/overview', admin: '/overview', officer: '/authority', recycler: '/marketplace', household: '/mobile', crew: '/mobile' }[role];
}

function Guard({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile) return null;
  return roles.includes(profile.role) ? <>{children}</> : <Navigate to={homeFor(profile.role)} replace />;
}

function FullScreenLoading() {
  return <div className="mx-auto mt-24 w-full max-w-md px-6" role="status" aria-label="Loading"><LoadingRows rows={4} /></div>;
}

export function App() {
  const { session, profile, loading, recovering } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (session && recovering) return <ResetPasswordPage />;

  if (!session) {
    return (
      <Suspense fallback={<FullScreenLoading />}>
        <Routes>
          <Route path="/" element={authLinkError ? <Navigate to="/login" replace /> : <LandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }
  if (!profile) return <FullScreenLoading />;
  if (!profile.consent_at) return <ConsentPage />;

  const page = (el: ReactNode, roles: UserRole[]) => <Guard roles={roles}>{el}</Guard>;
  return (
    <Layout>
      <Suspense fallback={<LoadingRows rows={6} />}>
        <Routes>
          <Route path="/overview" element={page(<OverviewPage />, STAFF)} />
          <Route path="/routes" element={page(<RoutesPage />, STAFF)} />
          <Route path="/households" element={page(<HouseholdsPage />, STAFF)} />
          <Route path="/sensors" element={page(<SensorsPage />, STAFF)} />
          <Route path="/pickups" element={page(<PickupsPage />, [...STAFF, 'officer'])} />
          <Route path="/complaints" element={page(<ComplaintsPage />, [...STAFF, 'officer'])} />
          <Route path="/billing" element={page(<BillingPage />, STAFF)} />
          <Route path="/fleet" element={page(<FleetPage />, STAFF)} />
          <Route path="/recyclables" element={page(<RecyclablesPage />, STAFF)} />
          <Route path="/marketplace" element={page(<RecyclablesPage />, ['recycler'])} />
          <Route path="/analytics" element={page(<AnalyticsPage />, [...STAFF, 'officer'])} />
          <Route path="/authority" element={page(<AuthorityPage />, [...STAFF, 'officer'])} />
          <Route path="/users" element={page(<UsersPage />, ['admin'])} />
          <Route path="/settings" element={page(<SettingsPage />, ['admin'])} />
          <Route path="/mobile" element={<MobileOnlyPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to={homeFor(profile.role)} replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
