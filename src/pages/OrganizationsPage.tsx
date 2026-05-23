import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  CreditCard,
  ExternalLink,
  Loader2,
  LogIn,
  MessageCircle,
  RefreshCcw,
  ShieldAlert,
  Smartphone,
  Trash2,
  TrendingUp,
  UserCheck,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { AdminOrganizationDetail, AdminOrganizationsResponse } from '../lib/types';
import { formatCurrency, formatDateTime, formatNumber, labelize } from '../lib/format';
import LiveEventFeed from '../components/LiveEventFeed';
import MetricCard from '../components/MetricCard';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

const planOptions = ['starter', 'growth', 'scale', 'enterprise', 'manual'];
const statusOptions = ['all', 'active', 'trialing', 'past_due', 'suspended', 'banned', 'deleted', 'setup'];

function statusSeverity(status: string) {
  const value = status.toLowerCase();
  if (['active', 'trialing', 'ready'].includes(value)) return 'success' as const;
  if (['past_due', 'suspended', 'setup'].includes(value)) return 'warning' as const;
  if (['banned', 'deleted', 'cancelled'].includes(value)) return 'critical' as const;
  return 'info' as const;
}

function planRank(plan: string) {
  const order = ['free', 'starter', 'growth', 'scale', 'enterprise'];
  const index = order.indexOf(plan.toLowerCase());
  return index === -1 ? 0 : index;
}

