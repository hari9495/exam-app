'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { DirectoryPhone, DirectoryScreen, type DirectorySavedView, type LiveDirectory, type WorkforceFilter, type WorkforceRow } from '@yukthix/ui/frame';
import { HireDrawer, type HireInput } from '@yukthix/ui/history';
import type { LegalEntity } from '@yukthix/ui/org';
import type { OrgChartData } from '@yukthix/ui/workforce';
import { useOrgBranding } from '../../../../../lib/hooks/useBranding';
import { useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { chartPeople, useChangeOptions, usePeople, usePeopleWrite } from '../../../../../lib/yx-people';
import { usePdfPost } from '../../../../../lib/yx-lifecycle';
import { useScope } from '../../../../../lib/yx-shell';

interface Ref {
  id: string;
  name: string | null;
}
interface Row {
  id: string;
  kind: 'employee' | 'consultant';
  name: string;
  designation: string | null;
  department: Ref | null;
  departmentPath?: string[];
  location: Ref | null;
  legalEntity: Ref | null;
  manager: Ref | null;
  workEmail: string | null;
  employeeCode?: string;
  joinedOn?: string;
  status?: string;
  phone?: string | null;
  via?: string | null;
}
interface Card {
  count: number;
  previous: number | null;
}
interface Workforce {
  me: { id: string; managerId: string | null; departmentId: string | null; locationId: string | null } | null;
  rows: Row[];
  cards: { employees: Card; consultants: Card | null; persons: { roles: number; people: number; previous: number | null } };
  previousMonth: string | null;
}

const id = encodeURIComponent;
const delta = (now: number, prev: number | null) => (prev === null ? null : now - prev);

/** API rows → the designed screen's rows (names as shown; fields the person may not see stay empty). */
function toRow(r: Row): WorkforceRow {
  return {
    id: r.id,
    code: r.employeeCode ?? '',
    name: r.name,
    kind: r.kind === 'consultant' ? 'Consultant' : 'Employee',
    role: r.designation ?? '',
    department: r.department?.name ?? '',
    ...(r.departmentPath ? { departmentPath: r.departmentPath } : {}),
    location: r.location?.name ?? r.legalEntity?.name ?? '',
    manager: r.manager?.name ?? '',
    email: r.workEmail ?? '',
    phone: r.phone ?? '',
    ...(r.joinedOn ? { joined: new Date(`${r.joinedOn}T00:00:00`) } : {}),
    status: r.status ?? '',
    ...(r.via ? { via: r.via } : {}),
  };
}

// People › Directory (PPL-01, design audit step 2): the designed screen with the live workforce. Colleagues see Public
// fields; HR also ID, joining date and status where its grants reach, and phone with the Personal key (the API decides
// every field). The company chosen in the top bar scopes the list and the cards.
export default function YxDirectoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const perms = useYxPermissions();
  const branding = useOrgBranding();
  const { scope } = useScope();
  const isHr = perms.has('employee.profile.view');
  const canHire = perms.has('employee.change.manage');
  const data = usePeople<Workforce>(`/workforce${scope.entity ? `?legalEntityId=${id(scope.entity)}` : ''}`, { keepPrevious: true });
  const views = usePeople<DirectorySavedView[]>('/workforce/views');
  const write = usePeopleWrite();
  const download = usePdfPost();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.('(max-width: 767px)');
    if (!m) return;
    setPhone(m.matches);
    const on = (e: MediaQueryListEvent) => setPhone(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  // Add employee: the hire form (P01 §4.4, PPL-36) with the people and entities it needs, loaded only for HR.
  const chart = usePeople<OrgChartData>(canHire ? '/org-chart' : null);
  const options = useChangeOptions(useMemo(() => chartPeople(chart.data), [chart.data]), perms.has('employee.salary.manage'), canHire);
  const entities = useOrg<LegalEntity[]>('/legal-entities', canHire);

  const d = data.data;
  const rows = useMemo(() => (d?.rows ?? []).map(toRow), [d]);
  const own = d?.me ? d.rows.find((r) => r.id === d.me!.id) : undefined;
  const me = own ? { name: own.name, manager: own.manager?.name ?? '', department: own.department?.name ?? '', location: own.location?.name ?? '' } : null;
  const sinceMonth = d?.previousMonth ? new Date(`${d.previousMonth}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long' }) : null;
  const cards: LiveDirectory['cards'] = d
    ? {
        Employee: { count: d.cards.employees.count, delta: delta(d.cards.employees.count, d.cards.employees.previous) },
        ...(isHr && d.cards.consultants ? { Consultant: { count: d.cards.consultants.count, delta: delta(d.cards.consultants.count, d.cards.consultants.previous) } } : {}),
        ...(isHr ? { 'All persons': { count: d.cards.persons.people, delta: delta(d.cards.persons.people, d.cards.persons.previous) } } : {}),
      }
    : {};
  const live: LiveDirectory = {
    company: branding.data?.name || 'your company',
    me,
    cards,
    sinceMonth,
    ...(d ? { persons: { roles: d.cards.persons.roles, people: d.cards.persons.people } } : {}),
    ...(canHire ? { onAdd: (kind: WorkforceFilter) => (kind === 'Consultant' ? router.push('/yx/payroll/consultants') : setAdding(true)) } : {}),
    // No employee import yet (Import stays hidden until there is one).
    ...(isHr
      ? {
          onOpenRecord: (r: WorkforceRow) => router.push(`/yx/people/profile?person=${id(r.id)}`),
          // One person: their job history, where changes are raised; several: a bulk change.
          onStartChange: (ids: string[]) => router.push(ids.length === 1 ? `/yx/people/history?person=${id(ids[0])}` : '/yx/people/bulk-changes'),
          onIssueLetter: (ids: string[]) => router.push(`/yx/people/letters?people=${ids.map(id).join(',')}`),
          onExport: (ids: string[] | null, columns: string[], format: 'csv' | 'xlsx') => {
            const known = ['name', 'department', 'location', 'manager', 'email', 'code', 'joined', 'status'];
            const cols = ['name', 'designation', ...columns.filter((c) => known.includes(c) && c !== 'name'), ...(rows.some((r) => r.phone) ? ['phone'] : [])];
            void download('/people/workforce/export', { ...(scope.entity ? { legalEntityId: scope.entity } : {}), ...(ids ? { ids } : {}), columns: cols, format }, `directory.${format}`);
          },
        }
      : {}),
    views: {
      list: views.data ?? [],
      onSave: (name, shared, state) =>
        void write('POST', '/workforce/views', { name, shared, state }).then(
          () => toast({ tone: 'success', title: `View "${name}" saved`, ...(shared ? { description: 'Everyone who opens the directory can use it.' } : {}) }),
          () => toast({ tone: 'error', title: 'The view was not saved', description: 'Try again in a moment.' }),
        ),
    },
    onRetry: () => void data.refetch(),
  };
  // Wait for the grants too: the columns depend on them.
  const state = data.isError ? 'error' : d && (perms.isSuccess || perms.isError) ? 'ready' : 'loading';

  return (
    <>
      {phone ? (
        <DirectoryPhone rows={rows} defaultQuery={params?.get('q') ?? ''} state={state === 'ready' ? 'ready' : 'loading'} live={{ me, persona: isHr ? 'hr' : 'emp' }} />
      ) : (
        <DirectoryScreen key={params?.get('q') ?? ''} persona={isHr ? 'hr' : 'emp'} rows={rows} state={state} defaultQuery={params?.get('q') ?? ''} live={live} />
      )}
      {adding && canHire && (
        <HireDrawer
          options={options}
          legalEntities={(entities.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
          onSubmit={(input: HireInput) => write<{ id: string }>('POST', '/employees', input)}
          onCreated={(personId) => router.push(`/yx/people/history?person=${id(personId)}`)}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
