import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  BookOpenText,
  Boxes,
  Building2,
  CreditCard,
  Gauge,
  Globe2,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  SlidersHorizontal,
  ScrollText,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLiveEvents } from '../lib/liveEvents';
import { adminApi } from '../lib/adminApi';
import type { AdminAccessSummary, AdminPermissionKey } from '../lib/types';
import { formatShortTime, getInitials } from '../lib/format';
import BrandMark from './BrandMark';
import LiveEventFeed from './LiveEventFeed';

type NavItem = { label: string; path: string; icon: typeof LayoutDashboard; permissions?: AdminPermissionKey[] };

const navSections = [
  {
    title: null,
    items: [
      { label: 'Overview', path: '/dashboard', icon: LayoutDashboard, permissions: ['command_center'] },
      { label: 'Organization Management', path: '/dashboard/organizations', icon: Building2, permissions: ['organizations'] },
      { label: 'Global Users', path: '/dashboard/users', icon: Users, permissions: ['global_users'] },
      { label: 'Plan Management', path: '/dashboard/plans', icon: CreditCard, permissions: ['plan_management'] },
      { label: 'Payments', path: '/dashboard/payments', icon: CreditCard, permissions: ['payments'] },
      { label: 'User Platform Settings', path: '/dashboard/platform-settings', icon: SlidersHorizontal, permissions: ['platform_settings'] },
      { label: 'Global Integrations', path: '/dashboard/global-integrations', icon: Globe2, permissions: ['global_integrations'] },
      { label: 'Client Feature Operations', path: '/dashboard/client-features', icon: Boxes, permissions: ['global_integrations'] },
      { label: 'Admin Profile', path: '/dashboard/settings', icon: Settings },
    ],
  },
  {
    title: 'Website Management',
    items: [
      { label: 'Blogs & Help Center', path: '/dashboard/website', icon: BookOpenText, permissions: ['website_management'] },
      { label: 'Lead Form Data', path: '/dashboard/website-leads', icon: Inbox, permissions: ['website_management'] },
    ],
  },
  {
    title: 'Logs & Monitoring',
    items: [
      {
        label: 'Logs & Monitoring',
        path: '/dashboard/logs-monitoring',
        icon: ScrollText,
        permissions: ['logs_monitoring', 'webhooks', 'server_status', 'security_audit'],
      },
    ],
  },
] satisfies Array<{ title: string | null; items: NavItem[] }>;

type AdminLayoutProps = {
  adminEmail: string | null;
  adminAccess: AdminAccessSummary | null;
};

export default function AdminLayout({ adminEmail, adminAccess }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { events, status, unreadCount, clearUnread } = useLiveEvents();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState<{ fullName: string; avatarUrl: string | null } | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const displayName = ownerProfile?.fullName || adminEmail?.split('@')[0] || 'Owner';
  const avatarUrl = ownerProfile?.avatarUrl || null;
  const statusTone = status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-rose-400';
  const canViewItem = (item: NavItem) =>
    !item.permissions || adminAccess?.isPrimaryOwner || item.permissions.some((permission) => adminAccess?.permissions.includes(permission));
  const visibleNavSections = navSections
    .map((section) => ({ ...section, items: section.items.filter(canViewItem) }))
    .filter((section) => section.items.length > 0);

  const currentTime = useMemo(
    () =>
      new Date().toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [],
  );

  useEffect(() => {
    if (!feedOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!feedRef.current?.contains(event.target as Node)) {
        setFeedOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [feedOpen]);

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

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ fullName: string; avatarUrl: string | null }>).detail;
      if (detail) {
        setOwnerProfile({
          fullName: detail.fullName,
          avatarUrl: detail.avatarUrl,
        });
      }
    };

    void loadOwnerProfile();
    window.addEventListener('owner-profile-updated', handleProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('owner-profile-updated', handleProfileUpdated);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <aside className="flex h-full w-72 flex-col bg-[#111827] text-gray-400">
      <div className="flex h-16 items-center justify-between border-b border-gray-800 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xl font-bold tracking-tight text-white">Connektly</p>
            <p className="truncate text-xs font-medium text-gray-500">Admin Control Centre</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-800 hover:text-white md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
        <nav className="space-y-1">
          {visibleNavSections.map((section, sectionIndex) => (
            <div key={section.title || `main-${sectionIndex}`} className={sectionIndex === 0 ? 'space-y-1' : 'mt-5 space-y-1'}>
              {section.title ? (
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{section.title}</p>
              ) : null}
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/dashboard'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                      isActive ? 'bg-[#5b45ff] text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-gray-800 p-3">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#5b45ff] text-sm font-bold text-white">
              {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : getInitials(displayName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <p className="truncate text-xs text-gray-500">{adminEmail || 'Admin account'}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#f3f4f6]">
      <div className="hidden md:block">{sidebar}</div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
            aria-label="Close mobile menu"
          />
          <div className="relative z-10 h-full w-[min(88vw,22rem)] shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 bg-[#111827] px-4 text-white shadow-sm sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-300 transition hover:bg-gray-800 hover:text-white md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden min-w-0 max-w-xl flex-1 items-center rounded-xl bg-[#1f2937] px-4 py-2.5 text-gray-400 sm:flex">
              <Search className="h-5 w-5 shrink-0" />
              <input
                className="ml-3 min-w-0 flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-500"
                placeholder="Search users, webhooks, payments..."
              />
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-400 lg:flex">
              <span className={`h-2 w-2 rounded-full ${statusTone}`} />
              Live {status}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-gray-800 px-3 py-1.5 text-xs text-gray-400 lg:flex">
              <Gauge className="h-3.5 w-3.5" />
              {currentTime}
            </div>
            <div className="relative" ref={feedRef}>
              <button
                type="button"
                onClick={() => {
                  setFeedOpen((open) => !open);
                  clearUnread();
                }}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-300 transition hover:bg-gray-800 hover:text-white"
                aria-label="Open live events"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#5b45ff] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {feedOpen ? (
                <div className="absolute right-0 top-full z-40 mt-3 w-[min(92vw,430px)] rounded-[24px] border border-gray-200 bg-white p-4 text-gray-950 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Live stream</p>
                      <h3 className="mt-1 text-lg font-semibold">Recent events</h3>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500">
                      <Activity className="h-3.5 w-3.5" />
                      {events.length}
                    </div>
                  </div>
                  <LiveEventFeed events={events.slice(0, 12)} dense maxHeightClass="max-h-[440px]" />
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-l border-gray-800 pl-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-tight text-white">{displayName}</p>
                <p className="max-w-[160px] truncate text-xs text-gray-500">{adminEmail || 'Owner'}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#5b45ff] to-[#06b6d4] text-xs font-bold text-white">
                {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : getInitials(displayName)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
