import { useCallback } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AsOfView, ChangeInput, ChangeOptions, ChoiceOption, Impact, MoveHandlers, MoveInput, PersonOption, TransferOptions } from '@yukthix/ui/history';
import type { RestructurePreview } from '@yukthix/ui/frame';
import type { MasterRecord, OrgLocation } from '@yukthix/ui/org';
import type { OrgChartData } from '@yukthix/ui/workforce';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { todayIst, useOrg } from './yx-org';
import { saveBlob } from './yx-pay';

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

/** A file from the people API saved to the device (a CSV register). */
export function usePeopleDownload() {
  const { accessToken } = useAuth();
  return async (path: string, fallbackName: string) => {
    const { blob, filename } = await apiFetchBlob(`/people${path}`, {}, accessToken ?? undefined);
    saveBlob(blob, filename ?? fallbackName);
  };
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
  return async <T = unknown>(method: 'POST' | 'PUT' | 'GET' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const result = await apiFetch(`/people${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, accessToken ?? undefined);
    if (method !== 'GET') {
      await queryClient.invalidateQueries({ queryKey: ['yx', 'people'] });
      void queryClient.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] }); // the side-menu counts follow at once
    }
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
    /** From a saved draft: the API removes the draft once the change is sent. */
    onSubmit: async (input: ChangeInput, draftId?: string) => void (await write('POST', '/changes', draftId ? { ...input, draftId } : input)),
    /** PPL-04 route line: who will decide it (names only). */
    onRoute: async (employeeId: string, effectiveDate: string | null, pay: boolean) => {
      const q = new URLSearchParams({ employeeId, pay: String(pay), ...(effectiveDate ? { effectiveDate } : {}) });
      return (await write<{ approvers: string[] }>('GET', `/changes/route?${q}`)).approvers;
    },
  };
}

const dateText = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * PPL-04 "What changes" of a one-person move from the restructure dry run (PPL-09 engine): the person's result, or
 * the reason they cannot move (thrown, shown instead of the table).
 */
export function moveImpact(p: RestructurePreview, effectiveDate: string): Impact {
  const r = p.people[0];
  if (!r) throw new Error('This person does not work for that legal entity on that date.');
  if (r.status === 'failed' || !r.to) throw new Error(r.reason ?? 'This person cannot move on that date.');
  const blocked = p.checks.find((c) => c.status === 'Blocked');
  if (blocked) throw new Error(blocked.note ?? blocked.title);
  const facts: Impact['facts'] = [
    { fact: 'Legal entity', from: r.from.entity, to: r.to.entity },
    { fact: 'Employee code', from: r.from.code, to: r.to.code === r.from.code ? `${r.to.code} (kept)` : r.to.code },
    ...(r.from.location !== r.to.location ? [{ fact: 'Location', from: r.from.location, to: r.to.location }] : []),
    ...(r.from.department !== r.to.department ? [{ fact: 'Department', from: r.from.department, to: r.to.department }] : []),
    { fact: 'PF', from: 'Same UAN', to: 'Same UAN · transfer tracked on the checklist' },
    { fact: 'Tax', from: 'Pay and tax so far this year', to: 'Form 12B carried into the new entity' },
  ];
  const balance = r.leave.map((l) => `${l.days} ${l.days === 1 ? 'day' : 'days'} ${l.name}`).join(', ');
  if (balance) facts.push({ fact: 'Leave balance', from: balance, to: r.leave[0].action === 'lapsed' ? 'Lapses' : 'Carried over' });
  if (r.service) facts.push({ fact: 'Continuous service', from: null, to: r.service.kept ? `Continues from ${dateText(r.service.from)}` : `Restarts on ${dateText(r.service.from)}` });
  if (r.pay === 'kept' || r.pay === 'set_later') facts.push({ fact: 'Salary structure', from: null, to: r.pay === 'kept' ? 'Kept' : 'A new one is assigned' });
  return { effectiveDate, facts, pay: [], rebased: [], retro: null };
}

/** PPL-04: one person's move to another legal entity, sent as a one-person restructure (HR only). */
export function useMove(people: PersonOption[], enabled: boolean): MoveHandlers | undefined {
  const setup = usePeople<{ entities: { id: string; name: string }[]; defaults: TransferOptions }>(enabled ? '/restructures/setup' : null);
  const read = usePeopleRead();
  const write = usePeopleWrite();
  if (!enabled) return undefined;
  const body = (m: MoveInput) => ({
    kind: 'demerge',
    fromEntityId: m.fromEntityId,
    intoEntityId: m.intoEntityId,
    effectiveDate: m.effectiveDate,
    employeeIds: [m.employeeId],
    target: { locationId: m.locationId, ...(m.departmentId ? { departmentId: m.departmentId } : {}), ...(m.designationId ? { designationId: m.designationId } : {}), ...(m.employmentTypeId ? { employmentTypeId: m.employmentTypeId } : {}) },
    defaults: m.options,
    reason: m.reason,
    ...(m.overrideReason ? { overrideReason: m.overrideReason } : {}),
  });
  return {
    entities: (setup.data?.entities ?? []).map((e) => ({ value: e.id, label: e.name })),
    onDefaults: async (employeeId) => {
      const s = setup.data ?? (await read<{ defaults: TransferOptions }>('/restructures/setup'));
      const dates = await read<{ continuousServiceFrom: string }>(`/employees/${encodeURIComponent(employeeId)}/service-dates`);
      const now = (await read<AsOfView>(`/employees/${encodeURIComponent(employeeId)}/as-of`)).assignment;
      const current = { departmentId: now?.department?.id ?? null, designationId: now?.designation?.id ?? null, employmentTypeId: now?.employmentType?.id ?? null };
      return { options: s.defaults, employeeCode: people.find((p) => p.id === employeeId)?.employeeCode ?? '', serviceFrom: dates.continuousServiceFrom, current };
    },
    onPreview: async (m) => moveImpact(await write<RestructurePreview>('POST', '/restructures/preview', body(m)), m.effectiveDate),
    onSubmit: async (m) => void (await write('POST', '/restructures', body(m))),
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
