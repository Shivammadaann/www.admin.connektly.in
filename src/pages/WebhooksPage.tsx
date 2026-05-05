import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  ListChecks,
  Loader2,
  RefreshCcw,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { useLiveEvents } from '../lib/liveEvents';
import type { AdminLiveEvent, WebhookReference, WebhookTokenRevealResponse, WebhooksResponse } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import LiveEventFeed from '../components/LiveEventFeed';
import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizedPayloadText(event: AdminLiveEvent) {
  const row = isRecord(event.payload) ? event.payload : {};
  return [
    event.table,
    row.channel,
    row.channel_type,
    row.provider,
    row.platform,
    row.source,
    row.integration,
    row.message_channel,
    row.page_id,
    row.page_name,
    row.facebook_page_id,
    row.phone_number_id,
    row.waba_id,
    row.wa_id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function webhookEventIds(event: AdminLiveEvent) {
  return [...new Set([event.webhookId, ...(event.webhookIds || [])].filter(Boolean))] as string[];
}

function eventBelongsToWebhook(event: AdminLiveEvent, webhook: WebhookReference) {
  const explicitIds = webhookEventIds(event);
  if (explicitIds.length > 0) {
    return explicitIds.includes(webhook.id);
  }

  if (webhook.id === 'meta-lead-capture') {
    return event.table === 'meta_lead_capture_events' || event.table === 'meta_lead_capture_configs';
  }

  if (webhook.id === 'whatsapp-payments-data-endpoint') {
    return event.table === 'whatsapp_payment_configuration_events';
  }

  if (webhook.id === 'messenger-canonical' || webhook.id === 'messenger-alias') {
    const text = normalizedPayloadText(event);
    return event.table === 'messenger_channels' || text.includes('messenger') || text.includes('facebook');
  }

  if (webhook.id === 'whatsapp-cloud-api') {
    const text = normalizedPayloadText(event);
    return (
      event.table === 'whatsapp_payment_configuration_events' ||
      event.table === 'call_sessions' ||
      event.table === 'call_logs' ||
      (event.table === 'conversation_messages' && !text.includes('messenger') && !text.includes('facebook'))
    );
  }

  if (webhook.id.startsWith('developer:')) {
    const row = isRecord(event.payload) ? event.payload : {};
    return event.table === 'developer_webhook_endpoints' && webhook.id === `developer:${String(row.id || '')}`;
  }

  return false;
}

function getWebhookEventOutcome(event: AdminLiveEvent) {
  const text = [event.severity, event.status, event.title, event.description].filter(Boolean).join(' ').toLowerCase();
  if (event.severity === 'critical' || /fail|error|timeout|declin|past_due|disconnect|halted/.test(text)) {
    return { label: 'Failure', severity: 'critical' as const };
  }
  if (event.severity === 'warning' || /pending|partial|retry/.test(text)) {
    return { label: 'Pending', severity: 'warning' as const };
  }
  return { label: 'Success', severity: 'success' as const };
}

export default function WebhooksPage() {
  const { events } = useLiveEvents();
  const [data, setData] = useState<WebhooksResponse | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AdminLiveEvent | null>(null);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [revealedWebhookIds, setRevealedWebhookIds] = useState<Set<string>>(() => new Set());
  const [tokenReveals, setTokenReveals] = useState<Record<string, WebhookTokenRevealResponse>>({});
  const [revealingWebhookId, setRevealingWebhookId] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getWebhooks();
      setData(response);
      setSelectedWebhookId((current) => current || response.webhookUrls.find((webhook) => webhook.url && webhook.status === 'configured')?.id || null);
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

  const activeWebhookUrls = useMemo(
    () => (data?.webhookUrls || []).filter((webhook) => Boolean(webhook.url) && webhook.status === 'configured'),
    [data?.webhookUrls],
  );
  const visibleWebhookUrls = activeWebhookUrls;
  const selectedWebhook = useMemo(
    () => visibleWebhookUrls.find((webhook) => webhook.id === selectedWebhookId) || visibleWebhookUrls[0] || null,
    [selectedWebhookId, visibleWebhookUrls],
  );
  const selectedWebhookEvents = useMemo(
    () => (selectedWebhook ? webhookEvents.filter((event) => eventBelongsToWebhook(event, selectedWebhook)) : []),
    [selectedWebhook, webhookEvents],
  );

  useEffect(() => {
    if (!selectedWebhook) {
      setSelectedEvent(null);
      return;
    }

    setSelectedEvent((current) =>
      current && selectedWebhookEvents.some((event) => event.id === current.id) ? current : selectedWebhookEvents[0] || null,
    );
  }, [selectedWebhook, selectedWebhookEvents]);

  const copyWebhookUrl = async (webhook: WebhookReference) => {
    if (!webhook.url) return;

    await navigator.clipboard.writeText(webhook.url);
    setCopiedWebhookId(webhook.id);
    window.setTimeout(() => setCopiedWebhookId(null), 1800);
  };

  const copyToken = async (tokenId: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedTokenId(tokenId);
    window.setTimeout(() => setCopiedTokenId(null), 1800);
  };

  const selectWebhookLogs = (webhook: WebhookReference) => {
    setSelectedWebhookId(webhook.id);
    window.setTimeout(() => document.getElementById('webhook-url-logs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const toggleTokenReveal = async (webhook: WebhookReference) => {
    setTokenError(null);

    if (revealedWebhookIds.has(webhook.id)) {
      setRevealedWebhookIds((current) => {
        const next = new Set(current);
        next.delete(webhook.id);
        return next;
      });
      return;
    }

    if (!tokenReveals[webhook.id]) {
      try {
        setRevealingWebhookId(webhook.id);
        const response = await adminApi.revealWebhookToken(webhook.id);
        setTokenReveals((current) => ({ ...current, [webhook.id]: response }));
      } catch (error) {
        setTokenError(error instanceof Error ? error.message : 'Failed to reveal webhook token.');
        return;
      } finally {
        setRevealingWebhookId(null);
      }
    }

    setRevealedWebhookIds((current) => new Set(current).add(webhook.id));
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
        title="Webhook Manager"
        description="Active webhook URLs, token reveal controls, and per-URL delivery logs across Meta, Messenger, payments, and developer endpoints."
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
      {tokenError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{tokenError}</div> : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Active URLs" value={formatNumber(data.summary.activeWebhookUrls)} detail={`${formatNumber(data.webhookUrls.length)} total references`} Icon={Webhook} tone="violet" />
            <MetricCard label="Events 24h" value={formatNumber(data.summary.events24h)} detail="Lead, payment, message, and call events" Icon={CheckCircle2} tone="emerald" />
            <MetricCard label="Failed events" value={formatNumber(data.summary.failedEvents)} detail="Events marked error or failed" Icon={AlertTriangle} tone={data.summary.failedEvents ? 'rose' : 'slate'} />
            <MetricCard label="Token sources" value={formatNumber(data.webhookUrls.filter((webhook) => webhook.token.hasToken).length)} detail={`${formatNumber(data.summary.activeLeadConfigs)} active lead configs`} Icon={KeyRound} tone="sky" />
          </div>

          <Panel
            title="Active Webhook URLs"
            description="Callback URLs currently configured for platform and customer webhook traffic."
          >
            {visibleWebhookUrls.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                No active webhook URLs are available. Configure CLIENT_API_BASE_URL or activate a developer endpoint.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleWebhookUrls.map((webhook) => {
                const tone = getWebhookStatusTone(webhook.status);
                const copied = copiedWebhookId === webhook.id;
                const isRevealed = revealedWebhookIds.has(webhook.id);
                const revealResponse = tokenReveals[webhook.id];
                const isRevealing = revealingWebhookId === webhook.id;

                return (
                  <article key={webhook.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-950">{webhook.name}</h3>
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

                    <div className="mt-4 grid gap-3 text-xs text-gray-500 sm:grid-cols-3">
                      <div className="rounded-2xl border border-gray-200 bg-white p-3">
                        <p className="font-semibold uppercase tracking-[0.14em] text-gray-400">Token source</p>
                        <p className="mt-2 break-words font-mono text-gray-600">{webhook.verifyTokenEnv || webhook.token.source}</p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-3">
                        <p className="font-semibold uppercase tracking-[0.14em] text-gray-400">Recent logs</p>
                        <p className="mt-2 text-gray-600">
                          {formatNumber(webhook.eventCount)} events, {formatNumber(webhook.failureCount)} failures
                        </p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-3">
                        <p className="font-semibold uppercase tracking-[0.14em] text-gray-400">Events</p>
                        <p className="mt-2 leading-5 text-gray-600">{webhook.events.join(', ')}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Token key</p>
                          <p className="mt-1 break-words font-mono text-xs text-gray-600">
                            {webhook.token.hasToken ? webhook.token.maskedValue : 'Not configured'}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleTokenReveal(webhook)}
                            disabled={!webhook.token.hasToken || isRevealing}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isRevealing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isRevealed ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            {isRevealed ? 'Hide token' : 'Reveal token'}
                          </button>
                          <button
                            type="button"
                            onClick={() => selectWebhookLogs(webhook)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#111827] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1f2937]"
                          >
                            <ListChecks className="h-4 w-4" />
                            View logs
                          </button>
                        </div>
                      </div>

                      {isRevealed ? (
                        <div className="thin-scrollbar mt-3 max-h-48 overflow-y-auto space-y-2">
                          {revealResponse?.tokens.length ? (
                            revealResponse.tokens.map((token) => {
                              const tokenCopyId = `${webhook.id}:${token.id}`;
                              return (
                                <div key={token.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-gray-800">{token.label}</p>
                                      <p className="mt-1 text-[11px] text-gray-500">{token.source}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void copyToken(tokenCopyId, token.value)}
                                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                                      aria-label={`Copy ${token.label}`}
                                      title={`Copy ${token.label}`}
                                    >
                                      {copiedTokenId === tokenCopyId ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                  </div>
                                  <code className="mt-2 block break-all text-xs text-gray-700">{token.value}</code>
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                              No token value is available for this webhook.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
                })}
              </div>
            )}
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

            <div id="webhook-url-logs">
              <Panel
                title="Webhook URL logs"
                description={
                  selectedWebhook
                    ? `${selectedWebhook.name}: ${formatNumber(selectedWebhookEvents.length)} matching events`
                    : 'Select a webhook URL to inspect its events.'
                }
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <div className="thin-scrollbar max-h-[720px] overflow-y-auto space-y-3">
                    {selectedWebhookEvents.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
                        No events are currently linked to this webhook URL.
                      </div>
                    ) : (
                      selectedWebhookEvents.map((event) => {
                        const outcome = getWebhookEventOutcome(event);
                        return (
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
                              <StatusBadge status={outcome.label} severity={outcome.severity} compact />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              {event.table ? <span>{event.table}</span> : null}
                              {event.status ? <span>Status: {labelize(event.status)}</span> : null}
                              {event.userId ? <span className="font-mono">{event.userId}</span> : null}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-950 p-4 text-gray-100">
                    {selectedEvent ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const outcome = getWebhookEventOutcome(selectedEvent);
                            return <StatusBadge status={outcome.label} severity={outcome.severity} compact />;
                          })()}
                          <StatusBadge status={selectedEvent.status || selectedEvent.eventType} severity={selectedEvent.severity} compact />
                          <span className="text-xs text-gray-400">{formatDateTime(selectedEvent.occurredAt)}</span>
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-white">{selectedEvent.title}</h3>
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
          </div>

          <Panel title="Condensed live feed">
            <LiveEventFeed events={webhookEvents.slice(0, 20)} dense maxHeightClass="max-h-[420px]" />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
