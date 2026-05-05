import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BellPlus,
  Building2,
  CheckCircle2,
  CreditCard,
  Globe2,
  Loader2,
  MonitorSmartphone,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  UserCog,
  Users,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { AdminLoginActivityEntry, AdminOrganizationRow, AdminUserDetail, AdminUserRow } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import MetricCard from '../components/MetricCard';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

const billingStatuses = ['trialing', 'active', 'past_due', 'cancelled', 'free', 'manual'];
const billingCycles = ['monthly', 'annual', 'manual'];
const plans = ['starter', 'growth', 'scale', 'enterprise', 'manual'];

function compactId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function getSelectedTitle(user: AdminUserRow | undefined) {
  if (!user) return 'User details';
  return user.companyName || user.fullName || user.email || compactId(user.userId);
}

function getUserRiskFlags(user: AdminUserRow) {
  const billingStatus = String(user.billingStatus || '').toLowerCase();
  const plan = String(user.selectedPlan || '').toLowerCase();
  const activity = user.counts.conversations + user.counts.calls + user.counts.emailCampaigns;
  const flags = [
    user.isBanned ? 'Banned' : null,
    ['past_due', 'suspended', 'cancelled'].includes(billingStatus) ? 'Billing risk' : null,
    ['free', 'trialing', 'none', ''].includes(plan) && activity > 100 ? 'High unpaid usage' : null,
    user.channels.length === 0 && user.counts.conversations > 10 ? 'No channels with chat activity' : null,
    user.counts.emailCampaigns > 50 ? 'Bulk email volume' : null,
  ];

  return flags.filter(Boolean) as string[];
}

