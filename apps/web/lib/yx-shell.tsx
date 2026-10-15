'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import type { CountKey } from './yx-nav';

// The app frame's data (design audit step 1): the company and period chosen in the top bar, the side-menu counts and
// global search. The scope is a per-browser convenience, so localStorage is fine (it is never a permission: the API
// scopes every list by the person's grants whatever is chosen here).

export interface Scope {
  /** Legal entity id, or null for every entity the person may see. */
  entity: string | null;
  /** Payroll month, YYYY-MM. */
  period: string;
}
const SCOPE_KEY = 'yx-scope';
const thisMonth = () => new Date().toISOString().slice(0, 7);

function readScope(): Scope {
  try {
    const s = JSON.parse(window.localStorage.getItem(SCOPE_KEY) ?? 'null') as Partial<Scope> | null;
    return { entity: typeof s?.entity === 'string' ? s.entity : null, period: typeof s?.period === 'string' && /^\d{4}-\d{2}$/.test(s.period) ? s.period : thisMonth() };
  } catch {
    return { entity: null, period: thisMonth() };
  }
}

const ScopeContext = createContext<{ scope: Scope; setScope: (s: Scope) => void }>({ scope: { entity: null, period: '' }, setScope: () => {} });

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setState] = useState<Scope>({ entity: null, period: thisMonth() });
  useEffect(() => setState(readScope()), []);
  const setScope = (s: Scope) => {
    setState(s);
    try {
      window.localStorage.setItem(SCOPE_KEY, JSON.stringify(s));
    } catch {
      /* private window: this visit only */
    }
  };
  return <ScopeContext.Provider value={{ scope, setScope }}>{children}</ScopeContext.Provider>;
}

/** The company and period chosen in the top bar. */
export const useScope = () => useContext(ScopeContext);

/** The last six payroll months, newest first. */
export function recentMonths(today = new Date(), n = 6): { value: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  });
}

export function useWorkspaceCounts() {
  const { accessToken } = useAuth();
  return useQuery<Partial<Record<CountKey | 'notifications', number>>>({
    queryKey: ['yx', 'workspace', 'counts'],
    queryFn: () => apiFetch('/workspace/counts', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    refetchInterval: 60_000,
    retry: false,
  });
}

export interface SearchHit {
  id: string;
  label: string;
  secondary: string;
  href: string;
}
export type SearchResult = Record<'people' | 'requests' | 'candidates' | 'tickets', SearchHit[]>;

/** Global search, 250 ms after typing stops; nothing under two letters. */
export function useWorkspaceSearch(raw: string) {
  const { accessToken } = useAuth();
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setQ(raw.trim().replace(/^[@#>?]\s*/, '').slice(0, 100)), 250);
    return () => window.clearTimeout(t);
  }, [raw]);
  const query = useQuery<SearchResult>({
    queryKey: ['yx', 'workspace', 'search', q],
    queryFn: () => apiFetch(`/workspace/search?q=${encodeURIComponent(q)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
  const typed = raw.trim().replace(/^[@#>?]\s*/, '');
  return { data: q.length >= 2 ? query.data : undefined, loading: typed.length >= 2 && (typed.slice(0, 100) !== q || query.isFetching) };
}
