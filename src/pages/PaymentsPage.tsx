import { useEffect, useState } from 'react';
import { CreditCard, IndianRupee, Loader2, ReceiptText, RefreshCcw, TrendingUp } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { PaymentsResponse } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

export default function PaymentsPage() {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setData(await adminApi.getPayments());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load payments.');
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
      <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Billing and credit control</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Subscription state, Razorpay references, WhatsApp credits, and payment webhook activity.
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
            <MetricCard label="Billing profiles" value={formatNumber(data.summary.profiles)} detail="Workspace profiles with billing columns" Icon={CreditCard} tone="violet" />
            <MetricCard label="Active subscriptions" value={formatNumber(data.summary.activeSubscriptions)} detail={`${formatNumber(data.summary.trialing)} workspaces trialing`} Icon={TrendingUp} tone="emerald" />
            <MetricCard label="Ledger balance" value={formatNumber(data.summary.ledgerBalance)} detail={`${formatNumber(data.summary.ledgerAdditions)} added`} Icon={IndianRupee} tone="sky" />
            <MetricCard label="Ledger deductions" value={formatNumber(data.summary.ledgerDeductions)} detail="Total deducted across credit ledger" Icon={ReceiptText} tone="amber" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-6">
              <Panel title="Billing status">
                <div className="space-y-3">
                  {Object.entries(data.billingBreakdown).map(([status, count]) => (
                    <div key={status} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <StatusBadge status={status} compact />
                        <span className="text-sm font-semibold text-gray-950">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Plans">
                <div className="space-y-3">
                  {Object.entries(data.planBreakdown).map(([plan, count]) => (
                    <div key={plan} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-950">{labelize(plan)}</span>
                        <span className="text-sm font-semibold text-[#5b45ff]">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel title="Workspace subscriptions" description={`Generated ${formatDateTime(data.generatedAt)}`}>
              <div className="thin-scrollbar overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-[0.16em] text-gray-500">
                      <th className="pb-3 pr-4 font-semibold">Workspace</th>
                      <th className="pb-3 pr-4 font-semibold">Plan</th>
                      <th className="pb-3 pr-4 font-semibold">Status</th>
                      <th className="pb-3 pr-4 font-semibold">Cycle</th>
                      <th className="pb-3 font-semibold">Razorpay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.profiles.map((profile) => (
                      <tr key={String(profile.user_id)} className="align-top">
                        <td className="py-4 pr-4">
                          <div className="font-semibold text-gray-950">{String(profile.company_name || profile.full_name || 'Workspace')}</div>
                          <div className="mt-1 text-xs text-gray-500">{String(profile.email || profile.user_id)}</div>
                        </td>
                        <td className="py-4 pr-4 text-gray-700">{labelize(profile.selected_plan)}</td>
                        <td className="py-4 pr-4">
                          <StatusBadge status={profile.billing_status || 'unknown'} compact />
                        </td>
                        <td className="py-4 pr-4 text-gray-700">{labelize(profile.billing_cycle)}</td>
                        <td className="py-4 font-mono text-xs text-gray-500">{String(profile.razorpay_subscription_id || 'Not linked')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Recent credit ledger">
              <div className="thin-scrollbar max-h-[520px] overflow-y-auto">
                <div className="space-y-3">
                  {data.creditLedger.slice(0, 80).map((entry) => (
                    <div key={String(entry.id)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">{String(entry.description || 'Credit entry')}</p>
                          <p className="mt-1 text-xs text-gray-500">{formatDateTime(entry.created_at)}</p>
                        </div>
                        <span className={`text-sm font-semibold ${entry.type === 'deduction' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {entry.type === 'deduction' ? '-' : '+'}
                          {formatNumber(Number(entry.amount || 0))}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-mono text-xs text-gray-400">{String(entry.user_id)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Payment webhooks">
              <div className="thin-scrollbar max-h-[520px] overflow-y-auto">
                <div className="space-y-3">
                  {data.paymentEvents.slice(0, 80).map((event) => (
                    <div key={String(event.id)} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">{String(event.configuration_name || 'Payment configuration')}</p>
                          <p className="mt-1 text-xs text-gray-500">{formatDateTime(event.created_at)}</p>
                        </div>
                        <StatusBadge status={event.status || 'received'} compact />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                        <span>Provider: {String(event.provider_name || 'Unknown')}</span>
                        <span>MID: {String(event.provider_mid || 'Not available')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
