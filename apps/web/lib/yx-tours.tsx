'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TOURS, TourCard, type LiveTours, type TourDef } from '@yukthix/ui/desk';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';

type TourId = TourDef['id'];
type Status = 'in_progress' | 'completed' | 'skipped';
interface ToursData {
  show: boolean;
  stopped: boolean;
  tours: { id: TourId; version: number; page: string; status: Status | null; step: number }[];
}

const Ctx = createContext<{ live: LiveTours | null }>({ live: null });

/** A tour's page: Home exactly, the others and the pages under them. */
export const onPage = (page: string, pathname: string) => (page === '/yx/home' ? pathname === page : pathname === page || pathname.startsWith(`${page}/`));

/** The tour that starts by itself on this page: the first whose event happened and that was not finished or skipped. */
export function autoTour(data: ToursData | undefined, pathname: string) {
  if (!data?.show || data.stopped) return null;
  return data.tours.find((t) => (t.status === null || t.status === 'in_progress') && onPage(t.page, pathname)) ?? null;
}

/**
 * Help H-5 (answer 944): first-run tours. One host for the signed-in app: a tour floats on its page once (per tour
 * version), progress is saved per person, and Help › Tours (`useToursPanel`) resumes or replays any of them. Focus goes
 * back where it was when the tour closes. Nothing while the company has "First-run tours" off.
 */
export function TourHost({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery<ToursData>({ queryKey: ['help', 'tours'], queryFn: () => apiFetch('/help/tours', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const [active, setActive] = useState<{ id: TourId; step: number; key: number } | null>(null);
  const handled = useRef(new Set<TourId>());
  const back = useRef<HTMLElement | null>(null);
  const put = async (id: TourId, status: Status, step: number) => {
    const t = q.data?.tours.find((x) => x.id === id);
    if (!t) return;
    const next = (await apiFetch(`/help/tours/${id}`, { method: 'PUT', body: JSON.stringify({ version: t.version, status, step }) }, accessToken ?? undefined)) as ToursData;
    queryClient.setQueryData(['help', 'tours'], next);
  };
  const open = (id: TourId, step: number) => {
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    handled.current.add(id);
    setActive({ id, step, key: Date.now() });
  };
  // Once per page visit at most: a tour the person closed here does not come back until the next visit.
  const auto = autoTour(q.data, pathname);
  useEffect(() => {
    if (auto && !active && !handled.current.has(auto.id)) open(auto.id, auto.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the tour data or the page changes
  }, [auto?.id, pathname]);
  const def = active && TOURS.find((t) => t.id === active.id);
  const close = () => {
    setActive(null);
    if (back.current?.isConnected) back.current.focus();
  };
  const live: LiveTours | null =
    q.data && !q.data.show
      ? null
      : {
          state: q.isError ? 'error' : q.data ? 'ready' : 'loading',
          onRetry: () => void q.refetch(),
          stopped: Boolean(q.data?.stopped),
          tours: (q.data?.tours ?? []).map((t) => ({ id: t.id, status: t.status, step: t.step })),
          onStart: (id, step) => open(id, step),
          onStopped: async (stopped) => {
            const next = (await apiFetch('/help/tours/stopped', { method: 'PUT', body: JSON.stringify({ stopped }) }, accessToken ?? undefined)) as ToursData;
            queryClient.setQueryData(['help', 'tours'], next);
          },
        };
  return (
    <Ctx.Provider value={{ live }}>
      {children}
      {def && (
        <TourCard
          key={active.key}
          tour={def}
          defaultStep={active.step}
          floating
          onStep={(step) => void put(def.id, 'in_progress', step).catch(() => undefined)}
          onDone={(status, step) => {
            void put(def.id, status, step).catch(() => undefined);
            close();
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** Help › Tours: the panel's data and actions (null while the company has tours off). */
export function useToursPanel(): LiveTours | null {
  return useContext(Ctx).live;
}
