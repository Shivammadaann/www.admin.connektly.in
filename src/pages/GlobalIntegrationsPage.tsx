import { useEffect, useState } from 'react';
import { Globe2, Instagram, Loader2, Mail, MessageCircle, RefreshCcw } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { GlobalIntegration, GlobalIntegrationsResponse } from '../lib/types';
import { formatDateTime, formatNumber } from '../lib/format';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

function integrationIcon(key: string) {
  if (key === 'whatsapp') return MessageCircle;
  if (key === 'instagram') return Instagram;
  if (key === 'email') return Mail;
  return Globe2;
}

function IntegrationCard({ integration }: { integration: GlobalIntegration }) {
  const Icon = integrationIcon(integration.key);
  return (
    <article className="rounded-[26px] border border-gray-200 bg-white/95 p-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)] ring-1 ring-white/70">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-gray-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-gray-950">{integration.label}</h2>
              <p className="mt-1 text-sm text-gray-500">{integration.summary}</p>
            </div>
          </div>
        </div>
        <StatusBadge status={integration.status} severity={integration.severity} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {integration.metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{metric.label}</p>
            <p className="mt-2 text-xl font-bold text-gray-950">{formatNumber(metric.value)}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium text-gray-500">Last checked {formatDateTime(integration.lastCheckedAt)}</p>
    </article>
  );
}

export default function GlobalIntegrationsPage() {
  const [data, setData] = useState<GlobalIntegrationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setData(await adminApi.getGlobalIntegrations());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load global integrations.');
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
        title="Global Integrations"
        description="Global health for WhatsApp, Instagram, and email services used across organizations."
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
          <div className="grid gap-5 xl:grid-cols-3">
            {data.integrations.map((integration) => (
              <IntegrationCard key={integration.key} integration={integration} />
            ))}
          </div>

          <Panel title="Client API Signal" description={`Generated ${formatDateTime(data.generatedAt)}`}>
            {data.clientApi ? (
              <pre className="thin-scrollbar max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-gray-950 p-4 text-xs leading-6 text-gray-200">
                {JSON.stringify(data.clientApi, null, 2)}
              </pre>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                CLIENT_API_BASE_URL is not configured, so external client API health is not available.
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
