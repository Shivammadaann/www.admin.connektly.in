import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Globe2, Loader2, Plus, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { PlatformPricingPlan } from '../lib/types';
import { formatCurrency, formatDateTime, formatNumber } from '../lib/format';
import MetricCard from '../components/MetricCard';
import Panel from '../components/Panel';

const inputClass = 'w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500';

function splitFeatures(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function makePlanId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || `plan_${Date.now().toString(36)}`;
}

function newPlan(): PlatformPricingPlan {
  return {
    id: `plan_${Date.now().toString(36)}`,
    name: 'New plan',
    currency: 'INR',
    monthlyPrice: 0,
    annualPrice: 0,
    credits: 0,
    features: [],
    isActive: true,
    isRecommended: false,
  };
}

function normalizePrice(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

export default function PlanManagementPage() {
  const [plans, setPlans] = useState<PlatformPricingPlan[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activePlans = useMemo(() => plans.filter((plan) => plan.isActive), [plans]);
  const recommendedPlan = useMemo(() => plans.find((plan) => plan.isRecommended) || null, [plans]);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getPlans();
      setPlans(response.plans);
      setGeneratedAt(response.generatedAt);
      setWarning(response.warning);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load plans.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updatePlans = (updater: (plans: PlatformPricingPlan[]) => PlatformPricingPlan[]) => {
    setPlans((current) => updater(current));
  };

  const save = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = await adminApi.updatePlans(plans);
      setPlans(response.plans);
      setGeneratedAt(response.generatedAt);
      setWarning(response.warning);
      setNotice('Global plan catalog saved. Website and app pricing will use this catalog.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save plans.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && plans.length === 0) {
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
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Plan Management</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Manage global plan names, prices, and feature lists from one dashboard. Saved active plans power the public pricing page and the app onboarding checkout.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save plans
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-3">
        <MetricCard label="Active Plans" value={formatNumber(activePlans.length)} detail="Visible globally" Icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Total Plans" value={formatNumber(plans.length)} detail="Saved in catalog" Icon={CreditCard} tone="violet" />
        <MetricCard label="Recommended" value={recommendedPlan?.name || 'None'} detail="Highlighted on pricing cards" Icon={Globe2} tone="sky" />
      </div>

      {warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <Panel
        title="Global Plans"
        description={generatedAt ? `Last loaded ${formatDateTime(generatedAt)}` : 'Create, edit, activate, and reorder plans.'}
        action={
          <button
            type="button"
            onClick={() => updatePlans((current) => [...current, newPlan()])}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Add plan
          </button>
        }
      >
        {plans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            No plans yet. Add a plan to publish pricing globally.
          </div>
        ) : (
          <div className="space-y-4">
            {plans.map((plan, index) => (
              <article key={plan.id} className="rounded-[22px] border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_140px_140px_120px_auto]">
                  <label className="block">
                    <span className={labelClass}>Plan name</span>
                    <input
                      value={plan.name}
                      onChange={(event) => {
                        const name = event.target.value;
                        updatePlans((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], name, id: next[index].id.startsWith('plan_') ? makePlanId(name) : next[index].id };
                          return next;
                        });
                      }}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Monthly price</span>
                    <input
                      type="number"
                      min="0"
                      value={plan.monthlyPrice}
                      onChange={(event) =>
                        updatePlans((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], monthlyPrice: normalizePrice(event.target.value) };
                          return next;
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Annual price</span>
                    <input
                      type="number"
                      min="0"
                      value={plan.annualPrice}
                      onChange={(event) =>
                        updatePlans((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], annualPrice: normalizePrice(event.target.value) };
                          return next;
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Credits</span>
                    <input
                      type="number"
                      min="0"
                      value={plan.credits}
                      onChange={(event) =>
                        updatePlans((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], credits: normalizePrice(event.target.value) };
                          return next;
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updatePlans((current) => current.filter((_, planIndex) => planIndex !== index))}
                    className="self-end rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                    aria-label={`Delete ${plan.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <label className="block">
                    <span className={labelClass}>Features</span>
                    <textarea
                      value={plan.features.join('\n')}
                      onChange={(event) =>
                        updatePlans((current) => {
                          const next = [...current];
                          next[index] = { ...next[index], features: splitFeatures(event.target.value) };
                          return next;
                        })
                      }
                      rows={5}
                      placeholder="One feature per line"
                      className={`${inputClass} resize-y`}
                    />
                  </label>

                  <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Publishing</p>
                    <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={plan.isActive}
                        onChange={(event) =>
                          updatePlans((current) => {
                            const next = [...current];
                            next[index] = { ...next[index], isActive: event.target.checked };
                            return next;
                          })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                      />
                      Show this plan globally
                    </label>
                    <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={plan.isRecommended}
                        onChange={(event) =>
                          updatePlans((current) =>
                            current.map((item, planIndex) => ({
                              ...item,
                              isRecommended: planIndex === index ? event.target.checked : false,
                            })),
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                      />
                      Mark as recommended
                    </label>
                    <div className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">
                      <p className="font-semibold text-gray-950">{formatCurrency(plan.monthlyPrice, plan.currency)}</p>
                      <p className="mt-1">Monthly price</p>
                      <p className="mt-3 font-semibold text-gray-950">{formatCurrency(plan.annualPrice, plan.currency)}</p>
                      <p className="mt-1">Annual price</p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