function formatRawPayload(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value || '');
  }
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isFallbackLoginRecord(entry: AdminLoginActivityEntry) {
  return asRecord(entry.rawPayload).auditLogAvailable === false;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [organizations, setOrganizations] = useState<AdminOrganizationRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [manageUserId, setManageUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({
    selected_plan: 'manual',
    billing_cycle: 'monthly',
    billing_status: 'manual',
    trial_ends_at: '',
    coupon_code: '',
    razorpay_subscription_id: '',
    notifyUser: true,
  });
  const [creditForm, setCreditForm] = useState({
    type: 'addition' as 'addition' | 'deduction',
    amount: '100',
    description: 'Admin credit adjustment',
    notifyUser: true,
  });
  const [noticeForm, setNoticeForm] = useState({
    title: 'Message from Connektly support',
    body: '',
    targetPath: '/dashboard/home',
  });

  const loadUsers = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getUsers({ q: search, status, orgId: orgFilter });
      setUsers(response.users);
      setSelectedUserId((current) =>
        response.users.some((user) => user.userId === current)
          ? current
          : response.users[0]?.userId || null,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load users.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await adminApi.getOrganizations();
      setOrganizations(response.organizations);
    } catch {
      setOrganizations([]);
    }
  };

  const loadDetail = async (userId: string) => {
    try {
      setIsDetailLoading(true);
      const response = await adminApi.getUser(userId);
      setDetail(response);
      const profile = response.user.profile || {};
      setBillingForm({
        selected_plan: String(profile.selected_plan || 'manual'),
        billing_cycle: String(profile.billing_cycle || 'monthly'),
        billing_status: String(profile.billing_status || 'manual'),
        trial_ends_at: String(profile.trial_ends_at || '').slice(0, 10),
        coupon_code: String(profile.coupon_code || ''),
        razorpay_subscription_id: String(profile.razorpay_subscription_id || ''),
        notifyUser: true,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load user detail.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadOrganizations(), loadUsers()]);
  }, []);

  useEffect(() => {
    if (manageUserId) {
      setSelectedUserId(manageUserId);
      void loadDetail(manageUserId);
    } else {
      setDetail(null);
    }
  }, [manageUserId]);

  const summary = useMemo(() => {
    return {
      total: users.length,
      paid: users.filter((user) => String(user.billingStatus || '').toLowerCase() === 'active').length,
      banned: users.filter((user) => user.isBanned).length,
      connected: users.reduce((total, user) => total + user.channels.length, 0),
      risk: users.filter((user) => getUserRiskFlags(user).length > 0).length,
    };
  }, [users]);

  const selectedRow = users.find((user) => user.userId === selectedUserId);
  const riskUsers = users.filter((user) => getUserRiskFlags(user).length > 0).slice(0, 6);

  const openManageModal = (userId: string) => {
    setSelectedUserId(userId);
    setManageUserId(userId);
  };

  const saveBilling = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.updateUserProfile(selectedUserId, {
        ...billingForm,
        trial_ends_at: billingForm.trial_ends_at ? new Date(billingForm.trial_ends_at).toISOString() : null,
        coupon_code: billingForm.coupon_code || null,
        razorpay_subscription_id: billingForm.razorpay_subscription_id || null,
      });
      await Promise.all([loadUsers(), loadDetail(selectedUserId)]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update billing.');
    } finally {
      setIsSaving(false);
    }
  };

  const adjustCredits = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.adjustCredits(selectedUserId, {
        type: creditForm.type,
        amount: Number(creditForm.amount),
        description: creditForm.description,
        notifyUser: creditForm.notifyUser,
      });
      await Promise.all([loadUsers(), loadDetail(selectedUserId)]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to adjust credits.');
    } finally {
      setIsSaving(false);
    }
  };

  const sendNotice = async () => {
    if (!selectedUserId) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.sendNotice(selectedUserId, noticeForm);
      setNoticeForm((current) => ({ ...current, body: '' }));
      await loadDetail(selectedUserId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send notice.');
    } finally {
      setIsSaving(false);
    }
  };

  const setUserAuth = async (action: 'ban' | 'unban') => {
    if (!selectedUserId) return;
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.setUserAuth(selectedUserId, { action });
      await Promise.all([loadUsers(), loadDetail(selectedUserId)]);
    } catch (error) {
      setError(error instanceof Error ? error.message : `Failed to ${action} user.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Global Users"
        description="View all users across organizations, filter by org, and review abuse or spam risk signals."
        actions={
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Global users" value={formatNumber(summary.total)} detail="Filtered by current search and org" Icon={Users} tone="violet" />
        <MetricCard label="Active billing" value={formatNumber(summary.paid)} detail="Profiles marked active" Icon={CreditCard} tone="emerald" />
        <MetricCard label="Organizations" value={formatNumber(organizations.length)} detail="Available organization filters" Icon={Building2} tone="sky" />
        <MetricCard label="Risk flags" value={formatNumber(summary.risk)} detail={`${formatNumber(summary.banned)} banned users`} Icon={ShieldAlert} tone={summary.risk ? 'amber' : 'slate'} />
      </div>

      <Panel title="Abuse and spam detection" description="Heuristic review based on billing state, channel setup, usage volume, and ban state.">
        {riskUsers.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {riskUsers.map((user) => (
              <div key={user.userId} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">{user.fullName}</p>
                    <p className="mt-1 truncate text-xs text-gray-600">{user.companyName || user.email || user.userId}</p>
                  </div>
                  <StatusBadge status={user.isBanned ? 'banned' : user.billingStatus || 'review'} severity={user.isBanned ? 'critical' : 'warning'} compact />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {getUserRiskFlags(user).map((flag) => (
                    <span key={`${user.userId}-${flag}`} className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            No abuse or spam risk flags detected in the current user set.
          </div>
        )}
      </Panel>

      <Panel
        title="Global user directory"
        description="Click a row to open user detail, billing controls, credits, notices, and auth actions."
        action={
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadUsers();
                }}
                className="ml-2 w-56 bg-transparent text-sm outline-none"
                placeholder="Search users or orgs"
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All billing</option>
              {billingStatuses.map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
            <select
              value={orgFilter}
              onChange={(event) => setOrgFilter(event.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All orgs</option>
              {organizations.map((organization) => (
                <option key={organization.orgId} value={organization.orgId}>
                  {organization.orgName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadUsers()}
              className="rounded-2xl bg-[#111827] px-4 py-2 text-sm font-semibold text-white"
            >
              Apply
            </button>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex h-44 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            No users match the current filters.
          </div>
        ) : (
          <div className="thin-scrollbar overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Organization</th>
                  <th className="px-4 py-3 font-semibold">Billing</th>
                  <th className="px-4 py-3 font-semibold">Channels</th>
                  <th className="px-4 py-3 font-semibold">Activity</th>
                  <th className="px-4 py-3 font-semibold">Credits</th>
                  <th className="px-4 py-3 font-semibold">Risk</th>
                  <th className="px-4 py-3 font-semibold">Last sign in</th>
                  <th className="px-4 py-3 font-semibold">State</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {users.map((user) => {
                  const riskFlags = getUserRiskFlags(user);

                  return (
                    <tr key={user.userId} className="transition hover:bg-[#f8f7ff]">
                      <td className="px-4 py-4">
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate font-semibold text-gray-950">{user.fullName}</p>
                          <p className="mt-1 max-w-[260px] truncate text-xs text-gray-500">{user.email || 'No email'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate text-sm font-medium text-gray-800">{user.companyName || 'No organization'}</p>
                          <p className="mt-1 text-xs text-gray-500">{user.phone || compactId(user.userId)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <StatusBadge status={user.billingStatus || 'unknown'} compact />
                          <p className="text-xs text-gray-500">
                            {labelize(user.selectedPlan || 'no plan')} / {labelize(user.billingCycle || 'no cycle')}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-[220px] flex-wrap gap-1.5">
                          {user.channels.length > 0 ? (
                            user.channels.map((channel) => (
                              <span
                                key={`${user.userId}-${channel.type}`}
                                className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600"
                              >
                                {channel.type}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">No channels</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="grid w-[170px] grid-cols-3 gap-2 text-xs text-gray-500">
                          <span>
                            <strong className="block text-sm text-gray-950">{formatNumber(user.counts.conversations)}</strong>
                            chats
                          </span>
                          <span>
                            <strong className="block text-sm text-gray-950">{formatNumber(user.counts.calls)}</strong>
                            calls
                          </span>
                          <span>
                            <strong className="block text-sm text-gray-950">{formatNumber(user.counts.emailCampaigns)}</strong>
                            email
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-gray-950">{formatNumber(user.totalCredits)}</span>
                      </td>
                      <td className="px-4 py-4">
                        {riskFlags.length ? (
                          <div className="flex max-w-[220px] flex-wrap gap-1.5">
                            {riskFlags.slice(0, 2).map((flag) => (
                              <span key={`${user.userId}-${flag}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                                {flag}
                              </span>
                            ))}
                            {riskFlags.length > 2 ? <span className="text-xs text-gray-500">+{riskFlags.length - 2}</span> : null}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Clear</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-500">{formatDateTime(user.lastSignInAt)}</td>
                      <td className="px-4 py-4">
                        <StatusBadge
                          status={user.isBanned ? 'banned' : user.onboardingCompleted ? 'ready' : 'onboarding'}
                          severity={user.isBanned ? 'critical' : user.onboardingCompleted ? 'success' : 'warning'}
                          compact
                        />
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => openManageModal(user.userId)}
                          className="rounded-xl bg-[#111827] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1f2937]"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        title="Manage User"
        description={selectedRow ? `${getSelectedTitle(selectedRow)} | ${selectedRow.email || selectedRow.userId}` : 'User controls and detail view'}
        isOpen={Boolean(manageUserId)}
        onClose={() => setManageUserId(null)}
      >
        {selectedRow ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.72fr)]">
          <div className="space-y-6">
            <Panel
              title={getSelectedTitle(selectedRow)}
              description={`${selectedRow.email || selectedRow.userId} | Created ${formatDateTime(selectedRow.createdAt)}`}
              action={
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void setUserAuth(selectedRow.isBanned ? 'unban' : 'ban')}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                    selectedRow.isBanned ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {selectedRow.isBanned ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                  {selectedRow.isBanned ? 'Unban user' : 'Ban user'}
                </button>
              }
            >
              {isDetailLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
                </div>
              ) : detail ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Plan</p>
                      <p className="mt-2 text-base font-semibold text-gray-950">{labelize(selectedRow.selectedPlan || 'none')}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Last sign in</p>
                      <p className="mt-2 text-sm font-semibold text-gray-950">{formatDateTime(selectedRow.lastSignInAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Onboarding</p>
                      <p className="mt-2 text-base font-semibold text-gray-950">
                        {selectedRow.onboardingCompleted ? 'Complete' : 'Pending'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {Object.entries(asRecord(detail.user.channels)).map(([key, channel]) => {
                      const channelRecord = asRecord(channel);
                      return (
                      <div key={key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{labelize(key)}</p>
                        <div className="mt-3">
                          <StatusBadge status={channelRecord.status || 'not connected'} compact />
                        </div>
                        {Object.keys(channelRecord).length > 0 ? (
                          <p className="mt-2 truncate text-xs text-gray-500">
                            {String(channelRecord.phone_number_id || channelRecord.instagram_username || channelRecord.page_name || '')}
                          </p>
                        ) : null}
                      </div>
                    );
                    })}
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Conversations</p>
                      <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(asArray(detail.user.conversations).length)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Messages</p>
                      <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(asArray(detail.user.messages).length)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Calls</p>
                      <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(asArray(detail.user.calls).length)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Notices</p>
                      <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(asArray(detail.user.notifications).length)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                  Select a user to manage.
                </div>
              )}
            </Panel>

            <Panel title="Recent user activity">
              {detail ? (
                <div className="thin-scrollbar max-h-[360px] overflow-y-auto">
                  <div className="space-y-3">
                    {[
                      ...asArray(detail.user.messages).slice(0, 6).map((item) => ({
                        id: `message-${String(item.id)}`,
                        title: String(item.body || item.message_type || 'Message event'),
                        meta: `Message | ${formatDateTime(item.created_at)}`,
                      })),
                      ...asArray(detail.user.calls).slice(0, 6).map((item) => ({
                        id: `call-${String(item.id)}`,
                        title: `${labelize(item.type)} call`,
                        meta: `Call | ${formatDateTime(item.created_at)}`,
                      })),
                      ...asArray(detail.user.emailCampaigns).slice(0, 6).map((item) => ({
                        id: `email-${String(item.id)}`,
                        title: String(item.campaign_name || item.subject || 'Email campaign'),
                        meta: `Email | ${formatDateTime(item.created_at)}`,
                      })),
                    ]
                      .slice(0, 10)
                      .map((item) => (
                        <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <p className="line-clamp-1 text-sm font-semibold text-gray-950">{item.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{item.meta}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                  User activity appears after selecting a row.
                </div>
              )}
            </Panel>

            <Panel title="Login activity" description="Auth audit log with device, browser, IP, and raw event payloads.">
              {detail ? (
                asArray<AdminLoginActivityEntry>(detail.user.loginActivity).length ? (
                  <div className="thin-scrollbar max-h-[520px] space-y-3 overflow-y-auto">
                    {asArray<AdminLoginActivityEntry>(detail.user.loginActivity).map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={entry.eventType || 'auth event'} compact />
                              <span className="text-xs font-medium text-gray-500">{formatDateTime(entry.occurredAt)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                              <span className="inline-flex min-w-0 items-center gap-2">
                                <MonitorSmartphone className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="truncate">
                                  {isFallbackLoginRecord(entry)
                                    ? 'Only last sign-in timestamp is available'
                                    : `${entry.device || 'Device not recorded'} / ${entry.browser || 'Browser not recorded'} / ${entry.os || 'OS not recorded'}`}
                                </span>
                              </span>
                              <span className="inline-flex min-w-0 items-center gap-2">
                                <Globe2 className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="truncate">{isFallbackLoginRecord(entry) ? 'Apply auth audit RPC for IP details' : entry.ipAddress || 'IP not recorded by Supabase'}</span>
                              </span>
                            </div>
                            <p className="mt-3 break-words font-mono text-[11px] leading-5 text-gray-500">
                              {isFallbackLoginRecord(entry)
                                ? 'This row is a fallback from auth.users.last_sign_in_at, not a full auth audit log.'
                                : entry.userAgent || 'User agent not recorded in this auth event.'}
                            </p>
                          </div>
                        </div>
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-[#5b45ff]">View full log payload</summary>
                          <pre className="thin-scrollbar mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-white p-3 text-[11px] leading-5 text-gray-600">
                            {formatRawPayload(entry.rawPayload)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    No login activity was returned for this user.
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                  Select a user to view login activity.
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Billing controls">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Plan</span>
                  <select
                    value={billingForm.selected_plan}
                    onChange={(event) => setBillingForm((current) => ({ ...current, selected_plan: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                  >
                    {plans.map((plan) => (
                      <option key={plan} value={plan}>
                        {labelize(plan)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Cycle</span>
                    <select
                      value={billingForm.billing_cycle}
                      onChange={(event) => setBillingForm((current) => ({ ...current, billing_cycle: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                    >
                      {billingCycles.map((cycle) => (
                        <option key={cycle} value={cycle}>
                          {labelize(cycle)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</span>
                    <select
                      value={billingForm.billing_status}
                      onChange={(event) => setBillingForm((current) => ({ ...current, billing_status: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                    >
                      {billingStatuses.map((item) => (
                        <option key={item} value={item}>
                          {labelize(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Trial ends</span>
                  <input
                    type="date"
                    value={billingForm.trial_ends_at}
                    onChange={(event) => setBillingForm((current) => ({ ...current, trial_ends_at: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Coupon</span>
                  <input
                    value={billingForm.coupon_code}
                    onChange={(event) => setBillingForm((current) => ({ ...current, coupon_code: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                    placeholder="Optional"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Razorpay subscription</span>
                  <input
                    value={billingForm.razorpay_subscription_id}
                    onChange={(event) => setBillingForm((current) => ({ ...current, razorpay_subscription_id: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                    placeholder="sub_..."
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={billingForm.notifyUser}
                    onChange={(event) => setBillingForm((current) => ({ ...current, notifyUser: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                  />
                  Notify user in client dashboard
                </label>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveBilling()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                >
                  <UserCog className="h-4 w-4" />
                  Save billing
                </button>
              </div>
            </Panel>

            <Panel title="Credit adjustment">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={creditForm.type}
                    onChange={(event) => setCreditForm((current) => ({ ...current, type: event.target.value as 'addition' | 'deduction' }))}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                  >
                    <option value="addition">Add credits</option>
                    <option value="deduction">Deduct credits</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={creditForm.amount}
                    onChange={(event) => setCreditForm((current) => ({ ...current, amount: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                  />
                </div>
                <input
                  value={creditForm.description}
                  onChange={(event) => setCreditForm((current) => ({ ...current, description: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={creditForm.notifyUser}
                    onChange={(event) => setCreditForm((current) => ({ ...current, notifyUser: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                  />
                  Notify user
                </label>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void adjustCredits()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:opacity-60"
                >
                  <CreditCard className="h-4 w-4" />
                  Apply credits
                </button>
              </div>
            </Panel>

            <Panel title="Client dashboard notice">
              <div className="space-y-3">
                <input
                  value={noticeForm.title}
                  onChange={(event) => setNoticeForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                />
                <textarea
                  value={noticeForm.body}
                  onChange={(event) => setNoticeForm((current) => ({ ...current, body: event.target.value }))}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                  placeholder="Type a support notice..."
                />
                <input
                  value={noticeForm.targetPath}
                  onChange={(event) => setNoticeForm((current) => ({ ...current, targetPath: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={isSaving || !noticeForm.body.trim()}
                  onClick={() => void sendNotice()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                >
                  <BellPlus className="h-4 w-4" />
                  Send notice
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </Panel>
          </div>
          </div>
        ) : (
          <Panel title="User details">
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              Select a user to view details and actions.
            </div>
          </Panel>
        )}
      </Modal>
    </div>
  );
}
