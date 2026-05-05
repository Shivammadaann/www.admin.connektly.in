import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Database,
  FileWarning,
  Loader2,
  RefreshCcw,
  ScrollText,
  Search,
  Server,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { AdminLogEntry, AuditResponse, LogsMonitoringResponse, ServerResponse } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

type TabId = 'api' | 'errors' | 'webhooks' | 'delivery' | 'server' | 'audit';

const tabs: Array<{ id: TabId; label: string; Icon: typeof ScrollText }> = [
  { id: 'api', label: 'API logs', Icon: ScrollText },
  { id: 'errors', label: 'Error logs', Icon: AlertTriangle },
  { id: 'webhooks', label: 'Webhook logs', Icon: Webhook },
  { id: 'delivery', label: 'Message delivery logs', Icon: FileWarning },
  { id: 'server', label: 'Server Status', Icon: Server },
  { id: 'audit', label: 'Security Audit', Icon: ShieldCheck },
];

function logRowsForTab(data: LogsMonitoringResponse | null, tab: TabId) {
  if (!data) return [];
  if (tab === 'api') return data.apiLogs;
  if (tab === 'errors') return data.errorLogs;
  if (tab === 'webhooks') return data.webhookLogs;
  if (tab === 'delivery') return data.messageDeliveryLogs;
  return [];
}

