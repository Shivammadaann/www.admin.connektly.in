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
    <section className={`rounded-[24px] border border-gray-200 bg-white shadow-sm ${className}`.trim()}>
      {title || description || action ? (
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="text-lg font-semibold text-gray-950">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}
