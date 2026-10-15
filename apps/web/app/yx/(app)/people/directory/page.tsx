'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DirectoryScreen, type DirectoryPage, type DirectoryQuery, type OrgChartData, type PersonRecord, type Ref } from '@yukthix/ui/workforce';
import type { HireInput } from '@yukthix/ui/history';
import type { LegalEntity, MasterRecord } from '@yukthix/ui/org';
import { loadState, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { chartPeople, useChangeOptions, usePeople, usePeopleRead, usePeopleWrite } from '../../../../../lib/yx-people';
import { useScope } from '../../../../../lib/yx-shell';

const id = encodeURIComponent;
const START: DirectoryQuery = { q: '', legalEntityId: null, departmentId: null, locationId: null, offset: 0 };

/** Distinct refs, by name. */
const distinct = (refs: (Ref | null)[]) => [...new Map(refs.filter((r): r is Ref => Boolean(r)).map((r) => [r.id, r])).values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

// People › Directory (PPL-01; P02 Q4): Public fields of colleagues for everyone with an employee record; HR also
// sees codes and the person behind each record (P01 §4.5a). Filter choices come from today's org chart.
export default function YxDirectoryPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  // A search result opens the directory at that name (?q=); the company comes from the top-bar scope.
  const q = useSearchParams()?.get('q') ?? '';
  const { scope } = useScope();
  const [query, setQuery] = useState<DirectoryQuery>({ ...START, q, legalEntityId: scope.entity });
  useEffect(() => setQuery((cur) => ({ ...cur, q, offset: 0 })), [q]);
  useEffect(() => setQuery((cur) => ({ ...cur, legalEntityId: scope.entity, offset: 0 })), [scope.entity]);
  const params = new URLSearchParams({ limit: '50', offset: String(query.offset), ...(query.q ? { q: query.q } : {}), ...(query.legalEntityId ? { legalEntityId: query.legalEntityId } : {}), ...(query.departmentId ? { departmentId: query.departmentId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}) });
  const page = usePeople<DirectoryPage>(`/directory?${params}`, { keepPrevious: true });
  const chart = usePeople<OrgChartData>('/org-chart');
  const read = usePeopleRead();
  const isHr = perms.has('employee.profile.view');
  // Whoever may read the structure picks from every department, parents included: filtering a parent
  // (Operations) covers its whole subtree, but nobody sits in it directly, so the org chart never lists it.
  // shortcut: a label names only the nearest parent (Operations › Quality); show the full path if trees get deeper.
  const masters = useOrg<MasterRecord[]>('/masters/departments', perms.has('org.structure.view'));
  const choices = useMemo(() => {
    const nodes = chart.data?.nodes ?? [];
    const live = (masters.data ?? []).filter((d) => !d.archivedAt);
    const nameOf = new Map(live.map((d) => [d.id, d.name]));
    const departments = live.length
      ? live.map((d) => ({ id: d.id, name: d.parentId && nameOf.has(d.parentId) ? `${nameOf.get(d.parentId)} › ${d.name}` : d.name })).sort((a, b) => a.name.localeCompare(b.name))
      : distinct(nodes.map((n) => n.department));
    return { legalEntities: distinct(nodes.map((n) => n.legalEntity)), departments, locations: distinct(nodes.map((n) => n.location)) };
  }, [chart.data, masters.data]);
  // Add person (P01 §4.4, PPL-36): HR who may raise changes; the API checks the grant reaches the entity,
  // location or department, and pay needs the salary grant there too (R1).
  const canHire = perms.has('employee.change.manage');
  const options = useChangeOptions(useMemo(() => chartPeople(chart.data), [chart.data]), perms.has('employee.salary.manage'), canHire);
  const entities = useOrg<LegalEntity[]>('/legal-entities', canHire);
  const write = usePeopleWrite();
  const loadPerson = useCallback((personId: string) => read<PersonRecord>(`/employees/${id(personId)}/person`), [read]);
  return (
    <DirectoryScreen
      state={page.data ? 'ready' : loadState(page)}
      onRetry={() => void page.refetch()}
      page={page.data ?? null}
      query={query}
      onQuery={setQuery}
      choices={choices}
      isHr={isHr}
      loadPerson={isHr ? loadPerson : undefined}
      onOpenHistory={isHr ? (personId) => router.push(`/yx/people/history?person=${id(personId)}`) : undefined}
      onOpenProfile={isHr ? (personId) => router.push(`/yx/people/profile?person=${id(personId)}`) : undefined}
      addPerson={
        canHire
          ? {
              options,
              legalEntities: (entities.data ?? []).map((e) => ({ value: e.id, label: e.name })),
              onSubmit: (input: HireInput) => write<{ id: string }>('POST', '/employees', input),
              onCreated: (personId) => router.push(`/yx/people/history?person=${id(personId)}`),
            }
          : undefined
      }
    />
  );
}
