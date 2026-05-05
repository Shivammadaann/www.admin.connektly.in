import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

type EmptyStateProps = {
  title: string;
  description?: string;
  Icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({ title, description, Icon = Inbox, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`rounded-[24px] border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center ${className}`.trim()}
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-400">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-950">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
