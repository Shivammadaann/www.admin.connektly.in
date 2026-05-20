import { useEffect, useMemo, useState } from 'react';
import { BookOpenText, Inbox, LayoutDashboard, LayoutGrid, Loader2, LogOut, Menu, Settings, X, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { adminApi } from '../lib/adminApi';
import type { AdminAccessSummary, AdminPermissionKey } from '../lib/types';
import { getInitials } from '../lib/format';
import BrandMark from './BrandMark';

type WebsiteNavItem = { label: string; path: string; icon: LucideIcon; permissions?: AdminPermissionKey[] };

const websiteNavItems = [
  { label: 'Blogs & Help Center', path: '/website-management/content', icon: BookOpenText, permissions: ['website_management'] },
  { label: 'Lead Form Data', path: '/website-management/leads', icon: Inbox, permissions: ['website_management'] },
  { label: 'Admin Profile', path: '/dashboard/settings', icon: Settings },
] satisfies WebsiteNavItem[];

type WebsiteLayoutProps = {
  adminEmail: string | null;
  adminAccess: AdminAccessSummary | null;
};

export default function WebsiteLayout({ adminEmail, adminAccess }: WebsiteLayoutProps) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState<{ fullName: string; avatarUrl: string | null } | null>(null);
  const displayName = ownerProfile?.fullName || adminEmail?.split('@')[0] || 'Owner';
  const avatarUrl = ownerProfile?.avatarUrl || null;

  const visibleItems = useMemo(() => {
    const canViewItem = (item: WebsiteNavItem) =>
      !item.permissions || adminAccess?.isPrimaryOwner || item.permissions.some((permission) => adminAccess?.permissions.includes(permission));
    return websiteNavItems.filter(canViewItem);
  }, [adminAccess]);

  useEffect(() => {
    let cancelled = false;
    const loadOwnerProfile = async () => {
      try {
        const response = await adminApi.getOwnerSettings();
        if (!cancelled) {
          setOwnerProfile({
            fullName: response.profile.fullName,
            avatarUrl: response.profile.avatarUrl,
          });
        }
      } catch {
        // The layout can fall back to the authenticated email if settings are not ready.
      }
    };

    void loadOwnerProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    try {
      setIsSigningOut(true);
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  const sidebar = (
    <aside className="flex h-full w-72 flex-col border-r border-gray-200 bg-white text-gray-600">
      <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight text-gray-950">Manage Website</p>
            <p className="truncate text-xs font-medium text-gray-500">www.connektly.in</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-2">
          <NavLink
            to="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700 transition hover:border-[#5b45ff] hover:bg-[#f5f3ff] hover:text-[#5b45ff]"
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            Switch to Client Dashboard
          </NavLink>
          <NavLink
            to="/manage"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-600 transition hover:border-[#5b45ff] hover:bg-[#f5f3ff] hover:text-[#5b45ff]"
          >
            <LayoutGrid className="h-5 w-5 shrink-0" />
            Management selector
          </NavLink>

          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  isActive ? 'bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/20' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="border-t border-gray-100 p-3">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#5b45ff] text-sm font-bold text-white">
              {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : getInitials(displayName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-950">{displayName}</p>
              <p className="truncate text-xs text-gray-500">{adminEmail || 'Admin account'}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={isSigningOut}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="admin-shell flex h-[100dvh] overflow-hidden bg-[#f3f4f6]">
      <div className="hidden md:block">{sidebar}</div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close mobile menu"
          />
          <div className="relative z-10 h-full w-[min(88vw,22rem)] shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-950">Website Management</p>
              <p className="truncate text-xs text-gray-500">Public website content and lead operations</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Switch to Client Dashboard
            </button>
            <a
              href="https://www.connektly.in"
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Open website
            </a>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(91,69,255,0.08),transparent_28rem)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
