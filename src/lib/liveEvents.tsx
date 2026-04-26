import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminApi } from './adminApi';
import type { AdminLiveEvent } from './types';

type LiveEventsContextValue = {
  events: AdminLiveEvent[];
  status: string;
  unreadCount: number;
  clearUnread: () => void;
};

const LiveEventsContext = createContext<LiveEventsContextValue | null>(null);

export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<AdminLiveEvent[]>([]);
  const [status, setStatus] = useState('connecting');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: number | undefined;

    const connect = () => {
      setStatus('connecting');
      void adminApi
        .streamLiveEvents(
          (event) => {
            setEvents((current) => {
              const next = [event, ...current.filter((item) => item.id !== event.id)];
              return next.slice(0, 200);
            });
            setUnreadCount((count) => count + 1);
          },
          setStatus,
          controller.signal,
        )
        .catch(() => {
          if (!controller.signal.aborted) {
            setStatus('reconnecting');
            reconnectTimer = window.setTimeout(connect, 3500);
          }
        });
    };

    connect();

    return () => {
      controller.abort();
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      events,
      status,
      unreadCount,
      clearUnread: () => setUnreadCount(0),
    }),
    [events, status, unreadCount],
  );

  return <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>;
}

export function useLiveEvents() {
  const context = useContext(LiveEventsContext);
  if (!context) {
    throw new Error('useLiveEvents must be used inside LiveEventsProvider');
  }
  return context;
}
