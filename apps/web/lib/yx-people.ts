import { useCallback } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeInput, ChangeOptions, ChoiceOption, Impact, PersonOption } from '@yukthix/ui/history';
import type { MasterRecord, OrgLocation } from '@yukthix/ui/org';
import type { OrgChartData } from '@yukthix/ui/workforce';
import { apiFetch } from './api-client';
import { useAuth } from './auth-context';
import { todayIst, useOrg } from './yx-org';

// API glue for People › job history and changes (P06). The screens in @yukthix/ui/history stay presentational.

/** One GET under the people API, cached under ['yx', 'people', ...path]. */
export function usePeople<T>(path: string | null, opts: { keepPrevious?: boolean } = {}) {
  const { accessToken } = useAuth();
  return useQuery<T>({
    queryKey: ['yx', 'people', path],
    queryFn: () => apiFetch(`/people${path}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && path !== null,
    retry: false,
    // Paged / searched lists keep showing the last page while the next one loads.
    ...(opts.keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/** A one-off read under the people API (not cached), stable across renders. */
export function usePeopleRead() {
  const { accessToken } = useAuth();
  return useCallback(<T,>(path: string): Promise<T> => apiFetch(`/people${path}`, {}, accessToken ?? undefined), [accessToken]);
}

/** Calls the people API and refreshes every people query. */
export function usePeopleWrite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return async <T = unknown>(method: 'POST' | 'PUT' | 'GET', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/people${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    if (method !== 'GET') await queryClient.invalidateQueries({ queryKey: ['yx', 'people'] });
    return result as T;
  };
}

/** Start of the financial year (April, India): earlier dates need the override reason (YX-HIS-12). */
export function fyStart(today: string, month = 4): string {
  const [y, m] = today.split('-').map(Number);
  return `${m >= month ? y : y - 1}-${String(month).padStart(2, '0')}-01`;
}

const masterChoice = (m: MasterRecord): ChoiceOption => ({ value: m.id, label: m.name, entities: m.ownerLegalEntityId ? [m.ownerLegalEntityId] : (m.appliesToEntities ?? []) });

/** What the change form offers: live masters with the entities that may use them, and the people list. */
export function useChangeOptions(people: PersonOption[], canPay: boolean, enabled: boolean): ChangeOptions {
  const departments = useOrg<MasterRecord[]>('/masters/departments', enabled);
  const designations = useOrg<MasterRecord[]>('/masters/designations', enabled);
  const grades = useOrg<MasterRecord[]>('/masters/grades', enabled);
  const types = useOrg<MasterRecord[]>('/masters/employment-types', enabled);
  const costCentres = useOrg<MasterRecord[]>('/masters/cost-centres', enabled);
  const locations = useOrg<OrgLocation[]>('/locations', enabled);
  const today = todayIst();
  return {
    people,
    departments: (departments.data ?? []).map(masterChoice),
    designations: (designations.data ?? []).map(masterChoice),
    grades: (grades.data ?? []).map(masterChoice),
    employmentTypes: (types.data ?? []).map(masterChoice),
    costCentres: (costCentres.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}`, entities: c.legalEntityId ? [c.legalEntityId] : [] })),
    locations: (locations.data ?? []).map((l) => ({ value: l.id, label: l.name, entities: [l.legalEntityId] })),
    canPay,
    retroLimit: fyStart(today),
    today,
  };
}

/** Raise a change: preview its impact (nothing kept) or send it for approval. */
export function useRaiseChange() {
  const write = usePeopleWrite();
  return {
    onPreview: async (input: ChangeInput) => (await write<{ impact: Impact }>('POST', '/changes/preview', input)).impact,
    onSubmit: async (input: ChangeInput) => void (await write('POST', '/changes', input)),
  };
}

/** Everyone in force today as change-form people (managers pick a new manager from the whole company). */
export function chartPeople(chart: OrgChartData | undefined): PersonOption[] {
  return (chart?.nodes ?? []).map((n) => ({
    id: n.id,
    name: n.name,
    employeeCode: n.employeeCode ?? null,
    legalEntityId: n.legalEntity?.id ?? null,
    designation: n.designation?.name ?? null,
    department: n.department?.name ?? null,
    location: n.location?.name ?? null,
  }));
}
