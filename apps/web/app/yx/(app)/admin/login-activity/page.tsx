'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginActivityScreen, NO_FILTERS, type LoginActivityFilters, type LoginEventRow, type Page, type SessionRow } from '@yukthix/ui/auth';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import type { PaginatedResponse, StaffUser } from '../../../../../lib/types';
import { qs } from '../../../../../lib/yx-security';

const DAY_MS = 86_400_000;
const iso = (d: Date | null, endOfDay = false) => (d ? new Date(d.getTime() + (endOfDay ? DAY_MS - 1 : 0)).toISOString() : undefined);

// Admin › Login activity (P12 §7; YX-IAM-06/10): the company's sign-in attempts (audit:view) and who
// is signed in now (org:manage_users). Tenant scoping is RLS on the API side.
export default function YxLoginActivityPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'events' | 'sessions'>('events');
  const [filters, setFilters] = useState<LoginActivityFilters>(NO_FILTERS);
  const [eventsPage, setEventsPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const get = <T,>(key: unknown[], path: string, enabled = true) => ({ queryKey: ['yx', 'admin', ...key], queryFn: (): Promise<T> => apiFetch(path, {}, token), enabled: Boolean(token) && enabled });

  const eventsPath = `/security/login-events${qs({
    result: filters.result,
    method: filters.method,
    userId: filters.userId,
    from: iso(filters.range.from),
    to: iso(filters.range.to, true),
    page: eventsPage,
    pageSize: 25,
  })}`;
  const events = useQuery(get<Page<LoginEventRow>>(['events', eventsPath], eventsPath));
  // Rounded to the minute so the query key is stable between renders.
  const since = new Date(Math.floor((Date.now() - DAY_MS) / 60_000) * 60_000).toISOString();
  const failed = useQuery(get<Page<LoginEventRow>>(['failed', since], `/security/login-events${qs({ result: 'unsuccessful', from: since, pageSize: 1 })}`));
  const sessions = useQuery(get<Page<SessionRow>>(['sessions', sessionsPage], `/security/sessions${qs({ page: sessionsPage, pageSize: 25 })}`));
  const users = useQuery(get<PaginatedResponse<StaffUser>>(['users'], '/users?pageSize=100'));

  return (
    <LoginActivityScreen
      tab={tab}
      onTabChange={setTab}
      events={events.data ?? null}
      eventsState={events.isError ? 'error' : events.data ? 'ready' : 'loading'}
      filters={filters}
      onFiltersChange={(f) => {
        setFilters(f);
        setEventsPage(1);
      }}
      onEventsPage={setEventsPage}
      failedLast24h={failed.data?.total ?? null}
      people={(users.data?.data ?? []).map((u) => ({ id: u.id, name: u.name || u.email, email: u.email }))}
      sessions={sessions.data ?? null}
      sessionsState={sessions.isError ? 'error' : sessions.data ? 'ready' : 'loading'}
      onSessionsPage={setSessionsPage}
      onRevokeSession={async (s) => {
        await apiFetch(`/security/sessions/${encodeURIComponent(s.id)}`, { method: 'DELETE' }, token);
        await queryClient.invalidateQueries({ queryKey: ['yx', 'admin', 'sessions'] });
      }}
      onRetry={() => void queryClient.invalidateQueries({ queryKey: ['yx', 'admin'] })}
    />
  );
}
