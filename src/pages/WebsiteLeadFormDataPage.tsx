import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCcw,
  Search,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { WebsiteLeadFormsResponse, WebsiteLeadSubmission, WebsiteLeadSubmissionType } from '../lib/types';
import { formatDateTime, formatNumber, labelize } from '../lib/format';
import MetricCard from '../components/MetricCard';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';

type TabId = 'booked_demo' | 'lead_inquiry';

const tabs: Array<{ id: TabId; label: string; description: string }> = [
  { id: 'booked_demo', label: 'Booked Demos', description: 'Demo requests submitted from the website.' },
  { id: 'lead_inquiry', label: 'Lead Inquiries', description: 'Contact, pricing, and other website lead forms.' },
];

function resolveWebsiteUrl(value: string | null | undefined, publicBaseUrl: string) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${publicBaseUrl.replace(/\/$/, '')}${value.startsWith('/') ? value : `/${value}`}`;
}

function formatFieldValue(value: string | string[]) {
  return Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
}

function fieldEntries(submission: WebsiteLeadSubmission) {
  return Object.entries(submission.fields)
    .filter(([, value]) => formatFieldValue(value).trim().length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function matchesSearch(submission: WebsiteLeadSubmission, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    submission.name,
    submission.email,
    submission.phone,
    submission.company,
    submission.topic,
    submission.message,
    submission.sourcePath,
    submission.pageTitle,
    ...Object.entries(submission.fields).flatMap(([key, value]) => [key, formatFieldValue(value)]),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function typeLabel(type: WebsiteLeadSubmissionType) {
  return type === 'booked_demo' ? 'Booked Demo' : 'Lead Inquiry';
}

function SubmissionCard({ submission, publicBaseUrl }: { submission: WebsiteLeadSubmission; publicBaseUrl: string }) {
  const sourceUrl = submission.sourceUrl || resolveWebsiteUrl(submission.sourcePath, publicBaseUrl);
  const entries = fieldEntries(submission);

  return (
    <article className="rounded-[22px] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                submission.type === 'booked_demo' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f5f3ff] text-[#5b45ff]'
              }`}
            >
              {typeLabel(submission.type)}
            </span>
            {submission.topic ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{labelize(submission.topic)}</span>
            ) : null}
          </div>
          <h3 className="mt-3 text-base font-semibold text-gray-950">{submission.name || 'Unnamed lead'}</h3>
          <p className="mt-1 text-sm text-gray-500">{formatDateTime(submission.submittedAt)}</p>
        </div>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" />
            Source
          </a>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            <Mail className="h-4 w-4" />
            Email
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-gray-950">{submission.email || 'Not provided'}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            <Phone className="h-4 w-4" />
            Phone
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-gray-950">{submission.phone || 'Not provided'}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            <MessageSquareText className="h-4 w-4" />
            Page
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-gray-950">{submission.pageTitle || submission.sourcePath || 'Unknown'}</p>
        </div>
      </div>

      {submission.message ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Message</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{submission.message}</p>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-gray-200">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Submitted fields</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-b-2xl bg-gray-100 md:grid-cols-2">
            {entries.map(([key, value]) => (
              <div key={key} className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{labelize(key)}</p>
                <p className="mt-2 break-words text-sm text-gray-700">{formatFieldValue(value) || 'Not provided'}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function WebsiteLeadFormDataPage() {
  const [data, setData] = useState<WebsiteLeadFormsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('booked_demo');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const baseRows = activeTab === 'booked_demo' ? data?.bookedDemos || [] : data?.leadInquiries || [];
    return baseRows.filter((submission) => matchesSearch(submission, search));
  }, [activeTab, data, search]);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      setData(await adminApi.getWebsiteLeads());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load website lead form data.');
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
        title="Lead Form Data"
        description="Review HTML form submissions captured across the public website. Demo bookings and lead inquiries stay separated for follow-up."
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

      {data ? (
        <div className="grid gap-5 md:grid-cols-4">
          <MetricCard label="Total Leads" value={formatNumber(data.summary.total)} detail="All captured forms" Icon={Inbox} tone="violet" />
          <MetricCard label="Booked Demos" value={formatNumber(data.summary.bookedDemos)} detail="Demo scheduling forms" Icon={CalendarCheck2} tone="emerald" />
          <MetricCard label="Lead Inquiries" value={formatNumber(data.summary.leadInquiries)} detail="Contact and pricing forms" Icon={MessageSquareText} tone="sky" />
          <MetricCard
            label="Latest"
            value={data.summary.lastSubmissionAt ? 'Recent' : 'None'}
            detail={data.summary.lastSubmissionAt ? formatDateTime(data.summary.lastSubmissionAt) : 'Most recent submission'}
            Icon={RefreshCcw}
            tone="slate"
          />
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {data?.warnings.map((warning) => (
        <div key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warning}
        </div>
      ))}

      <Panel title="Website form submissions" description={data ? `Generated ${formatDateTime(data.generatedAt)}` : 'Captured from public HTML forms.'}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search leads, pages, fields..."
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm font-semibold text-gray-950">{tabs.find((tab) => tab.id === activeTab)?.label}</p>
          <p className="mt-1 text-sm text-gray-500">{tabs.find((tab) => tab.id === activeTab)?.description}</p>
        </div>

        <div className="mt-5 space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              No {activeTab === 'booked_demo' ? 'booked demos' : 'lead inquiries'} found.
            </div>
          ) : (
            rows.map((submission) => (
              <SubmissionCard key={submission.id} submission={submission} publicBaseUrl={data?.publicBaseUrl || ''} />
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
