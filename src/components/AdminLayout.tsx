import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpenText,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Gauge,
  Globe2,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Settings,
  SlidersHorizontal,
  ScrollText,
  Users,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useLiveEvents } from '../lib/liveEvents';
import { adminApi } from '../lib/adminApi';
import type { AdminAccessSummary, AdminPermissionKey } from '../lib/types';
import { formatShortTime, getInitials } from '../lib/format';
import BrandMark from './BrandMark';
import LiveEventFeed from './LiveEventFeed';
import Modal from './Modal';

type NavItem = { label: string; path: string; icon: LucideIcon; permissions?: AdminPermissionKey[] };
type NavSection = { id: string; title: string; icon: LucideIcon; items: NavItem[] };

const navSections = [
  {
    id: 'command',
    title: 'Command Center',
    icon: LayoutDashboard,
    items: [
      { label: 'Overview', path: '/dashboard', icon: LayoutDashboard, permissions: ['command_center'] },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    icon: Building2,
    items: [
      { label: 'Organization Management', path: '/dashboard/organizations', icon: Building2, permissions: ['organizations'] },
      { label: 'Global Users', path: '/dashboard/users', icon: Users, permissions: ['global_users'] },
    ],
  },
  {
    id: 'revenue',
    title: 'Revenue',
    icon: CreditCard,
    items: [
      { label: 'Plan Management', path: '/dashboard/plans', icon: CreditCard, permissions: ['plan_management'] },
      { label: 'Payments', path: '/dashboard/payments', icon: CreditCard, permissions: ['payments'] },
    ],
  },
  {
    id: 'client-app',
    title: 'Client App',
    icon: Boxes,
    items: [
      { label: 'Client Feature Operations', path: '/dashboard/client-features', icon: Boxes, permissions: ['global_integrations'] },
      { label: 'User Platform Settings', path: '/dashboard/platform-settings', icon: SlidersHorizontal, permissions: ['platform_settings'] },
      { label: 'Global Integrations', path: '/dashboard/global-integrations', icon: Globe2, permissions: ['global_integrations'] },
    ],
  },
  {
    id: 'website',
    title: 'Website Management',
    icon: BookOpenText,
    items: [
      { label: 'Blogs & Help Center', path: '/dashboard/website', icon: BookOpenText, permissions: ['website_management'] },
      { label: 'Lead Form Data', path: '/dashboard/website-leads', icon: Inbox, permissions: ['website_management'] },
    ],
  },
  {
    id: 'system',
    title: 'System & Security',
    icon: ScrollText,
    items: [
      { label: 'Webhook Manager', path: '/dashboard/webhooks', icon: Webhook, permissions: ['webhooks'] },
      {
        label: 'Logs & Monitoring',
        path: '/dashboard/logs-monitoring',
        icon: ScrollText,
        permissions: ['logs_monitoring', 'webhooks', 'server_status', 'security_audit'],
      },
      { label: 'Admin Profile', path: '/dashboard/settings', icon: Settings },
    ],
  },
] satisfies NavSection[];

type AdminLayoutProps = {
  adminEmail: string | null;
  adminAccess: AdminAccessSummary | null;
};

export default function AdminLayout({ adminEmail, adminAccess }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { events, status, unreadCount, clearUnread } = useLiveEvents();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() => new Set(['command']));
  const [ownerProfile, setOwnerProfile] = useState<{ fullName: string; avatarUrl: string | null } | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const displayName = ownerProfile?.fullName || adminEmail?.split('@')[0] || 'Owner';
  const avatarUrl = ownerProfile?.avatarUrl || null;
  const statusTone = status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-rose-400';
  const visibleNavSections = useMemo(() => {
    const canViewItem = (item: NavItem) =>
      !item.permissions || adminAccess?.isPrimaryOwner || item.permissions.some((permission) => adminAccess?.permissions.includes(permission));

    return navSections
      .map((section) => ({ ...section, items: section.items.filter(canViewItem) }))
      .filter((section) => section.items.length > 0);
  }, [adminAccess]);

  const isItemActive = (item: NavItem) =>
    location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
  const isSectionActive = (section: NavSection) => section.items.some(isItemActive);

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
    const activeSection = visibleNavSections.find(isSectionActive);
    if (!activeSection) return;

    setOpenSectionIds((current) => {
      if (current.has(activeSection.id)) return current;
      const next = new Set(current);
      next.add(activeSection.id);
      return next;
    });
  }, [location.pathname, visibleNavSections]);

  const toggleSection = (sectionId: string) => {
    setOpenSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

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

  const requestSignOut = () => {
    setMobileOpen(false);
    setSignOutDialogOpen(true);
  };

  const signOut = async () => {
    try {
      setIsSigningOut(true);
      await supabase.auth.signOut();
      setSignOutDialogOpen(false);
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  const sidebar = (
    <aside className="flex h-full w-72 flex-col border-r border-gray-800 bg-[#111827] text-gray-400">
      <div className="flex h-16 items-center justify-between border-b border-gray-800 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight text-white">Connektly</p>
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
          {visibleNavSections.map((section) => {
            const active = isSectionActive(section);
            const isOpen = openSectionIds.has(section.id);
            const SectionIcon = section.icon;

            if (section.items.length === 1) {
              const item = section.items[0];
              return (
                <NavLink
                  key={section.id}
                  to={item.path}
                  end={item.path === '/dashboard'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                      isActive ? 'bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/20' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <SectionIcon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            }

            return (
              <div key={section.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium transition ${
                    active ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <SectionIcon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
                    <span className="truncate">{section.title}</span>
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                </button>

                {isOpen ? (
                  <div className="space-y-1 pl-4">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/dashboard'}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                            isActive ? 'bg-[#5b45ff] text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
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
          onClick={requestSignOut}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-gray-300 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="admin-shell flex h-[100dvh] overflow-hidden bg-[#f3f4f6]">
      <div className="hidden md:block">{sidebar}</div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
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
                      <h3 className="mt-1 text-base font-semibold">Recent events</h3>
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

        <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(91,69,255,0.08),transparent_28rem)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      </div>
      <Modal
        title="Confirm sign out"
        description="Your current admin dashboard session will end."
        isOpen={signOutDialogOpen}
        onClose={() => {
          if (!isSigningOut) {
            setSignOutDialogOpen(false);
          }
        }}
        maxWidthClass="max-w-md"
      >
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm leading-6">Sign out of this admin account?</p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setSignOutDialogOpen(false)}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={isSigningOut}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Sign out
          </button>
        </div>
      </Modal>
    </>
  );
}
