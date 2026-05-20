import { ArrowRight, Globe2, LayoutDashboard, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { AdminAccessSummary, AdminPermissionKey } from '../lib/types';
import BrandMark from '../components/BrandMark';

type ManagementSelectorPageProps = {
  adminEmail: string | null;
  adminAccess: AdminAccessSummary | null;
};

function hasPermission(access: AdminAccessSummary | null, permission: AdminPermissionKey) {
  return Boolean(access?.isPrimaryOwner || access?.permissions.includes(permission));
}

export default function ManagementSelectorPage({ adminEmail, adminAccess }: ManagementSelectorPageProps) {
  const canManageClient = Boolean(adminAccess?.isPrimaryOwner || (adminAccess?.permissions.length || 0) > 0);
  const canManageWebsite = hasPermission(adminAccess, 'website_management');

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-8 text-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-11 w-11 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">Connektly Admin Control Centre</p>
              <p className="truncate text-sm text-gray-500">{adminEmail || 'Admin account'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </header>

        <main className="flex flex-1 items-center py-10">
          <div className="w-full">
            <div className="mb-8 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5b45ff]">Choose workspace</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">What do you want to manage?</h1>
              <p className="mt-3 text-base leading-7 text-gray-500">
                Pick the operating area for this session. Client dashboard tools and public website tools now stay separate.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Link
                to={canManageClient ? '/dashboard' : '#'}
                aria-disabled={!canManageClient}
                className={`group rounded-[28px] border bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)] ring-1 ring-white/70 transition ${
                  canManageClient ? 'border-gray-200 hover:-translate-y-0.5 hover:border-[#5b45ff]' : 'pointer-events-none border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dcd6ff] bg-[#f5f3ff] text-[#5b45ff]">
                    <LayoutDashboard className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 transition group-hover:translate-x-1 group-hover:text-[#5b45ff]" />
                </div>
                <h2 className="mt-6 text-xl font-bold text-gray-950">Manage Client Dashboard</h2>
                <p className="mt-2 text-sm font-semibold text-gray-500">www.app.connektly.in</p>
                <p className="mt-4 text-sm leading-6 text-gray-500">
                  Customers, users, payments, plans, integrations, logs, and client app platform operations.
                </p>
              </Link>

              <Link
                to={canManageWebsite ? '/website-management' : '#'}
                aria-disabled={!canManageWebsite}
                className={`group rounded-[28px] border bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)] ring-1 ring-white/70 transition ${
                  canManageWebsite ? 'border-gray-200 hover:-translate-y-0.5 hover:border-[#5b45ff]' : 'pointer-events-none border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                    <Globe2 className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 transition group-hover:translate-x-1 group-hover:text-[#5b45ff]" />
                </div>
                <h2 className="mt-6 text-xl font-bold text-gray-950">Manage Website</h2>
                <p className="mt-2 text-sm font-semibold text-gray-500">www.connektly.in</p>
                <p className="mt-4 text-sm leading-6 text-gray-500">
                  Public website blogs, Help Center content, media uploads, and website lead form submissions.
                </p>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
