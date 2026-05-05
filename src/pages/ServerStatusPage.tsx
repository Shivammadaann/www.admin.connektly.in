import { useEffect, useState } from 'react';
import { Database, HardDrive, Loader2, RefreshCcw, Server, Signal } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { ServerResponse } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';
import LiveEventFeed from '../components/LiveEventFeed';

export default function ServerStatusPage() {
  const [data, setData] = useState<ServerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setData(await adminApi.getServer());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load server status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
        title="Server status"
        description="Owner API health, Supabase checks, realtime bridge state, client API health, and table volumes."
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

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Status" value={labelize(data.health.status)} detail={`Generated ${formatDateTime(data.generatedAt)}`} Icon={Server} tone={data.health.status === 'ok' ? 'emerald' : data.health.status === 'warning' ? 'amber' : 'rose'} />
            <MetricCard label="DB latency" value={data.health.dbLatencyMs === null ? 'N/A' : `${data.health.dbLatencyMs}ms`} detail="Service-role app_profiles check" Icon={Database} tone="sky" />
            <MetricCard label="Realtime" value={labelize(data.health.realtime.status)} detail={`${formatNumber(data.health.realtime.subscribers)} live subscribers`} Icon={Signal} tone={data.health.realtime.status === 'SUBSCRIBED' ? 'emerald' : 'amber'} />
            <MetricCard label="Memory" value={`${data.health.memory.heapUsedMb}MB`} detail={`${data.health.memory.rssMb}MB RSS`} Icon={HardDrive} tone="slate" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Panel title="Environment checks">
              <div className="space-y-3">
                {data.health.envChecks.map((check) => (
                  <div key={check.label} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-950">{check.label}</p>
                      <p className="mt-1 text-sm text-gray-500">{check.detail}</p>
                    </div>
                    <StatusBadge status={check.ok ? 'ok' : 'missing'} severity={check.ok ? 'success' : 'critical'} compact />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Client API health">
              {data.health.clientApi ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-gray-700">{data.health.clientApi.url}</p>
                      <p className="mt-2 text-sm text-gray-500">Checked {formatDateTime(data.health.clientApi.checkedAt)}</p>
                    </div>
                    <StatusBadge status={data.health.clientApi.ok ? 'healthy' : 'unhealthy'} severity={data.health.clientApi.ok ? 'success' : 'critical'} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-3">
                    <span>Status {data.health.clientApi.status || 'N/A'}</span>
                    <span>Latency {data.health.clientApi.latencyMs ?? 'N/A'}ms</span>
                    <span>{data.health.clientApi.ok ? 'Reachable' : 'Check failed'}</span>
                  </div>
                  {data.health.clientApi.body ? (
                    <pre className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
                      {data.health.clientApi.body}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                  Configure CLIENT_API_BASE_URL to monitor the client app API.
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Panel title="Supabase table counts">
              <div className="grid gap-3 sm:grid-cols-2">
                {data.tableCounts.map((entry) => (
                  <div key={entry.table} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{entry.table}</p>
                    <p className="mt-2 text-xl font-semibold text-gray-950">{formatNumber(entry.count)}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Recent server-side events">
              <LiveEventFeed events={data.recentEvents} dense maxHeightClass="max-h-[520px]" />
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
