import { Activity, DatabaseZap } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import type { AdminLiveEvent } from '../lib/types';
import StatusBadge from './StatusBadge';

type LiveEventFeedProps = {
  events: AdminLiveEvent[];
  dense?: boolean;
  maxHeightClass?: string;
};

export default function LiveEventFeed({ events, dense = false, maxHeightClass = 'max-h-[520px]' }: LiveEventFeedProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
        <Activity className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-4 text-sm font-medium text-gray-900">No live events yet</p>
        <p className="mt-1 text-sm text-gray-500">New Supabase, webhook, and admin events will appear here.</p>
      </div>
    );
  }

  return (
    <div className={`thin-scrollbar overflow-y-auto ${maxHeightClass}`}>
      <div className="space-y-3">
        {events.map((event) => (
          <article key={event.id} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-[#5b45ff]">
                <DatabaseZap className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={event.status || event.eventType} severity={event.severity} compact />
                  {event.table ? (
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-500">
                      {event.table}
                    </span>
                  ) : null}
                </div>
                <h3 className={`mt-2 font-semibold text-gray-950 ${dense ? 'text-sm' : 'text-base'}`}>{event.title}</h3>
                {event.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">{event.description}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  <span>{formatDateTime(event.occurredAt)}</span>
                  {event.userId ? <span className="font-mono">{event.userId}</span> : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
