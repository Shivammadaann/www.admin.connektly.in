import type { ReactNode } from 'react';

type PanelProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function Panel({ title, description, action, children, className = '' }: PanelProps) {
  return (
    <section
      className={`overflow-hidden rounded-[28px] border border-gray-200 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.05)] ring-1 ring-white/70 ${className}`.trim()}
    >
      {title || description || action ? (
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-gray-950 sm:text-base">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
