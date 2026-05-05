import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, ArrowLeft, Loader2, LogIn, Mail, UserPlus } from 'lucide-react';
import { adminApi, AdminApiError } from './lib/adminApi';
import { clientConfig, hasSupabaseConfig, hasTurnstileSiteKey } from './lib/config';
import { getCachedSession, supabase } from './lib/supabase';
import { LiveEventsProvider } from './lib/liveEvents';
import type { AdminAccessSummary } from './lib/types';
import AdminLayout from './components/AdminLayout';
import BrandMark from './components/BrandMark';
import TurnstileWidget from './components/TurnstileWidget';
import CommandCenter from './pages/CommandCenter';
import OrganizationsPage from './pages/OrganizationsPage';
import UsersPage from './pages/UsersPage';
import PlanManagementPage from './pages/PlanManagementPage';
import PlatformSettingsPage from './pages/PlatformSettingsPage';
import LogsMonitoringPage from './pages/LogsMonitoringPage';
import GlobalIntegrationsPage from './pages/GlobalIntegrationsPage';
import ClientFeatureOperationsPage from './pages/ClientFeatureOperationsPage';
import WebsiteManagementPage from './pages/WebsiteManagementPage';
import WebsiteLeadFormDataPage from './pages/WebsiteLeadFormDataPage';
import PaymentsPage from './pages/PaymentsPage';
import WebhooksPage from './pages/WebhooksPage';
import OwnerSettingsPage from './pages/OwnerSettingsPage';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6]">
      <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
    </div>
  );
}

