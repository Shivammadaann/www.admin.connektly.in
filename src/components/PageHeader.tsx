import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export default function PageHeader({ title, description, actions, meta, className = '' }: PageHeaderProps) {
  return (
    <section
      className={`overflow-hidden rounded-[28px] border border-gray-200 bg-white/95 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] ring-1 ring-white/70 sm:p-6 ${className}`.trim()}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">{description}</p> : null}
          {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
