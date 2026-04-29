import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { useLiveEvents } from '../lib/liveEvents';
import type { AdminLiveEvent, WebhookReference, WebhooksResponse } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import LiveEventFeed from '../components/LiveEventFeed';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

function isWebhookEvent(event: AdminLiveEvent) {
  return (
    event.table?.includes('webhook') ||
    event.table === 'meta_lead_capture_events' ||
    event.table === 'whatsapp_payment_configuration_events' ||
    event.table === 'conversation_messages' ||
    event.table === 'call_sessions'
  );
}

function getWebhookStatusTone(status: WebhookReference['status']) {
  if (status === 'configured') {
    return { label: 'Configured', severity: 'success' as const };
  }

  if (status === 'external') {
    return { label: 'External endpoint', severity: 'warning' as const };
  }

  return { label: 'Needs CLIENT_API_BASE_URL', severity: 'critical' as const };
}

export default function WebhooksPage() {
  const { events } = useLiveEvents();
  const [data, setData] = useState<WebhooksResponse | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AdminLiveEvent | null>(null);
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getWebhooks();
      setData(response);
      setSelectedEvent((current) => current || response.events[0] || null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load webhooks.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const webhookEvents = useMemo(() => {
    const combined = [...events.filter(isWebhookEvent), ...(data?.events || [])];
    const seen = new Set<string>();
    return combined
      .filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, 300);
  }, [data?.events, events]);

  const copyWebhookUrl = async (webhook: WebhookReference) => {
    if (!webhook.url) return;

    await navigator.clipboard.writeText(webhook.url);
    setCopiedWebhookId(webhook.id);
    window.setTimeout(() => setCopiedWebhookId(null), 1800);
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
      <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Webhook monitor</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Meta lead capture, WhatsApp payment, messaging, and call webhook signals as they hit Supabase.
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

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Lead configs" value={formatNumber(data.summary.leadConfigs)} detail={`${formatNumber(data.summary.activeLeadConfigs)} active`} Icon={Webhook} tone="violet" />
            <MetricCard label="Events 24h" value={formatNumber(data.summary.events24h)} detail="Lead, payment, message, and call events" Icon={CheckCircle2} tone="emerald" />
            <MetricCard label="Failed events" value={formatNumber(data.summary.failedEvents)} detail="Events marked error or failed" Icon={AlertTriangle} tone={data.summary.failedEvents ? 'rose' : 'slate'} />
            <MetricCard label="Messenger errors" value={formatNumber(data.summary.messengerWebhookErrors)} detail="Webhook subscription issues" Icon={AlertTriangle} tone={data.summary.messengerWebhookErrors ? 'amber' : 'slate'} />
          </div>

          <Panel
            title="Webhook URLs"
            description="External callback URLs configured on Meta or payment providers, with what each endpoint is responsible for."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {data.webhookUrls.map((webhook) => {
                const tone = getWebhookStatusTone(webhook.status);
                const copied = copiedWebhookId === webhook.id;

                return (
                  <article key={webhook.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-950">{webhook.name}</h3>
                          <StatusBadge status={tone.label} severity={tone.severity} compact />
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{webhook.provider}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {webhook.methods.map((method) => (
                          <span
                            key={`${webhook.id}-${method}`}
                            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600"
                          >
                            {method}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3">
                      {webhook.url ? (
                        <div className="flex items-center gap-2">
                          <code className="thin-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-gray-700">
                            {webhook.url}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copyWebhookUrl(webhook)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                            aria-label={`Copy ${webhook.name} URL`}
                            title={`Copy ${webhook.name} URL`}
                          >
                            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                          </button>
                          <a
                            href={webhook.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                            aria-label={`Open ${webhook.name} URL`}
                            title={`Open ${webhook.name} URL`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">{webhook.notes}</p>
                      )}
                    </div>

                    <p className="mt-4 text-sm leading-6 text-gray-600">{webhook.purpose}</p>

                    <div className="mt-4 grid gap-3 text-xs text-gray-500 sm:grid-cols-2">
                      <div className="rounded-2xl border border-gray-200 bg-white p-3">
                        <p className="font-semibold uppercase tracking-[0.14em] text-gray-400">Verify token</p>
                        <p className="mt-2 break-words font-mono text-gray-600">{webhook.verifyTokenEnv || 'Not required'}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-3">
                        <p className="font-semibold uppercase tracking-[0.14em] text-gray-400">Events</p>
                        <p className="mt-2 leading-5 text-gray-600">{webhook.events.join(', ')}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <Panel title="Configurations">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-950">Meta lead capture</h3>
                  <div className="mt-3 space-y-3">
                    {data.configs.leadCapture.slice(0, 8).map((config) => (
                      <div key={String(config.user_id)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs text-gray-500">{String(config.user_id)}</p>
                            <p className="mt-2 text-sm text-gray-600">Last webhook {formatDateTime(config.last_webhook_at)}</p>
                          </div>
                          <StatusBadge status={config.status || 'draft'} compact />
                        </div>
                        {config.last_error ? <p className="mt-3 text-sm text-rose-600">{String(config.last_error)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-950">Messenger channels</h3>
                  <div className="mt-3 space-y-3">
                    {data.configs.messenger.slice(0, 8).map((channel) => (
                      <div key={String(channel.id)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-950">{String(channel.page_name || channel.page_id || 'Messenger page')}</p>
                            <p className="mt-1 truncate font-mono text-xs text-gray-500">{String(channel.user_id)}</p>
                          </div>
                          <StatusBadge status={channel.webhook_subscribed ? 'subscribed' : 'not subscribed'} compact />
                        </div>
                        {channel.webhook_last_error ? <p className="mt-3 text-sm text-rose-600">{String(channel.webhook_last_error)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Event stream" description={`Showing ${webhookEvents.length} recent events`}>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="thin-scrollbar max-h-[720px] overflow-y-auto space-y-3">
                  {webhookEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedEvent?.id === event.id ? 'border-[#5b45ff] bg-[#f5f3ff]' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">{event.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{formatDateTime(event.occurredAt)}</p>
                        </div>
                        <StatusBadge status={event.status || event.eventType} severity={event.severity} compact />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                        {event.table ? <span>{event.table}</span> : null}
                        {event.userId ? <span className="font-mono">{event.userId}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-950 p-4 text-gray-100">
                  {selectedEvent ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={selectedEvent.status || selectedEvent.eventType} severity={selectedEvent.severity} compact />
                        <span className="text-xs text-gray-400">{formatDateTime(selectedEvent.occurredAt)}</span>
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-white">{selectedEvent.title}</h3>
                      {selectedEvent.description ? <p className="mt-2 text-sm leading-6 text-gray-300">{selectedEvent.description}</p> : null}
                      <div className="mt-4 grid gap-3 text-xs text-gray-400 sm:grid-cols-2">
                        <span>Source: {selectedEvent.source}</span>
                        <span>Event: {labelize(selectedEvent.eventType)}</span>
                        <span>Table: {selectedEvent.table || 'N/A'}</span>
                        <span>User: {selectedEvent.userId || 'N/A'}</span>
                      </div>
                      <pre className="thin-scrollbar mt-5 max-h-[440px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-gray-300">
                        {JSON.stringify(selectedEvent.payload || selectedEvent, null, 2)}
                      </pre>
                    </>
                  ) : (
                    <div className="flex h-60 items-center justify-center text-sm text-gray-400">Select an event.</div>
                  )}
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Condensed live feed">
            <LiveEventFeed events={webhookEvents.slice(0, 20)} dense maxHeightClass="max-h-[420px]" />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