function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111827] p-6">
      <div className="w-full max-w-lg rounded-[28px] border border-gray-800 bg-gray-900 p-8 text-white shadow-2xl">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-bold">Connektly Admin Control Centre</h1>
            <p className="text-sm text-gray-400">Environment setup required</p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm leading-6">
              Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to `.env`, then apply `supabase/admin_dashboard.sql`.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requestForm, setRequestForm] = useState({ fullName: '', email: '', phone: '' });
  const [mode, setMode] = useState<'sign-in' | 'request'>('sign-in');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    if (hasTurnstileSiteKey && !captchaToken) {
      setError('Security verification is still loading. Try again in a moment.');
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: hasTurnstileSiteKey ? { captchaToken: captchaToken || undefined } : undefined,
    });

    if (error) {
      setError(error.message);
      setCaptchaToken(null);
      setCaptchaResetKey((current) => current + 1);
    }
    setIsLoading(false);
  };

  const handleRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsRequesting(true);
    setError(null);
    setRequestMessage(null);

    try {
      const response = await fetch(`${clientConfig.adminApiBaseUrl}/access-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestForm),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to send request.');
      }
      setRequestMessage(payload.message || 'Request sent. The admin team will review it.');
      setRequestForm({ fullName: '', email: '', phone: '' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to send request.');
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] px-4 py-8">
      <div className="w-[min(calc(100%/1.1),28rem)] origin-center scale-110">
        <div className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="mb-7 flex items-center justify-center gap-4">
            <BrandMark className="h-14 w-14" />
            <div>
              <p className="text-xl font-bold leading-tight text-gray-950">Connektly</p>
              <p className="text-sm font-medium text-gray-500">Admin Control Centre</p>
            </div>
          </div>

          {hasTurnstileSiteKey ? (
            <TurnstileWidget
              siteKey={clientConfig.turnstile.siteKey}
              isLocalhost={clientConfig.turnstile.isLocalhost}
              token={captchaToken}
              onTokenChange={setCaptchaToken}
              resetKey={captchaResetKey}
              invisible
            />
          ) : null}

          {mode === 'sign-in' ? (
            <form onSubmit={handleSubmit}>
              <h1 className="text-center text-xl font-bold tracking-tight text-gray-950">Admin sign in</h1>
              <p className="mt-2 text-center text-sm leading-6 text-gray-500">Use your invited admin account to continue.</p>

              {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <label className="mt-6 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  placeholder="admin@connektly.in"
                  autoComplete="email"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Sign in
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('request');
                  setError(null);
                  setRequestMessage(null);
                }}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 hover:text-gray-950"
              >
                <UserPlus className="h-4 w-4" />
                Request to Join Admin Control Panel
              </button>
            </form>
          ) : (
            <form onSubmit={handleRequestSubmit}>
              <button
                type="button"
                onClick={() => {
                  setMode('sign-in');
                  setError(null);
                  setRequestMessage(null);
                }}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
              <div className="mt-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#5b45ff]">
                <Mail className="h-5 w-5" />
              </div>
              <h1 className="mt-5 text-xl font-bold tracking-tight text-gray-950">Request admin access</h1>
              <p className="mt-2 text-sm leading-6 text-gray-500">Send your details to the Connektly admin team for review.</p>

              {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
              {requestMessage ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{requestMessage}</div> : null}

              <label className="mt-6 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Name</span>
                <input
                  type="text"
                  required
                  value={requestForm.fullName}
                  onChange={(event) => setRequestForm((current) => ({ ...current, fullName: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  placeholder="Full name"
                  autoComplete="name"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Email</span>
                <input
                  type="email"
                  required
                  value={requestForm.email}
                  onChange={(event) => setRequestForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Number</span>
                <input
                  type="tel"
                  required
                  value={requestForm.phone}
                  onChange={(event) => setRequestForm((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </label>

              <button
                type="submit"
                disabled={isRequesting}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRequesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Submit request
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-gray-500">
          Admin access is invitation-only. No public sign up is available.
        </p>
      </div>
    </div>
  );
}

function ProtectedAdmin({
  session,
  children,
}: {
  session: Session | null;
  children: (email: string | null, access: AdminAccessSummary | null) => ReactNode;
}) {
  const location = useLocation();
  const sessionUserId = session?.user.id ?? null;
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [adminAccess, setAdminAccess] = useState<AdminAccessSummary | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [sessionRejected, setSessionRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!sessionUserId) {
        setAdminEmail(null);
        setAdminAccess(null);
        setSessionRejected(false);
        setError(null);
        setIsChecking(false);
        return;
      }

      try {
        setIsChecking(true);
        setError(null);
        const response = await adminApi.me();
        if (!cancelled) {
          setAdminEmail(response.admin.email);
          setAdminAccess(response.admin.access);
          setSessionRejected(false);
        }
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) {
          await supabase.auth.signOut();
          if (!cancelled) {
            setAdminEmail(null);
            setAdminAccess(null);
            setSessionRejected(true);
            setError(null);
          }
          return;
        }

        if (!cancelled) {
          const message =
            error instanceof AdminApiError || error instanceof Error
              ? error.message
              : 'Unable to verify owner access.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (sessionRejected) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isChecking) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] p-6">
        <div className="max-w-lg rounded-[28px] border border-gray-200 bg-white p-7 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-950">Owner access blocked</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">{error}</p>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="mt-6 rounded-2xl bg-[#111827] px-5 py-3 text-sm font-semibold text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children(adminEmail, adminAccess)}</>;
}

function isSameSession(left: Session | null, right: Session | null) {
  return (
    left?.user.id === right?.user.id &&
    left?.access_token === right?.access_token &&
    left?.expires_at === right?.expires_at
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = (nextSession: Session | null) => {
      setSession((currentSession) => (isSameSession(currentSession, nextSession) ? currentSession : nextSession));
    };

    getCachedSession().then((session) => {
      if (cancelled) return;
      applySession(session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (!hasSupabaseConfig()) {
    return <SetupRequired />;
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedAdmin session={session}>
              {(adminEmail, adminAccess) => (
                <LiveEventsProvider>
                  <AdminLayout adminEmail={adminEmail} adminAccess={adminAccess} />
                </LiveEventsProvider>
              )}
            </ProtectedAdmin>
          }
        >
          <Route index element={<CommandCenter />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="plans" element={<PlanManagementPage />} />
          <Route path="platform-settings" element={<PlatformSettingsPage />} />
          <Route path="logs-monitoring" element={<LogsMonitoringPage />} />
          <Route path="global-integrations" element={<GlobalIntegrationsPage />} />
          <Route path="client-features" element={<ClientFeatureOperationsPage />} />
          <Route path="website" element={<WebsiteManagementPage />} />
          <Route path="website-leads" element={<WebsiteLeadFormDataPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="server" element={<Navigate to="/dashboard/logs-monitoring" replace />} />
          <Route path="audit" element={<Navigate to="/dashboard/logs-monitoring" replace />} />
          <Route path="settings" element={<OwnerSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
