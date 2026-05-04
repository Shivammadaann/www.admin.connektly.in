import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  CheckCircle2,
  Code2,
  CreditCard,
  Flag,
  GitMerge,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCcw,
  Save,
  Search,
  Store,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type {
  ClientFeatureKey,
  ClientFeatureOperationsResponse,
  ClientFeatureRecord,
  ClientFeatureSummary,
} from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

type FeatureFilter = 'all' | ClientFeatureKey;
type StatusFilter = 'all' | 'attention' | 'active' | 'controllable';

const featureIcons: Record<ClientFeatureKey, LucideIcon> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  messenger: Webhook,
  meta_ads: Flag,
  meta_lead_capture: Users,
  whatsapp_payments: CreditCard,
  woocommerce: Store,
  email: Mail,
  email_templates: Mail,
  whatsapp_flows: GitMerge,
  automations: Bot,
  developer_tools: Code2,
  workspace_team: Users,
  notifications: Bell,
};

const severityOrder = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
};

function compactId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function metricValue(value: string | number) {
  return typeof value === 'number' ? formatNumber(value) : value;
}

function rawJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value || '');
  }
}

function isAttention(record: ClientFeatureRecord) {
  return record.severity === 'critical' || record.severity === 'warning';
}

function isActive(record: ClientFeatureRecord) {
  return record.severity === 'success';
}

function FeatureCard({
  feature,
  selected,
  onSelect,
}: {
  feature: ClientFeatureSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = featureIcons[feature.key] || Boxes;
  const attention = feature.metrics.find((metric) => metric.label === 'Attention')?.value || 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[22px] border bg-white p-4 text-left shadow-sm transition hover:border-[#5b45ff] ${
        selected ? 'border-[#5b45ff] ring-2 ring-[#5b45ff]/10' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-gray-950">{feature.label}</p>
            <p className="mt-1 truncate text-xs font-medium text-gray-500">{feature.category}</p>
          </div>
        </div>
        <StatusBadge status={feature.status} severity={feature.severity} compact />
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-500">{feature.description}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {feature.metrics.slice(0, 3).map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{metric.label}</p>
            <p className="mt-1 truncate text-sm font-bold text-gray-950">{metricValue(metric.value)}</p>
          </div>
        ))}
      </div>
      {Number(attention) > 0 ? <p className="mt-3 text-xs font-semibold text-amber-700">{attention} records need review</p> : null}
    </button>
  );
}

