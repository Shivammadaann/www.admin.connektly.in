import { CheckCircle2, CircleAlert, CircleDot, ShieldAlert } from 'lucide-react';
import type { Severity } from '../lib/types';
import { labelize } from '../lib/format';

type StatusBadgeProps = {
  status?: unknown;
  severity?: Severity;
  compact?: boolean;
};

function getTone(status: string, severity?: Severity) {
  const normalized = status.toLowerCase();
  if (severity === 'critical' || normalized.includes('fail') || normalized.includes('error') || normalized.includes('ban')) {
    return {
      classes: 'border-rose-200 bg-rose-50 text-rose-700',
      Icon: ShieldAlert,
    };
  }
  if (severity === 'warning' || normalized.includes('pending') || normalized.includes('trial') || normalized.includes('partial')) {
    return {
      classes: 'border-amber-200 bg-amber-50 text-amber-700',
      Icon: CircleAlert,
    };
  }
  if (severity === 'success' || normalized.includes('active') || normalized.includes('connected') || normalized.includes('sent')) {
    return {
      classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      Icon: CheckCircle2,
    };
  }
  return {
    classes: 'border-slate-200 bg-slate-50 text-slate-600',
    Icon: CircleDot,
  };
}

export default function StatusBadge({ status = 'unknown', severity, compact = false }: StatusBadgeProps) {
  const label = labelize(status);
  const { classes, Icon } = getTone(label, severity);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${classes} ${
        compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      }`}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {label}
    </span>
  );
}
