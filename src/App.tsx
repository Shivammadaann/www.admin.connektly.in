import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { adminApi, AdminApiError } from './lib/adminApi';
import { clientConfig, hasSupabaseConfig, hasTurnstileSiteKey } from './lib/config';
import { getCachedSession, supabase } from './lib/supabase';
import { LiveEventsProvider } from './lib/liveEvents';
import AdminLayout from './components/AdminLayout';
import BrandMark from './components/BrandMark';
import TurnstileWidget from './components/TurnstileWidget';
import CommandCenter from './pages/CommandCenter';
import OrganizationsPage from './pages/OrganizationsPage';
import UsersPage from './pages/UsersPage';
import PaymentsPage from './pages/PaymentsPage';
import WebhooksPage from './pages/WebhooksPage';
import ServerStatusPage from './pages/ServerStatusPage';
import AuditPage from './pages/AuditPage';
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
            <h1 className="text-xl font-bold">Connektly Admin Control Centre</h1>
            <p className="text-sm text-gray-400">Environment setup required</p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm leading-6">
              Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and an admin allowlist to `.env`.
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    if (hasTurnstileSiteKey && !captchaToken) {
      setError('Complete the security check before logging in.');
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

  return (
    <div className="grid min-h-screen bg-[#f3f4f6] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="hidden bg-[#111827] p-8 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <p className="text-xl font-bold">Connektly</p>
            <p className="text-sm text-gray-400">Owner control plane</p>
          </div>
        </div>

        <div className="mt-auto max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Super admin
          </div>
          <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight">
            Payments, users, webhooks, and server health in one live cockpit.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-gray-400">
            Built for Connektly operators who need direct visibility into every workspace and realtime client dashboard activity.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark className="h-9 w-9" />
            <div>
              <p className="text-lg font-bold text-gray-950">Connektly</p>
              <p className="text-xs text-gray-500">Admin Control Centre</p>
            </div>
          </div>

          <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#5b45ff]">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-gray-950">Owner sign in</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">Use a Supabase account that is included in the owner allowlist.</p>

          {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <label className="mt-6 block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              placeholder="owner@connektly.in"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
              placeholder="Password"
            />
          </label>

          {hasTurnstileSiteKey ? (
            <div className="mt-5">
              <TurnstileWidget
                siteKey={clientConfig.turnstile.siteKey}
                isLocalhost={clientConfig.turnstile.isLocalhost}
                token={captchaToken}
                onTokenChange={setCaptchaToken}
                resetKey={captchaResetKey}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </button>
        </form>
      </section>
    </div>
  );
}

function ProtectedAdmin({ session, children }: { session: Session | null; children: (email: string | null) => ReactNode }) {
  const location = useLocation();
  const sessionUserId = session?.user.id ?? null;
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!sessionUserId) {
        setAdminEmail(null);
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
        }
      } catch (error) {
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

  if (isChecking) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6] p-6">
        <div className="max-w-lg rounded-[28px] border border-gray-200 bg-white p-7 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-4 text-2xl font-bold text-gray-950">Owner access blocked</h1>
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

  return <>{children(adminEmail)}</>;
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
              {(adminEmail) => (
                <LiveEventsProvider>
                  <AdminLayout adminEmail={adminEmail} />
                </LiveEventsProvider>
              )}
            </ProtectedAdmin>
          }
        >
          <Route index element={<CommandCenter />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="server" element={<ServerStatusPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<OwnerSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