function LogsTable({ logs }: { logs: AdminLogEntry[] }) {
  const [selectedLog, setSelectedLog] = useState<AdminLogEntry | null>(logs[0] || null);

  useEffect(() => {
    setSelectedLog((current) => current && logs.some((log) => log.id === current.id) ? current : logs[0] || null);
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
        No logs match the current filters.
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
      <div className="thin-scrollbar max-h-[680px] overflow-auto rounded-2xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-[0.12em] text-gray-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Org ID</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Error Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {logs.map((log) => (
              <tr
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className={`cursor-pointer transition ${selectedLog?.id === log.id ? 'bg-[#f5f3ff]' : 'hover:bg-gray-50'}`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{formatDateTime(log.occurredAt)}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-950">{log.source}</p>
                  <p className="mt-1 max-w-[260px] truncate text-xs text-gray-500">{log.title}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.orgId || 'global'}</td>
                <td className="px-4 py-3"><StatusBadge status={log.status} severity={log.severity} compact /></td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-600">{log.errorType ? labelize(log.errorType) : 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Panel title="Log Detail">
        {selectedLog ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selectedLog.status} severity={selectedLog.severity} compact />
              <span className="text-xs text-gray-500">{formatDateTime(selectedLog.occurredAt)}</span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-950">{selectedLog.title}</h3>
            {selectedLog.detail ? <p className="mt-2 text-sm leading-6 text-gray-500">{selectedLog.detail}</p> : null}
            <div className="mt-4 grid gap-3 text-xs text-gray-500 sm:grid-cols-2">
              <span>Source: {selectedLog.source}</span>
              <span>Category: {labelize(selectedLog.category)}</span>
              <span>Org: {selectedLog.orgId || 'global'}</span>
              <span>User: {selectedLog.userId || 'N/A'}</span>
            </div>
            <pre className="thin-scrollbar mt-5 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-gray-950 p-4 text-xs leading-6 text-gray-200">
              {JSON.stringify(selectedLog.payload || selectedLog, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            Select a log row.
          </div>
        )}
      </Panel>
    </div>
  );
}

function ServerStatusPanel({ data }: { data: ServerResponse | null }) {
  if (!data) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel title="Server Health" description={`Generated ${formatDateTime(data.generatedAt)}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Status</p>
            <div className="mt-3"><StatusBadge status={data.health.status} severity={data.health.status === 'ok' ? 'success' : data.health.status === 'warning' ? 'warning' : 'critical'} /></div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">DB Latency</p>
            <p className="mt-2 text-xl font-bold text-gray-950">{data.health.dbLatencyMs ?? 'N/A'}ms</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Realtime</p>
            <p className="mt-2 text-base font-bold text-gray-950">{labelize(data.health.realtime.status)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Memory</p>
            <p className="mt-2 text-base font-bold text-gray-950">{data.health.memory.heapUsedMb}MB heap</p>
          </div>
        </div>
      </Panel>

      <Panel title="Environment & Tables">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.health.envChecks.map((check) => (
              <div key={check.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-950">{check.label}</p>
                    <p className="mt-1 text-xs text-gray-500">{check.detail}</p>
                  </div>
                  <StatusBadge status={check.ok ? 'ok' : 'missing'} severity={check.ok ? 'success' : 'critical'} compact />
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.tableCounts.slice(0, 9).map((entry) => (
              <div key={entry.table} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{entry.table}</p>
                <p className="mt-2 text-lg font-bold text-gray-950">{formatNumber(entry.count)}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AuditPanel({ data }: { data: AuditResponse | null }) {
  if (!data) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="grid gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Persisted audit rows</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatNumber(data.auditEvents.length)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Live audit events</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatNumber(data.liveEvents.length)}</p>
        </div>
      </div>

      <Panel title="Security Audit" description={`Generated ${formatDateTime(data.generatedAt)}`}>
        <div className="thin-scrollbar max-h-[640px] overflow-y-auto space-y-3">
          {data.auditEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              No persisted security audit rows were found.
            </div>
          ) : (
            data.auditEvents.map((event) => (
              <article key={String(event.id)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-950">{labelize(event.action)}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatDateTime(event.created_at)}</p>
                  </div>
                  <StatusBadge status="recorded" severity="success" compact />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                  <span className="truncate">Admin: {String(event.admin_email || event.admin_user_id || 'unknown')}</span>
                  <span className="truncate">Target: {String(event.target_user_id || 'none')}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function LogsMonitoringPage() {
  const [logs, setLogs] = useState<LogsMonitoringResponse | null>(null);
  const [server, setServer] = useState<ServerResponse | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('api');
  const [orgSearch, setOrgSearch] = useState('');
  const [errorType, setErrorType] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const [logsResponse, serverResponse, auditResponse] = await Promise.all([
        adminApi.getLogsMonitoring(),
        adminApi.getServer().catch(() => null),
        adminApi.getAudit().catch(() => null),
      ]);
      setLogs(logsResponse);
      setServer(serverResponse);
      setAudit(auditResponse);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load logs and monitoring.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleLogs = useMemo(() => {
    const orgNeedle = orgSearch.trim().toLowerCase();
    return logRowsForTab(logs, activeTab).filter((log) => {
      const orgMatches = !orgNeedle || String(log.orgId || '').toLowerCase().includes(orgNeedle);
      const errorMatches = errorType === 'all' || log.errorType === errorType;
      return orgMatches && errorMatches;
    });
  }, [activeTab, errorType, logs, orgSearch]);

  if (isLoading && !logs) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Logs & Monitoring"
        description="API, error, webhook, delivery, server, and security audit visibility for dev and ops."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-[28px] border border-gray-200 bg-white/95 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.05)] ring-1 ring-white/70">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-[#5b45ff] text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                }`}
              >
                <tab.Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {['api', 'errors', 'webhooks', 'delivery'].includes(activeTab) ? (
        <>
          <div className="grid gap-3 rounded-[20px] border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_240px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                value={orgSearch}
                onChange={(event) => setOrgSearch(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pl-12 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
                placeholder="Search logs by org_id"
              />
            </label>
            <select
              value={errorType}
              onChange={(event) => setErrorType(event.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]"
            >
              <option value="all">All error types</option>
              {(logs?.errorTypes || []).map((type) => (
                <option key={type} value={type}>
                  {labelize(type)}
                </option>
              ))}
            </select>
          </div>
          <LogsTable logs={visibleLogs} />
        </>
      ) : null}

      {activeTab === 'server' ? <ServerStatusPanel data={server} /> : null}
      {activeTab === 'audit' ? <AuditPanel data={audit} /> : null}
    </div>
  );
}
