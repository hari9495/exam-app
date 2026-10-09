'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginActivityScreen, ANY_FAILURE, NO_FILTERS, type LoginActivityFilters, type LoginEventRow, type Page, type PersonOption, type SessionRow } from '@yukthix/ui/auth';
import { useAuth } from '../../../../../lib/auth-context';
import { apiFetch } from '../../../../../lib/api-client';
import type { PaginatedResponse, StaffUser } from '../../../../../lib/types';
import { qs } from '../../../../../lib/yx-security';

const DAY_MS = 86_400_000;
const iso = (d: Date | null, endOfDay = false) => (d ? new Date(d.getTime() + (endOfDay ? DAY_MS - 1 : 0)).toISOString() : undefined);

// Admin › Login activity (P12 §7; YX-IAM-06/10): the company's sign-in attempts (audit:view) and who
// is signed in now and Unlock (org:manage_users). Tenant scoping is RLS on the API side.
export default function YxLoginActivityPage() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'events' | 'sessions'>('events');
  const [filters, setFilters] = useState<LoginActivityFilters>(NO_FILTERS);
  const [eventsPage, setEventsPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  // The Person filter searches the API (a company can have far more than one page of users); the chosen
  // person stays listed while the search moves on.
  const [peopleSearch, setPeopleSearch] = useState('');
  const [chosen, setChosen] = useState<PersonOption | null>(null);
  const get = <T,>(key: unknown[], path: string, enabled = true) => ({ queryKey: ['yx', 'admin', ...key], queryFn: (): Promise<T> => apiFetch(path, {}, token), enabled: Boolean(token) && enabled, retry: false });

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
  // A plain 403 is a missing permission (MFA_REQUIRED is the MFA floor; the layout says what to do).
  const eventsError = events.error as { status?: number; code?: string } | null;
  // Rounded to the minute so the query key is stable between renders.
  const since = new Date(Math.floor((Date.now() - DAY_MS) / 60_000) * 60_000).toISOString();
  const failed = useQuery(get<Page<LoginEventRow>>(['failed', since], `/security/login-events${qs({ result: ANY_FAILURE, from: since, pageSize: 1 })}`));
  const sessions = useQuery(get<Page<SessionRow>>(['sessions', sessionsPage], `/security/sessions${qs({ page: sessionsPage, pageSize: 25 })}`));
  const users = useQuery(get<PaginatedResponse<StaffUser>>(['users', peopleSearch], `/users${qs({ pageSize: 25, search: peopleSearch || undefined })}`));
  const matches = (users.data?.data ?? []).map((u) => ({ id: u.id, name: u.name || u.email, email: u.email }));
  const people = chosen && !matches.some((p) => p.id === chosen.id) ? [chosen, ...matches] : matches;

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
        if (f.userId !== filters.userId) setChosen(people.find((p) => p.id === f.userId) ?? null);
      }}
      onPeopleSearch={setPeopleSearch}
      onEventsPage={setEventsPage}
      failedLast24h={failed.data?.total ?? null}
      people={people}
      sessions={sessions.data ?? null}
      sessionsState={sessions.isError ? 'error' : sessions.data ? 'ready' : 'loading'}
      onSessionsPage={setSessionsPage}
      onRevokeSession={async (s) => {
        await apiFetch(`/security/sessions/${encodeURIComponent(s.id)}`, { method: 'DELETE' }, token);
        await queryClient.invalidateQueries({ queryKey: ['yx', 'admin', 'sessions'] });
      }}
      // Who-is-signed-in loads only with org:manage_users -- the permission Unlock needs too. A step-up
      // action: apiFetch asks the admin to confirm it's them, then resends.
      onUnlock={
        sessions.isSuccess
          ? async (row, reason) => {
              await apiFetch(`/security/users/${encodeURIComponent(row.userId!)}/unlock`, { method: 'POST', body: JSON.stringify({ reason }) }, token);
              await queryClient.invalidateQueries({ queryKey: ['yx', 'admin', 'events'] });
            }
          : undefined
      }
      onRetry={() => void queryClient.invalidateQueries({ queryKey: ['yx', 'admin'] })}
      noAccess={eventsError?.status === 403 && eventsError.code !== 'MFA_REQUIRED'}
    />
  );
}
