import { useEffect, useMemo, useState } from 'react';
import { Activity, FileWarning, Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { useLiveEvents } from '../lib/liveEvents';
import type { AuditResponse } from '../lib/types';
import { formatDateTime, labelize } from '../lib/format';
import LiveEventFeed from '../components/LiveEventFeed';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

export default function AuditPage() {
  const { events } = useLiveEvents();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setData(await adminApi.getAudit());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load audit events.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const adminEvents = useMemo(() => {
    const combined = [...events.filter((event) => event.source === 'owner-dashboard'), ...(data?.liveEvents || [])];
    const seen = new Set<string>();
    return combined.filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }, [data?.liveEvents, events]);

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dcd6ff] bg-[#f5f3ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#5b45ff]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Security audit
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-950">Owner activity</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Admin actions, live operational events, and persisted audit history when the admin migration is applied.
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

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {data?.warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.warning}</div> : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Persisted audit rows" value={data.auditEvents.length} detail="Rows in owner_admin_audit_events" Icon={ShieldCheck} tone="violet" />
            <MetricCard label="Live admin actions" value={adminEvents.length} detail="Actions seen by this server process" Icon={Activity} tone="emerald" />
            <MetricCard label="Operational events" value={data.liveEvents.length} detail="Realtime server-side event buffer" Icon={FileWarning} tone="sky" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Admin action stream">
              <LiveEventFeed events={adminEvents} maxHeightClass="max-h-[640px]" />
            </Panel>

            <Panel title="Persisted audit log" description={`Generated ${formatDateTime(data.generatedAt)}`}>
              <div className="thin-scrollbar max-h-[640px] overflow-y-auto">
                {data.auditEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                    No persisted admin audit rows were found.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.auditEvents.map((event) => (
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
                        <pre className="thin-scrollbar mt-3 max-h-40 overflow-auto rounded-2xl border border-gray-200 bg-white p-3 text-xs text-gray-500">
                          {JSON.stringify(event.metadata || {}, null, 2)}
                        </pre>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
