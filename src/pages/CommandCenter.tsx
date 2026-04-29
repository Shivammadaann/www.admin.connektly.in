import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CreditCard,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCcw,
  Server,
  Users,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { useLiveEvents } from '../lib/liveEvents';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import type { AdminOverview } from '../lib/types';
import LiveEventFeed from '../components/LiveEventFeed';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

export default function CommandCenter() {
  const { events } = useLiveEvents();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setOverview(await adminApi.getOverview());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load Admin Control Centre.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const mergedEvents = useMemo(() => {
    const combined = [...events, ...(overview?.timeline || [])];
    const seen = new Set<string>();
    return combined
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, 30);
  }, [events, overview?.timeline]);

  if (isLoading && !overview) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Connektly operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Live workspace, billing, webhook, and system signals from the client dashboard database.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {overview?.health ? <StatusBadge status={overview.health.status} severity={overview.health.status === 'ok' ? 'success' : overview.health.status === 'warning' ? 'warning' : 'critical'} /> : null}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total users" value={formatNumber(overview.metrics.totalUsers)} detail={`${formatNumber(overview.metrics.workspaces)} workspace profiles`} Icon={Users} tone="violet" />
            <MetricCard label="Paid workspaces" value={formatNumber(overview.metrics.paidWorkspaces)} detail={`${formatNumber(overview.metrics.trialWorkspaces)} trial workspaces`} Icon={CreditCard} tone="emerald" />
            <MetricCard label="Messages 24h" value={formatNumber(overview.metrics.messages24h)} detail={`${formatNumber(overview.metrics.conversations)} total conversations`} Icon={MessageSquare} tone="sky" />
            <MetricCard label="Webhook hits 24h" value={formatNumber(overview.metrics.leadWebhooks24h)} detail={`${formatNumber(overview.metrics.emailCampaigns24h)} bulk email campaigns`} Icon={Webhook} tone="amber" />
            <MetricCard label="Connected channels" value={formatNumber(overview.metrics.connectedChannels)} detail="WhatsApp, Instagram, and Messenger connections" Icon={Activity} tone="slate" />
            <MetricCard label="Calls 24h" value={formatNumber(overview.metrics.calls24h)} detail={`${formatNumber(overview.metrics.activeCalls)} currently active sessions`} Icon={Phone} tone="emerald" />
            <MetricCard label="Credit balance" value={formatNumber(overview.metrics.totalCreditBalance)} detail="Net ledger across all workspaces" Icon={CreditCard} tone="violet" />
            <MetricCard label="Server uptime" value={`${formatNumber(overview.health.uptimeSeconds)}s`} detail={`${overview.health.dbLatencyMs ?? 'N/A'}ms database check`} Icon={Server} tone={overview.health.status === 'ok' ? 'emerald' : 'amber'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <Panel title="Live operations feed" description={`Last updated ${formatDateTime(overview.generatedAt)}`}>
              <LiveEventFeed events={mergedEvents} />
            </Panel>

            <div className="space-y-6">
              <Panel title="Plan distribution">
                <div className="space-y-3">
                  {Object.entries(overview.planBreakdown).map(([plan, count]) => (
                    <div key={plan} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-900">{labelize(plan)}</span>
                        <span className="text-sm font-semibold text-[#5b45ff]">{count}</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-gray-200">
                        <div
                          className="h-2 rounded-full bg-[#5b45ff]"
                          style={{
                            width: `${Math.max(8, Math.round((count / Math.max(overview.metrics.workspaces, 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Recent workspaces">
                <div className="space-y-3">
                  {overview.recentUsers.map((user) => (
                    <div key={user.userId} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">{user.companyName || user.fullName}</p>
                          <p className="mt-1 truncate text-xs text-gray-500">{user.email || user.userId}</p>
                        </div>
                        <StatusBadge status={user.billingStatus || 'no billing'} compact />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                        <span>{user.channels.length} channels</span>
                        <span>{user.counts.conversations} conversations</span>
                      </div>
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
