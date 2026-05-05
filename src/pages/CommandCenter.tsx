import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  IndianRupee,
  Loader2,
  MessageSquare,
  RefreshCcw,
  ScrollText,
  TrendingDown,
  TrendingUp,
  Users,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { formatCurrency, formatDateTime, formatNumber } from '../lib/format';
import type { AdminOverview, Severity } from '../lib/types';
import Panel from '../components/Panel';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

type Tone = 'violet' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';

const toneClasses: Record<Tone, string> = {
  violet: 'bg-[#f5f3ff] text-[#5b45ff] border-[#dcd6ff]',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  sky: 'bg-sky-50 text-sky-700 border-sky-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  rose: 'bg-rose-50 text-rose-700 border-rose-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};

const quickActions = [
  { label: 'Review organizations', path: '/dashboard/organizations', Icon: Building2 },
  { label: 'Open user directory', path: '/dashboard/users', Icon: Users },
  { label: 'Check webhooks', path: '/dashboard/webhooks', Icon: Webhook },
  { label: 'View logs', path: '/dashboard/logs-monitoring', Icon: ScrollText },
];

function CompactKpi({
  label,
  value,
  detail,
  Icon,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  detail: string;
  Icon: typeof Building2;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[26px] border border-gray-200 bg-white/95 p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)] ring-1 ring-white/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</p>
          <p className="mt-3 truncate text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">{value}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 truncate text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function SimpleBarChart({
  data,
  formatter = formatNumber,
}: {
  data: Array<{ label: string; value: number }>;
  formatter?: (value: number) => string;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="flex h-52 items-end gap-2">
      {data.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-40 w-full items-end rounded-xl bg-gray-50 px-1.5 pb-1.5">
            <div
              className="w-full rounded-lg bg-[#5b45ff]"
              style={{ height: `${Math.max(6, Math.round((item.value / max) * 100))}%` }}
              title={`${item.label}: ${formatter(item.value)}`}
            />
          </div>
          <span className="max-w-full truncate text-[11px] font-medium text-gray-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function DualBarChart({ data }: { data: AdminOverview['charts']['customerMovement'] }) {
  const max = Math.max(...data.flatMap((item) => [item.newCustomers, item.churnedCustomers]), 1);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs font-semibold text-gray-500">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />New</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Churned</span>
      </div>
      <div className="flex h-48 items-end gap-2">
        {data.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end justify-center gap-1 rounded-xl bg-gray-50 px-1.5 pb-1.5">
              <div
                className="w-1/2 rounded-lg bg-emerald-500"
                style={{ height: `${Math.max(5, Math.round((item.newCustomers / max) * 100))}%` }}
                title={`${item.label}: ${formatNumber(item.newCustomers)} new`}
              />
              <div
                className="w-1/2 rounded-lg bg-rose-500"
                style={{ height: `${Math.max(5, Math.round((item.churnedCustomers / max) * 100))}%` }}
                title={`${item.label}: ${formatNumber(item.churnedCustomers)} churned`}
              />
            </div>
            <span className="max-w-full truncate text-[11px] font-medium text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-gray-800">{item.label}</span>
            <span className="font-semibold text-gray-950">{formatNumber(item.value)}</span>
          </div>
          <div className="h-3 rounded-full bg-gray-100">
            <div className="h-3 rounded-full bg-[#5b45ff]" style={{ width: `${Math.max(4, Math.round((item.value / max) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function alertTone(severity: Severity) {
  if (severity === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (severity === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

export default function CommandCenter() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setOverview(await adminApi.getOverview());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load overview.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const kpis = useMemo(
    () =>
      overview
        ? [
            {
              label: 'Total Organizations',
              value: formatNumber(overview.metrics.totalOrganizations),
              detail: 'All workspace profiles',
              Icon: Building2,
              tone: 'violet' as Tone,
            },
            {
              label: 'Active Organizations',
              value: formatNumber(overview.metrics.activeOrganizations),
              detail: `${formatNumber(overview.metrics.paidWorkspaces)} paid`,
              Icon: TrendingUp,
              tone: 'emerald' as Tone,
            },
            {
              label: 'Total Users',
              value: formatNumber(overview.metrics.totalUsers),
              detail: 'Across all orgs',
              Icon: Users,
              tone: 'sky' as Tone,
            },
            {
              label: 'Messages Sent',
              value: formatNumber(overview.metrics.messagesSent),
              detail: `${formatNumber(overview.metrics.messages24h)} in 24h`,
              Icon: MessageSquare,
              tone: 'slate' as Tone,
            },
            {
              label: 'MRR',
              value: formatCurrency(overview.metrics.monthlyRecurringRevenue),
              detail: 'Monthly recurring revenue',
              Icon: IndianRupee,
              tone: 'amber' as Tone,
            },
            {
              label: 'Churn Rate',
              value: `${overview.metrics.churnRate.toFixed(1)}%`,
              detail: 'Churned vs active base',
              Icon: TrendingDown,
              tone: overview.metrics.churnRate > 0 ? ('rose' as Tone) : ('emerald' as Tone),
            },
          ]
        : [],
    [overview],
  );

  if (isLoading && !overview) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Overview"
        description="Global organization, usage, revenue, channel, and alert signals."
        meta={
          overview?.health ? (
            <StatusBadge
              status={overview.health.status}
              severity={overview.health.status === 'ok' ? 'success' : overview.health.status === 'warning' ? 'warning' : 'critical'}
            />
          ) : null
        }
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {overview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi) => (
              <CompactKpi key={kpi.label} {...kpi} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Revenue Growth" description="MRR over time">
                <SimpleBarChart data={overview.charts.revenueGrowth} formatter={formatCurrency} />
              </Panel>

              <Panel title="New vs Churned Customers">
                <DualBarChart data={overview.charts.customerMovement} />
              </Panel>

              <Panel title="Message Volume Trend">
                <SimpleBarChart data={overview.charts.messageVolume} />
              </Panel>

              <Panel title="Channel Usage" description="WA / IG / Email">
                <HorizontalBars data={overview.charts.channelUsage} />
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel title="Alerts Panel" description={`Updated ${formatDateTime(overview.generatedAt)}`}>
                <div className="space-y-3">
                  {overview.alerts.map((alert) => (
                    <div key={alert.key} className={`rounded-2xl border p-4 ${alertTone(alert.severity)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <p className="truncate text-sm font-bold">{alert.label}</p>
                          </div>
                          <p className="mt-2 text-xs leading-5 opacity-80">{alert.detail}</p>
                        </div>
                        <p className="shrink-0 text-lg font-bold">
                          {formatNumber(alert.value)}
                          {alert.suffix || ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Quick Actions">
                <div className="grid gap-2">
                  {quickActions.map((action) => (
                    <Link
                      key={action.path}
                      to={action.path}
                      className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-[#5b45ff] hover:bg-[#f5f3ff] hover:text-[#5b45ff]"
                    >
                      <action.Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{action.label}</span>
                    </Link>
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