export default function OrganizationsPage() {
  const [data, setData] = useState<AdminOrganizationsResponse | null>(null);
  const [detail, setDetail] = useState<AdminOrganizationDetail | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [manageOrgId, setManageOrgId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [plan, setPlan] = useState('all');
  const [planDraft, setPlanDraft] = useState('growth');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedOrganization = data?.organizations.find((organization) => organization.orgId === selectedOrgId) || null;

  const loadOrganizations = async (showLoader = true) => {
    try {
      setError(null);
      if (showLoader) setIsLoading(true);
      const response = await adminApi.getOrganizations({ q: search, status, plan });
      setData(response);
      setSelectedOrgId((current) =>
        current && response.organizations.some((organization) => organization.orgId === current)
          ? current
          : response.organizations[0]?.orgId || null,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load organizations.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (orgId: string) => {
    try {
      setIsDetailLoading(true);
      const response = await adminApi.getOrganization(orgId);
      setDetail(response);
      setPlanDraft(response.organization.plan === 'none' ? 'starter' : response.organization.plan);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load organization detail.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadOrganizations();
  }, []);

  useEffect(() => {
    if (manageOrgId) {
      setSelectedOrgId(manageOrgId);
      void loadDetail(manageOrgId);
    } else {
      setDetail(null);
    }
  }, [manageOrgId]);

  const runAction = async (
    action:
      | 'suspend'
      | 'activate'
      | 'delete'
      | 'ban'
      | 'unban'
      | 'update_plan'
      | 'impersonate'
      | 'check_webhook'
      | 'activate_webhook'
      | 'deactivate_webhook'
      | 'unsubscribe_webhook'
      | 'disconnect_waba'
      | 'disconnect_messenger'
      | 'disconnect_instagram'
      | 'request_phone_code',
    payload: Record<string, unknown> = {},
    orgIdOverride?: string,
  ) => {
    const targetOrgId = orgIdOverride || selectedOrgId;
    if (!targetOrgId) return;
    if (action === 'delete' && !window.confirm('Soft delete this organization by marking it deleted?')) return;
    if (action === 'unsubscribe_webhook' && !window.confirm('Unsubscribe WhatsApp webhooks for this organization?')) return;
    if (action === 'disconnect_waba' && !window.confirm('Disconnect this organization WABA account and remove its WhatsApp templates from the admin database?')) return;
    if (action === 'disconnect_messenger' && !window.confirm('Disconnect this organization Messenger channel?')) return;
    if (action === 'disconnect_instagram' && !window.confirm('Disconnect this organization Instagram channel?')) return;

    try {
      setActionLoading(action);
      setError(null);
      setNotice(null);
      const response = await adminApi.runOrganizationAction(targetOrgId, {
        action,
        ...payload,
      });

      if (response.detail) {
        setDetail(response.detail);
        setPlanDraft(response.detail.organization.plan === 'none' ? 'starter' : response.detail.organization.plan);
      }

      if (response.impersonation) {
        if (response.impersonation.actionLink) {
          window.open(response.impersonation.actionLink, '_blank', 'noopener,noreferrer');
          setNotice(`Impersonation link opened for ${response.impersonation.email}.`);
        } else {
          setNotice(`Impersonation link could not be generated for ${response.impersonation.email}.`);
        }
      } else {
        setNotice(`${labelize(action)} action completed.`);
      }

      await loadOrganizations(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Organization action failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const planDirection = useMemo(() => {
    if (!detail) return 'Update plan';
    return planRank(planDraft) >= planRank(detail.organization.plan) ? 'Upgrade plan' : 'Downgrade plan';
  }, [detail, planDraft]);

  const openManageModal = (orgId: string) => {
    setSelectedOrgId(orgId);
    setManageOrgId(orgId);
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Organization Management"
        description="Manage workspace organizations, support access, plan state, abuse risk, and billing activity."
        actions={
          <button
            type="button"
            onClick={() => void loadOrganizations()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Organizations" value={formatNumber(data.summary.total)} detail="Workspace profiles under management" Icon={Building2} tone="violet" />
            <MetricCard label="Active orgs" value={formatNumber(data.summary.active)} detail={`${formatNumber(data.summary.suspended)} restricted`} Icon={UserCheck} tone="emerald" />
            <MetricCard label="Revenue" value={formatCurrency(data.summary.revenue)} detail="Recorded payment webhook value" Icon={CreditCard} tone="sky" />
            <MetricCard label="Risk review" value={formatNumber(data.summary.risk)} detail="Billing, ban, or usage flags" Icon={ShieldAlert} tone={data.summary.risk ? 'amber' : 'slate'} />
          </div>

          <Panel
            title="Organizations"
            description="Table view for organization operations, support login, plan changes, and account controls."
            action={
              <div className="flex flex-col gap-2 lg:flex-row">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void loadOrganizations();
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none lg:w-56"
                  placeholder="Search organizations"
                />
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
                >
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>
                      {item === 'all' ? 'All status' : labelize(item)}
                    </option>
                  ))}
                </select>
                <select
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none"
                >
                  <option value="all">All plans</option>
                  {planOptions.map((item) => (
                    <option key={item} value={item}>
                      {labelize(item)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadOrganizations()}
                  className="rounded-2xl bg-[#111827] px-4 py-2 text-sm font-semibold text-white"
                >
                  Apply
                </button>
              </div>
            }
          >
            {data.organizations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                No organizations match the current filters.
              </div>
            ) : (
              <div className="thin-scrollbar overflow-x-auto rounded-2xl border border-gray-200">
                <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-[0.16em] text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Org Name</th>
                      <th className="px-4 py-3 font-semibold">Website</th>
                      <th className="px-4 py-3 font-semibold">WhatsApp</th>
                      <th className="px-4 py-3 font-semibold">Message Tier</th>
                      <th className="px-4 py-3 font-semibold">Plan</th>
                      <th className="px-4 py-3 font-semibold">Users</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Revenue</th>
                      <th className="px-4 py-3 font-semibold">Created</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {data.organizations.map((organization) => {
                      return (
                        <tr key={organization.orgId}>
                          <td className="px-4 py-4">
                            <div className="max-w-[280px]">
                              <span className="block truncate font-semibold text-gray-950">{organization.orgName}</span>
                              <span className="mt-1 block truncate text-xs text-gray-500">{organization.ownerEmail || organization.ownerUserId}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {organization.companyWebsite ? (
                              <a
                                href={organization.companyWebsite.startsWith('http') ? organization.companyWebsite : `https://${organization.companyWebsite}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-[180px] items-center gap-1 truncate text-xs font-semibold text-[#5b45ff] hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{organization.companyWebsite}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Not set</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="max-w-[180px]">
                              <span className="block truncate font-semibold text-gray-950">
                                {organization.whatsapp?.displayPhoneNumber || organization.whatsapp?.phoneNumberId || 'Not linked'}
                              </span>
                              <span className="mt-1 block truncate text-xs text-gray-500">
                                {organization.whatsapp?.verifiedName || organization.whatsapp?.businessAccountName || 'Embedded signup details'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge status={organization.whatsapp?.messagingLimitTier || 'Unknown'} severity="info" compact />
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-semibold text-gray-950">{labelize(organization.plan)}</div>
                            <div className="mt-1 text-xs text-gray-500">{labelize(organization.billingCycle || 'no cycle')}</div>
                          </td>
                          <td className="px-4 py-4 text-gray-700">{formatNumber(organization.userCount)}</td>
                          <td className="px-4 py-4">
                            <div className="space-y-2">
                              <StatusBadge status={organization.status} severity={statusSeverity(organization.status)} compact />
                              {organization.riskFlags.length ? (
                                <p className="text-xs text-amber-700">{organization.riskFlags.length} risk flag</p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 font-semibold text-gray-950">{formatCurrency(organization.revenue)}</td>
                          <td className="px-4 py-4 text-xs text-gray-500">{formatDateTime(organization.createdAt)}</td>
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => openManageModal(organization.orgId)}
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
            title="Manage Organization"
            description={selectedOrganization?.orgName || 'Organization controls and detail view'}
            isOpen={Boolean(manageOrgId)}
            onClose={() => setManageOrgId(null)}
          >
            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-6">
              <Panel title="Organization actions" description={selectedOrganization?.orgName || 'Select an organization'}>
                {selectedOrganization ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm font-semibold text-gray-950">{selectedOrganization.ownerName}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">{selectedOrganization.ownerEmail || selectedOrganization.ownerUserId}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedOrganization.channels.length ? (
                          selectedOrganization.channels.map((channel) => (
                            <span key={`${selectedOrganization.orgId}-${channel.type}`} className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
                              {channel.type}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">No connected channels</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => void runAction('impersonate')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <LogIn className="h-4 w-4" />
                        Impersonate login
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => void runAction(selectedOrganization.status.toLowerCase() === 'suspended' ? 'activate' : 'suspend')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {selectedOrganization.status.toLowerCase() === 'suspended' ? 'Activate org' : 'Suspend org'}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => void runAction(selectedOrganization.isBanned ? 'unban' : 'ban')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1f2937] disabled:opacity-60"
                      >
                        <Ban className="h-4 w-4" />
                        {selectedOrganization.isBanned ? 'Unban org' : 'Ban org'}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => void runAction('delete')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete org
                      </button>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Plan control</span>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <select
                          value={planDraft}
                          onChange={(event) => setPlanDraft(event.target.value)}
                          className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none"
                        >
                          {planOptions.map((item) => (
                            <option key={item} value={item}>
                              {labelize(item)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() =>
                            void runAction('update_plan', {
                              selectedPlan: planDraft,
                              billingStatus: 'active',
                            })
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4c38e0] disabled:opacity-60"
                        >
                          <TrendingUp className="h-4 w-4" />
                          {planDirection}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    Select an organization to manage actions.
                  </div>
                )}
              </Panel>

              <Panel title="Risk and abuse signals">
                {selectedOrganization ? (
                  selectedOrganization.riskFlags.length ? (
                    <div className="space-y-3">
                      {selectedOrganization.riskFlags.map((flag) => (
                        <div key={flag} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                          {flag}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      No risk flags detected for this organization.
                    </div>
                  )
                ) : (
                  <div className="text-sm text-gray-500">Select an organization to review risk signals.</div>
                )}
              </Panel>

              <Panel title="WhatsApp Business Number" description="Admin-only Meta channel details and webhook controls">
                {selectedOrganization?.whatsapp ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">
                            {selectedOrganization.whatsapp.displayPhoneNumber || selectedOrganization.whatsapp.phoneNumberId}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            {selectedOrganization.whatsapp.verifiedName || selectedOrganization.whatsapp.businessAccountName || 'WhatsApp sender'}
                          </p>
                        </div>
                        <MessageCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                      </div>
                      <div className="mt-4">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('disconnect_waba')}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                          Disconnect WABA account
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 text-xs text-gray-600">
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-400">WABA ID</span>
                          <span className="min-w-0 truncate font-mono">{selectedOrganization.whatsapp.wabaId || 'Not available'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-400">Phone Number ID</span>
                          <span className="min-w-0 truncate font-mono">{selectedOrganization.whatsapp.phoneNumberId || 'Not available'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-400">Message tier</span>
                          <span className="font-semibold text-gray-950">{selectedOrganization.whatsapp.messagingLimitTier || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-400">Quality</span>
                          <span className="font-semibold text-gray-950">{selectedOrganization.whatsapp.qualityRating || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-400">Last synced</span>
                          <span>{formatDateTime(selectedOrganization.whatsapp.lastSyncedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-950">Incoming webhooks</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {selectedOrganization.whatsapp.webhookSubscription.callbackUrl || 'Callback not checked yet'}
                          </p>
                        </div>
                        <StatusBadge
                          status={selectedOrganization.whatsapp.webhookSubscription.isSubscribed ? 'Subscribed' : 'Needs attention'}
                          severity={selectedOrganization.whatsapp.webhookSubscription.isSubscribed ? 'success' : 'warning'}
                          compact
                        />
                      </div>
                      {selectedOrganization.whatsapp.webhookSubscription.lastError ? (
                        <p className="mt-3 text-sm text-rose-600">{selectedOrganization.whatsapp.webhookSubscription.lastError}</p>
                      ) : null}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('check_webhook')}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                        >
                          <RefreshCcw className="h-4 w-4" />
                          Check status
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('activate_webhook')}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4c38e0] disabled:opacity-60"
                        >
                          <Webhook className="h-4 w-4" />
                          Activate
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('deactivate_webhook')}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Deactivate
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('unsubscribe_webhook')}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          Unsubscribe
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-950">Phone verification code</p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            Meta can send a one-time code to {selectedOrganization.whatsapp.displayPhoneNumber || selectedOrganization.whatsapp.phoneNumberId}.
                            This only starts verification; the code confirmation step still happens in Meta.
                          </p>
                        </div>
                        <Smartphone className="h-5 w-5 shrink-0 text-sky-600" />
                      </div>
                      {selectedOrganization.whatsapp.verificationCodeRequest.lastRequestedAt ? (
                        <p className="mt-3 text-xs text-gray-500">
                          Last requested by {selectedOrganization.whatsapp.verificationCodeRequest.codeMethod || 'unknown method'} on{' '}
                          {formatDateTime(selectedOrganization.whatsapp.verificationCodeRequest.lastRequestedAt)}.
                        </p>
                      ) : null}
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('request_phone_code', { codeMethod: 'SMS', language: 'en_US' })}
                          className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Request by SMS
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => void runAction('request_phone_code', { codeMethod: 'VOICE', language: 'en_US' })}
                          className="inline-flex items-center justify-center rounded-2xl bg-[#111827] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1f2937] disabled:opacity-60"
                        >
                          Request by voice
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-950">Two-step verification</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {selectedOrganization.whatsapp.twoStepVerification.lastPinUpdatedAt
                              ? `Last PIN update: ${formatDateTime(selectedOrganization.whatsapp.twoStepVerification.lastPinUpdatedAt)}`
                              : 'No PIN update timestamp stored.'}
                          </p>
                        </div>
                        <StatusBadge
                          status={selectedOrganization.whatsapp.twoStepVerification.isEnabled ? 'Enabled' : 'Not enabled'}
                          severity={selectedOrganization.whatsapp.twoStepVerification.isEnabled ? 'success' : 'info'}
                          compact
                        />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-gray-500">
                        <span>Sender registered: {formatDateTime(selectedOrganization.whatsapp.senderRegistration.registeredAt)}</span>
                        <span>Display name status: {selectedOrganization.whatsapp.displayName.status || 'Unknown'}</span>
                        <span>Access token: {selectedOrganization.whatsapp.accessTokenLast4 ? `...${selectedOrganization.whatsapp.accessTokenLast4}` : 'Not available'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    No WhatsApp Business number is linked through Embedded Sign Up for this organization.
                  </div>
                )}
              </Panel>

              <Panel title="Social Channels" description="Messenger and Instagram channel controls">
                {selectedOrganization ? (
                  <div className="space-y-4">
                    {selectedOrganization.channels.some(c => c.type === 'Messenger' || c.type === 'Facebook' || c.type === 'Instagram') ? (
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {selectedOrganization.channels.some(c => c.type === 'Messenger' || c.type === 'Facebook') && (
                            <button
                              type="button"
                              disabled={Boolean(actionLoading)}
                              onClick={() => void runAction('disconnect_messenger')}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              Disconnect Messenger
                            </button>
                          )}
                          {selectedOrganization.channels.some(c => c.type === 'Instagram') && (
                            <button
                              type="button"
                              disabled={Boolean(actionLoading)}
                              onClick={() => void runAction('disconnect_instagram')}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              Disconnect Instagram
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                        No Messenger or Instagram channels are linked for this organization.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Select an organization to manage social channels.</div>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel title="Org Detail View" description={detail ? `Generated ${formatDateTime(detail.generatedAt)}` : undefined}>
                {isDetailLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[#5b45ff]" />
                  </div>
                ) : detail ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Conversations</p>
                        <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(detail.usageStats.conversations)}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">API Usage</p>
                        <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(detail.usageStats.apiUsage)}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Messages</p>
                        <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(detail.usageStats.messages)}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Webhooks</p>
                        <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(detail.usageStats.webhookEvents)}</p>
                      </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-950">Members</h3>
                        <div className="mt-3 space-y-3">
                          {detail.members.map((member) => (
                            <div key={member.userId} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                              <p className="truncate text-sm font-semibold text-gray-950">{member.fullName}</p>
                              <p className="mt-1 truncate text-xs text-gray-500">{member.email || member.userId}</p>
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <StatusBadge status={member.isBanned ? 'banned' : member.billingStatus || 'active'} severity={member.isBanned ? 'critical' : statusSeverity(member.billingStatus || 'active')} compact />
                                <span className="text-xs text-gray-500">{formatNumber(member.counts.conversations)} conversations</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-gray-950">Billing history</h3>
                        <div className="thin-scrollbar mt-3 max-h-[320px] space-y-3 overflow-y-auto">
                          {detail.billingHistory.length ? (
                            detail.billingHistory.map((entry) => (
                              <div key={`${entry.type}-${entry.id}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-gray-950">{entry.title}</p>
                                    <p className="mt-1 text-xs text-gray-500">{formatDateTime(entry.createdAt)}</p>
                                  </div>
                                  <span className={entry.amount < 0 ? 'text-sm font-semibold text-rose-600' : 'text-sm font-semibold text-emerald-600'}>
                                    {formatCurrency(entry.amount)}
                                  </span>
                                </div>
                                <p className="mt-2 truncate font-mono text-xs text-gray-400">{entry.reference || entry.status}</p>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
                              No billing history found.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    Select an organization to view usage stats and billing history.
                  </div>
                )}
              </Panel>

              <Panel title="Recent organization events">
                {detail?.recentEvents.length ? (
                  <LiveEventFeed events={detail.recentEvents} dense maxHeightClass="max-h-[420px]" />
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    No recent events for this organization.
                  </div>
                )}
              </Panel>
            </div>
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