export default function ClientFeatureOperationsPage() {
  const [data, setData] = useState<ClientFeatureOperationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [featureFilter, setFeatureFilter] = useState<FeatureFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);
  const [notifyUser, setNotifyUser] = useState(true);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getClientFeatures();
      setData(response);
      setSelectedRecordId((current) =>
        current && response.records.some((record) => record.id === current)
          ? current
          : response.records[0]?.id || null,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load client features.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sortedFeatures = useMemo(() => {
    return (data?.features || []).slice().sort((left, right) => {
      const severityDelta = severityOrder[left.severity] - severityOrder[right.severity];
      return severityDelta || left.category.localeCompare(right.category) || left.label.localeCompare(right.label);
    });
  }, [data?.features]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.records || []).filter((record) => {
      if (featureFilter !== 'all' && record.featureKey !== featureFilter) {
        return false;
      }
      if (statusFilter === 'attention' && !isAttention(record)) {
        return false;
      }
      if (statusFilter === 'active' && !isActive(record)) {
        return false;
      }
      if (statusFilter === 'controllable' && !record.canUpdateStatus) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        record.featureLabel,
        record.category,
        record.organizationName,
        record.ownerName,
        record.ownerEmail,
        record.userId,
        record.status,
        record.detail,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data?.records, featureFilter, search, statusFilter]);

  const selectedRecord =
    filteredRecords.find((record) => record.id === selectedRecordId) ||
    data?.records.find((record) => record.id === selectedRecordId) ||
    filteredRecords[0] ||
    null;

  const saveStatus = async (record: ClientFeatureRecord) => {
    const nextStatus = pendingStatuses[record.id] || record.status;
    if (nextStatus === record.status) return;

    try {
      setSavingRecordId(record.id);
      setError(null);
      setNotice(null);
      const response = await adminApi.updateClientFeatureStatus(record.featureKey, record.userId, {
        status: nextStatus,
        notifyUser,
      });
      setData(response);
      setNotice(`${record.featureLabel} for ${record.organizationName} marked ${labelize(nextStatus)}.`);
      setPendingStatuses((current) => {
        const next = { ...current };
        delete next[record.id];
        return next;
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update feature status.');
    } finally {
      setSavingRecordId(null);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-[20px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Client Feature Operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Admin visibility and controls for customer-facing feature records stored by app.connektly.in.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Workspaces" value={formatNumber(data.summary.workspaces)} detail="Profiles/auth users" Icon={Users} tone="violet" />
          <MetricCard label="Feature Families" value={formatNumber(data.summary.featureFamilies)} detail="Mapped from client routes" Icon={Boxes} tone="sky" />
          <MetricCard label="Configured Records" value={formatNumber(data.summary.configuredRecords)} detail="Saved client feature rows" Icon={CheckCircle2} tone="emerald" />
          <MetricCard label="Needs Review" value={formatNumber(data.summary.attentionRecords)} detail="Warnings or failures" Icon={Activity} tone={data.summary.attentionRecords ? 'amber' : 'emerald'} />
          <MetricCard label="Admin Controls" value={formatNumber(data.summary.controllableRecords)} detail="Safe status updates" Icon={Save} tone="slate" />
        </div>
      ) : null}

      {data?.warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {data.warnings.slice(0, 3).join(' ')}
        </div>
      ) : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sortedFeatures.map((feature) => (
              <FeatureCard
                key={feature.key}
                feature={feature}
                selected={featureFilter === feature.key}
                onSelect={() => setFeatureFilter((current) => (current === feature.key ? 'all' : feature.key))}
              />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <Panel
              title="Workspace Feature Records"
              description={`Showing ${formatNumber(filteredRecords.length)} of ${formatNumber(data.records.length)} configured records`}
            >
              <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto]">
                <label className="flex min-w-0 items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <Search className="h-4 w-4 shrink-0 text-gray-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search organization, owner, feature..."
                    className="ml-3 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                  />
                </label>
                <select
                  value={featureFilter}
                  onChange={(event) => setFeatureFilter(event.target.value as FeatureFilter)}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                >
                  <option value="all">All features</option>
                  {sortedFeatures.map((feature) => (
                    <option key={feature.key} value={feature.key}>
                      {feature.label}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                >
                  <option value="all">All statuses</option>
                  <option value="attention">Needs review</option>
                  <option value="active">Active/healthy</option>
                  <option value="controllable">Admin controllable</option>
                </select>
                <label className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={notifyUser}
                    onChange={(event) => setNotifyUser(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                  />
                  Notify
                </label>
              </div>

              {filteredRecords.length ? (
                <div className="overflow-hidden rounded-2xl border border-gray-200">
                  <div className="max-h-[720px] overflow-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        <tr>
                          <th className="px-4 py-3">Workspace</th>
                          <th className="px-4 py-3">Feature</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Controls</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredRecords.map((record) => {
                          const pendingStatus = pendingStatuses[record.id] || record.status;
                          const isSaving = savingRecordId === record.id;
                          return (
                            <tr
                              key={record.id}
                              className={`cursor-pointer transition hover:bg-gray-50 ${selectedRecord?.id === record.id ? 'bg-[#f5f3ff]' : ''}`}
                              onClick={() => setSelectedRecordId(record.id)}
                            >
                              <td className="px-4 py-4 align-top">
                                <p className="font-semibold text-gray-950">{record.organizationName}</p>
                                <p className="mt-1 text-xs text-gray-500">{record.ownerEmail || compactId(record.userId)}</p>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <p className="font-semibold text-gray-900">{record.featureLabel}</p>
                                <p className="mt-1 max-w-[260px] truncate text-xs text-gray-500">{record.detail}</p>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <StatusBadge status={record.status} severity={record.severity} compact />
                                <p className="mt-2 text-xs text-gray-500">{formatDateTime(record.updatedAt)}</p>
                              </td>
                              <td className="px-4 py-4 align-top" onClick={(event) => event.stopPropagation()}>
                                {record.canUpdateStatus && record.allowedStatuses.length ? (
                                  <div className="flex min-w-[220px] items-center gap-2">
                                    <select
                                      value={pendingStatus}
                                      onChange={(event) =>
                                        setPendingStatuses((current) => ({
                                          ...current,
                                          [record.id]: event.target.value,
                                        }))
                                      }
                                      className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#5b45ff]"
                                    >
                                      {record.allowedStatuses.map((status) => (
                                        <option key={status} value={status}>
                                          {labelize(status)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={isSaving || pendingStatus === record.status}
                                      onClick={() => void saveStatus(record)}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#5b45ff] text-white transition hover:bg-[#4c38e0] disabled:cursor-not-allowed disabled:opacity-50"
                                      aria-label="Save status"
                                    >
                                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs font-medium text-gray-400">Read only</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
                  No feature records match the current filters.
                </div>
              )}
            </Panel>

            <div className="space-y-5">
              <Panel title="Record Detail" description={selectedRecord ? selectedRecord.featureLabel : 'No record selected'}>
                {selectedRecord ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Workspace</p>
                      <h2 className="mt-2 text-lg font-bold text-gray-950">{selectedRecord.organizationName}</h2>
                      <p className="mt-1 text-sm text-gray-500">{selectedRecord.ownerEmail || selectedRecord.ownerName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={selectedRecord.status} severity={selectedRecord.severity} />
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600">
                        {selectedRecord.category}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-gray-600">{selectedRecord.detail}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedRecord.metrics.map((metric) => (
                        <div key={metric.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{metric.label}</p>
                          <p className="mt-1 truncate text-sm font-bold text-gray-950">{metricValue(metric.value)}</p>
                        </div>
                      ))}
                    </div>
                    {selectedRecord.risks.length ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Signals</p>
                        <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-900">
                          {selectedRecord.risks.map((risk) => (
                            <li key={risk}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-gray-950 p-4 text-xs leading-6 text-gray-100">
                      {rawJson(selectedRecord.raw)}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    Select a feature record to review its raw client data.
                  </div>
                )}
              </Panel>

              <Panel title="Recent Client Activity" description={`Generated ${formatDateTime(data.generatedAt)}`}>
                <div className="max-h-[380px] space-y-3 overflow-auto pr-1">
                  {data.recentActivity.slice(0, 10).map((event) => (
                    <div key={event.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">{event.title}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{event.table || event.source}</p>
                        </div>
                        <StatusBadge status={event.status || event.eventType} severity={event.severity} compact />
                      </div>
                      <p className="mt-2 text-xs text-gray-500">{formatDateTime(event.occurredAt)}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
