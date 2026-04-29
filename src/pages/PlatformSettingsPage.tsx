import { useEffect, useMemo, useState } from 'react';
import {
  Code2,
  CreditCard,
  Flag,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type {
  AdminOrganizationRow,
  PlatformEmailTemplate,
  UserPlatformSettings,
} from '../lib/types';
import { formatDateTime, labelize } from '../lib/format';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

type TabId = 'pricing_plans' | 'feature_flags' | 'rate_limits' | 'api_keys' | 'email_templates';

const tabs: Array<{ id: TabId; label: string; Icon: typeof CreditCard }> = [
  { id: 'pricing_plans', label: 'Pricing plans', Icon: CreditCard },
  { id: 'feature_flags', label: 'Feature flags', Icon: Flag },
  { id: 'rate_limits', label: 'Rate limits', Icon: Zap },
  { id: 'api_keys', label: 'API keys', Icon: KeyRound },
  { id: 'email_templates', label: 'Email templates', Icon: Mail },
];

const inputClass = 'w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500';

function splitFeatures(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}`;
}

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<UserPlatformSettings | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrganizationRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('pricing_plans');
  const [activeTemplateId, setActiveTemplateId] = useState('invite_user');
  const [isLoading, setIsLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<TabId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const [settingsResponse, organizationResponse] = await Promise.all([
        adminApi.getPlatformSettings(),
        adminApi.getOrganizations().catch(() => ({ organizations: [] as AdminOrganizationRow[] })),
      ]);
      setSettings(settingsResponse.settings);
      setWarning(settingsResponse.warning);
      setOrganizations(organizationResponse.organizations);
      setActiveTemplateId(settingsResponse.settings.email_templates.templates[0]?.id || 'invite_user');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load platform settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateSettings = (updater: (current: UserPlatformSettings) => UserPlatformSettings) => {
    setSettings((current) => (current ? updater(current) : current));
  };

  const saveSection = async (section: TabId) => {
    if (!settings) return;
    try {
      setSavingSection(section);
      setError(null);
      setNotice(null);
      const response = await adminApi.updatePlatformSettingsSection(section, settings[section]);
      setSettings(response.settings);
      setWarning(response.warning);
      setNotice(`${tabs.find((tab) => tab.id === section)?.label || 'Settings'} saved.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save platform settings.');
    } finally {
      setSavingSection(null);
    }
  };

  const selectedTemplate = useMemo(
    () => settings?.email_templates.templates.find((template) => template.id === activeTemplateId) || settings?.email_templates.templates[0] || null,
    [activeTemplateId, settings],
  );

  const addFeatureOverride = () => {
    if (!settings) return;
    const existing = new Set(settings.feature_flags.orgOverrides.map((override) => override.orgId));
    const organization = organizations.find((item) => !existing.has(item.orgId)) || organizations[0];
    if (!organization) return;

    const flags = Object.fromEntries(settings.feature_flags.flags.map((flag) => [flag.key, flag.enabled]));
    updateSettings((current) => ({
      ...current,
      feature_flags: {
        ...current.feature_flags,
        orgOverrides: [
          ...current.feature_flags.orgOverrides,
          { orgId: organization.orgId, orgName: organization.orgName, flags },
        ],
      },
    }));
  };

  const addRateOverride = () => {
    if (!settings) return;
    const existing = new Set(settings.rate_limits.orgOverrides.map((override) => override.orgId));
    const organization = organizations.find((item) => !existing.has(item.orgId)) || organizations[0];
    if (!organization) return;

    updateSettings((current) => ({
      ...current,
      rate_limits: {
        ...current.rate_limits,
        orgOverrides: [
          ...current.rate_limits.orgOverrides,
          {
            orgId: organization.orgId,
            orgName: organization.orgName,
            messagesPerMinute: current.rate_limits.default.messagesPerMinute,
            apiRequestsPerMinute: current.rate_limits.default.apiRequestsPerMinute,
          },
        ],
      },
    }));
  };

  if (isLoading && !settings) {
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
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">User Platform Settings</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Control app.connektly.in pricing, feature availability, limits, keys, and transactional email templates from one place.
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

      {warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {settings ? (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[24px] border border-gray-200 bg-white p-3 shadow-sm">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      isActive ? 'bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/20' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                    }`}
                  >
                    <tab.Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    <span className="min-w-0 truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            {activeTab === 'pricing_plans' ? (
              <Panel
                title="Pricing plans"
                description="Plans saved here are available to app.connektly.in through the platform settings endpoint/RPC."
                action={
                  <button
                    type="button"
                    disabled={savingSection === 'pricing_plans'}
                    onClick={() => void saveSection('pricing_plans')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSection === 'pricing_plans' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save plans
                  </button>
                }
              >
                <div className="space-y-4">
                  {settings.pricing_plans.plans.map((plan, index) => (
                    <div key={plan.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid gap-4 xl:grid-cols-[1fr_120px_120px_120px_auto]">
                        <label className="block">
                          <span className={labelClass}>Plan name</span>
                          <input
                            value={plan.name}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const plans = [...current.pricing_plans.plans];
                                plans[index] = { ...plans[index], name: event.target.value };
                                return { ...current, pricing_plans: { plans } };
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Monthly</span>
                          <input
                            type="number"
                            value={plan.monthlyPrice}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const plans = [...current.pricing_plans.plans];
                                plans[index] = { ...plans[index], monthlyPrice: Number(event.target.value) };
                                return { ...current, pricing_plans: { plans } };
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Annual</span>
                          <input
                            type="number"
                            value={plan.annualPrice}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const plans = [...current.pricing_plans.plans];
                                plans[index] = { ...plans[index], annualPrice: Number(event.target.value) };
                                return { ...current, pricing_plans: { plans } };
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Credits</span>
                          <input
                            type="number"
                            value={plan.credits}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const plans = [...current.pricing_plans.plans];
                                plans[index] = { ...plans[index], credits: Number(event.target.value) };
                                return { ...current, pricing_plans: { plans } };
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            updateSettings((current) => ({
                              ...current,
                              pricing_plans: { plans: current.pricing_plans.plans.filter((_, planIndex) => planIndex !== index) },
                            }))
                          }
                          className="self-end rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                        <label className="block">
                          <span className={labelClass}>Features</span>
                          <textarea
                            value={plan.features.join('\n')}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const plans = [...current.pricing_plans.plans];
                                plans[index] = { ...plans[index], features: splitFeatures(event.target.value) };
                                return { ...current, pricing_plans: { plans } };
                              })
                            }
                            rows={4}
                            className={`${inputClass} resize-none`}
                          />
                        </label>
                        <div className="space-y-3 pt-6">
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={plan.isActive}
                              onChange={(event) =>
                                updateSettings((current) => {
                                  const plans = [...current.pricing_plans.plans];
                                  plans[index] = { ...plans[index], isActive: event.target.checked };
                                  return { ...current, pricing_plans: { plans } };
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                            />
                            Active plan
                          </label>
                          <label className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={plan.isRecommended}
                              onChange={(event) =>
                                updateSettings((current) => {
                                  const plans = current.pricing_plans.plans.map((item, planIndex) => ({
                                    ...item,
                                    isRecommended: planIndex === index ? event.target.checked : false,
                                  }));
                                  return { ...current, pricing_plans: { plans } };
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                            />
                            Recommended
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings((current) => ({
                        ...current,
                        pricing_plans: {
                          plans: [
                            ...current.pricing_plans.plans,
                            {
                              id: makeId('plan'),
                              name: 'New plan',
                              currency: 'INR',
                              monthlyPrice: 0,
                              annualPrice: 0,
                              credits: 0,
                              features: [],
                              isActive: false,
                              isRecommended: false,
                            },
                          ],
                        },
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add plan
                  </button>
                </div>
              </Panel>
            ) : null}

            {activeTab === 'feature_flags' ? (
              <Panel
                title="Feature flags"
                description="Enable or disable features globally, then override per organization when needed."
                action={
                  <button
                    type="button"
                    disabled={savingSection === 'feature_flags'}
                    onClick={() => void saveSection('feature_flags')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSection === 'feature_flags' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save flags
                  </button>
                }
              >
                <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="space-y-3">
                    {settings.feature_flags.flags.map((flag, index) => (
                      <div key={flag.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <input
                              value={flag.label}
                              onChange={(event) =>
                                updateSettings((current) => {
                                  const flags = [...current.feature_flags.flags];
                                  flags[index] = { ...flags[index], label: event.target.value };
                                  return { ...current, feature_flags: { ...current.feature_flags, flags } };
                                })
                              }
                              className="w-full bg-transparent text-sm font-semibold text-gray-950 outline-none"
                            />
                            <input
                              value={flag.description}
                              onChange={(event) =>
                                updateSettings((current) => {
                                  const flags = [...current.feature_flags.flags];
                                  flags[index] = { ...flags[index], description: event.target.value };
                                  return { ...current, feature_flags: { ...current.feature_flags, flags } };
                                })
                              }
                              className="mt-1 w-full bg-transparent text-sm text-gray-500 outline-none"
                            />
                          </div>
                          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={flag.enabled}
                              onChange={(event) =>
                                updateSettings((current) => {
                                  const flags = [...current.feature_flags.flags];
                                  flags[index] = { ...flags[index], enabled: event.target.checked };
                                  return { ...current, feature_flags: { ...current.feature_flags, flags } };
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                            />
                            {flag.enabled ? 'Enabled' : 'Disabled'}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-950">Per-org overrides</h3>
                      <button
                        type="button"
                        onClick={addFeatureOverride}
                        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Plus className="h-4 w-4" />
                        Add override
                      </button>
                    </div>
                    {settings.feature_flags.orgOverrides.length ? (
                      settings.feature_flags.orgOverrides.map((override, overrideIndex) => (
                        <div key={`${override.orgId}-${overrideIndex}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <select
                            value={override.orgId}
                            onChange={(event) => {
                              const organization = organizations.find((item) => item.orgId === event.target.value);
                              updateSettings((current) => {
                                const orgOverrides = [...current.feature_flags.orgOverrides];
                                orgOverrides[overrideIndex] = {
                                  ...orgOverrides[overrideIndex],
                                  orgId: event.target.value,
                                  orgName: organization?.orgName || '',
                                };
                                return { ...current, feature_flags: { ...current.feature_flags, orgOverrides } };
                              });
                            }}
                            className={inputClass}
                          >
                            {organizations.map((organization) => (
                              <option key={organization.orgId} value={organization.orgId}>
                                {organization.orgName}
                              </option>
                            ))}
                          </select>
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            {settings.feature_flags.flags.map((flag) => (
                              <label key={flag.key} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={Boolean(override.flags[flag.key])}
                                  onChange={(event) =>
                                    updateSettings((current) => {
                                      const orgOverrides = [...current.feature_flags.orgOverrides];
                                      const currentOverride = orgOverrides[overrideIndex];
                                      orgOverrides[overrideIndex] = {
                                        ...currentOverride,
                                        flags: { ...currentOverride.flags, [flag.key]: event.target.checked },
                                      };
                                      return { ...current, feature_flags: { ...current.feature_flags, orgOverrides } };
                                    })
                                  }
                                  className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                                />
                                {flag.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
                        No organization overrides yet.
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            ) : null}

            {activeTab === 'rate_limits' ? (
              <Panel
                title="Rate limits"
                description="Control messages per minute and API usage for app.connektly.in."
                action={
                  <button
                    type="button"
                    disabled={savingSection === 'rate_limits'}
                    onClick={() => void saveSection('rate_limits')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSection === 'rate_limits' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save limits
                  </button>
                }
              >
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>Default messages/minute</span>
                      <input
                        type="number"
                        value={settings.rate_limits.default.messagesPerMinute}
                        onChange={(event) =>
                          updateSettings((current) => ({
                            ...current,
                            rate_limits: {
                              ...current.rate_limits,
                              default: { ...current.rate_limits.default, messagesPerMinute: Number(event.target.value) },
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Default API requests/minute</span>
                      <input
                        type="number"
                        value={settings.rate_limits.default.apiRequestsPerMinute}
                        onChange={(event) =>
                          updateSettings((current) => ({
                            ...current,
                            rate_limits: {
                              ...current.rate_limits,
                              default: { ...current.rate_limits.default, apiRequestsPerMinute: Number(event.target.value) },
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-950">Organization limit overrides</h3>
                    <button
                      type="button"
                      onClick={addRateOverride}
                      className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add override
                    </button>
                  </div>
                  <div className="space-y-3">
                    {settings.rate_limits.orgOverrides.map((override, index) => (
                      <div key={`${override.orgId}-${index}`} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1fr_160px_160px_auto]">
                        <select
                          value={override.orgId}
                          onChange={(event) => {
                            const organization = organizations.find((item) => item.orgId === event.target.value);
                            updateSettings((current) => {
                              const orgOverrides = [...current.rate_limits.orgOverrides];
                              orgOverrides[index] = {
                                ...orgOverrides[index],
                                orgId: event.target.value,
                                orgName: organization?.orgName || '',
                              };
                              return { ...current, rate_limits: { ...current.rate_limits, orgOverrides } };
                            });
                          }}
                          className={inputClass}
                        >
                          {organizations.map((organization) => (
                            <option key={organization.orgId} value={organization.orgId}>
                              {organization.orgName}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={override.messagesPerMinute}
                          onChange={(event) =>
                            updateSettings((current) => {
                              const orgOverrides = [...current.rate_limits.orgOverrides];
                              orgOverrides[index] = { ...orgOverrides[index], messagesPerMinute: Number(event.target.value) };
                              return { ...current, rate_limits: { ...current.rate_limits, orgOverrides } };
                            })
                          }
                          className={inputClass}
                          aria-label="Messages per minute"
                        />
                        <input
                          type="number"
                          value={override.apiRequestsPerMinute}
                          onChange={(event) =>
                            updateSettings((current) => {
                              const orgOverrides = [...current.rate_limits.orgOverrides];
                              orgOverrides[index] = { ...orgOverrides[index], apiRequestsPerMinute: Number(event.target.value) };
                              return { ...current, rate_limits: { ...current.rate_limits, orgOverrides } };
                            })
                          }
                          className={inputClass}
                          aria-label="API requests per minute"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateSettings((current) => ({
                              ...current,
                              rate_limits: {
                                ...current.rate_limits,
                                orgOverrides: current.rate_limits.orgOverrides.filter((_, overrideIndex) => overrideIndex !== index),
                              },
                            }))
                          }
                          className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            ) : null}

            {activeTab === 'api_keys' ? (
              <Panel
                title="API keys"
                description="Secrets are stored server-side and masked after save. Leave a key field blank to keep the current value."
                action={
                  <button
                    type="button"
                    disabled={savingSection === 'api_keys'}
                    onClick={() => void saveSection('api_keys')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSection === 'api_keys' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save keys
                  </button>
                }
              >
                <div className="space-y-4">
                  {settings.api_keys.keys.map((apiKey, index) => (
                    <div key={apiKey.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.3fr_auto]">
                        <label className="block">
                          <span className={labelClass}>Name</span>
                          <input
                            value={apiKey.name}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const keys = [...current.api_keys.keys];
                                keys[index] = { ...keys[index], name: event.target.value };
                                return { ...current, api_keys: { keys } };
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Scope</span>
                          <input
                            value={apiKey.scope}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const keys = [...current.api_keys.keys];
                                keys[index] = { ...keys[index], scope: event.target.value };
                                return { ...current, api_keys: { keys } };
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>{apiKey.maskedKey ? `Current: ${apiKey.maskedKey}` : 'Secret key'}</span>
                          <input
                            value={apiKey.key}
                            onChange={(event) =>
                              updateSettings((current) => {
                                const keys = [...current.api_keys.keys];
                                keys[index] = { ...keys[index], key: event.target.value };
                                return { ...current, api_keys: { keys } };
                              })
                            }
                            className={inputClass}
                            placeholder="Enter only to rotate"
                          />
                        </label>
                        <div className="flex items-end gap-3">
                          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={apiKey.isActive}
                              onChange={(event) =>
                                updateSettings((current) => {
                                  const keys = [...current.api_keys.keys];
                                  keys[index] = { ...keys[index], isActive: event.target.checked };
                                  return { ...current, api_keys: { keys } };
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                            />
                            Active
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              updateSettings((current) => ({
                                ...current,
                                api_keys: { keys: current.api_keys.keys.filter((_, keyIndex) => keyIndex !== index) },
                              }))
                            }
                            className="mb-1 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                        <span>Updated {formatDateTime(apiKey.updatedAt)}</span>
                        <span>Rotated {formatDateTime(apiKey.lastRotatedAt)}</span>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings((current) => ({
                        ...current,
                        api_keys: {
                          keys: [
                            ...current.api_keys.keys,
                            {
                              id: makeId('api_key'),
                              name: 'New API key',
                              scope: 'general',
                              key: '',
                              maskedKey: '',
                              isActive: false,
                              createdAt: null,
                              updatedAt: null,
                              lastRotatedAt: null,
                            },
                          ],
                        },
                      }))
                    }
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add API key
                  </button>
                </div>
              </Panel>
            ) : null}

            {activeTab === 'email_templates' ? (
              <Panel
                title="Email templates"
                description="Manage app-owned templates such as invite user, password reset, and magic-link emails."
                action={
                  <button
                    type="button"
                    disabled={savingSection === 'email_templates'}
                    onClick={() => void saveSection('email_templates')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#5b45ff] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSection === 'email_templates' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save templates
                  </button>
                }
              >
                <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    {settings.email_templates.templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setActiveTemplateId(template.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          selectedTemplate?.id === template.id
                            ? 'border-[#5b45ff] bg-[#f5f3ff] text-[#5b45ff]'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
                        }`}
                      >
                        <span className="block truncate">{template.name}</span>
                        <span className="mt-1 block text-xs font-normal text-gray-500">{template.enabled ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        updateSettings((current) => {
                          const template: PlatformEmailTemplate = {
                            id: makeId('template'),
                            name: 'New template',
                            subject: '',
                            body: '',
                            enabled: false,
                            updatedAt: null,
                          };
                          setActiveTemplateId(template.id);
                          return {
                            ...current,
                            email_templates: { templates: [...current.email_templates.templates, template] },
                          };
                        })
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add template
                    </button>
                  </div>

                  {selectedTemplate ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <StatusBadge status={selectedTemplate.enabled ? 'enabled' : 'disabled'} severity={selectedTemplate.enabled ? 'success' : 'warning'} />
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedTemplate.enabled}
                            onChange={(event) =>
                              updateSettings((current) => ({
                                ...current,
                                email_templates: {
                                  templates: current.email_templates.templates.map((template) =>
                                    template.id === selectedTemplate.id ? { ...template, enabled: event.target.checked } : template,
                                  ),
                                },
                              }))
                            }
                            className="h-4 w-4 rounded border-gray-300 text-[#5b45ff]"
                          />
                          Enabled
                        </label>
                      </div>
                      <label className="block">
                        <span className={labelClass}>Template name</span>
                        <input
                          value={selectedTemplate.name}
                          onChange={(event) =>
                            updateSettings((current) => ({
                              ...current,
                              email_templates: {
                                templates: current.email_templates.templates.map((template) =>
                                  template.id === selectedTemplate.id ? { ...template, name: event.target.value } : template,
                                ),
                              },
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Subject</span>
                        <input
                          value={selectedTemplate.subject}
                          onChange={(event) =>
                            updateSettings((current) => ({
                              ...current,
                              email_templates: {
                                templates: current.email_templates.templates.map((template) =>
                                  template.id === selectedTemplate.id ? { ...template, subject: event.target.value } : template,
                                ),
                              },
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Body</span>
                        <textarea
                          value={selectedTemplate.body}
                          onChange={(event) =>
                            updateSettings((current) => ({
                              ...current,
                              email_templates: {
                                templates: current.email_templates.templates.map((template) =>
                                  template.id === selectedTemplate.id ? { ...template, body: event.target.value } : template,
                                ),
                              },
                            }))
                          }
                          rows={12}
                          className={`${inputClass} resize-y font-mono leading-6`}
                        />
                      </label>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-500">
                        <Code2 className="mb-2 h-5 w-5 text-gray-400" />
                        Supported placeholders are stored as text and resolved by the main app/email worker, for example:
                        {' {{user_name}}, {{organization_name}}, {{invite_url}}, {{reset_url}}, {{magic_link}}'}.
                      </div>
                    </div>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            <Panel title="Main app consumption">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <SlidersHorizontal className="h-5 w-5 text-[#5b45ff]" />
                    <p className="text-sm font-semibold text-gray-950">Runtime settings source</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    app.connektly.in can read public settings with Supabase RPC `get_user_platform_settings`.
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <KeyRound className="h-5 w-5 text-[#5b45ff]" />
                    <p className="text-sm font-semibold text-gray-950">Secret handling</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    API keys are stored for server-side use and are excluded from the public RPC response.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}
