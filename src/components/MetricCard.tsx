import type { LucideIcon } from 'lucide-react';

type MetricCardProps = {
  label: string;
  value: string | number;
  detail?: string;
  Icon: LucideIcon;
  tone?: 'violet' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
};

const tones = {
  violet: 'bg-[#f5f3ff] text-[#5b45ff] border-[#dcd6ff]',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  sky: 'bg-sky-50 text-sky-700 border-sky-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  rose: 'bg-rose-50 text-rose-700 border-rose-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function MetricCard({ label, value, detail, Icon, tone = 'slate' }: MetricCardProps) {
  return (
    <div className="rounded-[22px] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-gray-950">{value}</div>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {detail ? <p className="mt-3 text-sm leading-6 text-gray-500">{detail}</p> : null}
    </div>
  );
}
