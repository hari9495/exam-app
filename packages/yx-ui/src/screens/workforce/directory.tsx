import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Avatar, Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, NoAccessState, Pagination, Skeleton } from '../../components/feedback';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Breadcrumbs, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dateLabel, errorText } from '../org/org-kit';
import { HireDrawer, type HireDrawerProps } from '../history/hire';
import { refName } from './workforce-kit';
import type { DirectoryPage, DirectoryPerson, DirectoryQuery, LoadState, PersonRecord, Ref } from './types';

// People › Directory (PPL-01; M01 §3.2; P02 Q4, YX-SEC-17): colleagues' Public fields for everyone with an
// employee record; codes and joining dates for HR. HR also sees the person behind a record and their roles
// (P01 §4.5a). No pay, no Personal fields for colleagues.

export interface DirectoryScreenProps {
  state: LoadState;
  onRetry?: () => void;
  page: DirectoryPage | null;
  query: DirectoryQuery;
  onQuery: (q: DirectoryQuery) => void;
  /** Filter choices (from today's org chart): entities, departments, locations. */
  choices: { legalEntities: Ref[]; departments: Ref[]; locations: Ref[] };
  /** employee.profile.view: codes, joining dates, roles and job history. */
  isHr: boolean;
  /** HR: the person behind the record and their roles. */
  loadPerson?: (id: string) => Promise<PersonRecord>;
  onOpenHistory?: (id: string) => void;
  /** HR with the record's grants: the profile (Personal, identity and bank by class, P02 §4.4). */
  onOpenProfile?: (id: string) => void;
  /** employee.change.manage: add a person (P01 §4.4, PPL-36). */
  addPerson?: Omit<HireDrawerProps, 'onClose'>;
}

const ROLE_LABEL: Record<string, string> = { employee: 'Employee', login: 'Sign-in', candidate: 'Candidate', applicant: 'Applicant', alumnus: 'Alumnus', nominee: 'Nominee', consultant: 'Consultant', contract_worker: 'Contract worker', vendor_worker: 'Vendor worker', campus_registrant: 'Campus registrant', test_taker: 'Test taker', external_login: 'External sign-in' };

const opts = (list: Ref[]) => list.map((r) => ({ value: r.id, label: r.name ?? '—' }));

function PersonPanel({ id, loadPerson }: { id: string; loadPerson: (id: string) => Promise<PersonRecord> }) {
  const [person, setPerson] = useState<PersonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPerson(null);
    setError(null);
    loadPerson(id).then(setPerson, (e) => setError(errorText(e)));
  }, [id, loadPerson]);
  if (error) return <Text tone="secondary" size="sm">{error}</Text>;
  if (!person) return <Skeleton height={80} />;
  return (
    <div className="yx-ppl2__panel">
      <Text as="p" weight="semibold">Person and roles</Text>
      <dl className="yx-ppl2__dl">
        {person.primaryPhone && (
          <div>
            <dt>Mobile</dt>
            <dd>{person.primaryPhone}</dd>
          </div>
        )}
        {person.primaryEmail && (
          <div>
            <dt>Main email</dt>
            <dd>{person.primaryEmail}</dd>
          </div>
        )}
      </dl>
      <ul className="yx-ppl2__roles" aria-label="Roles">
        {person.roles.map((r) => (
          <li key={r.id}>
            <Badge tone={r.endOn ? 'neutral' : 'info'}>{ROLE_LABEL[r.roleType] ?? r.roleType}</Badge>
            <Text size="sm">{r.label ?? ''}</Text>
            <Text size="sm" tone="secondary">{r.endOn ? `${dateLabel(r.startOn)} – ${dateLabel(r.endOn)}` : `Since ${dateLabel(r.startOn)}`}</Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DirectoryScreen({ state, onRetry, page, query, onQuery, choices, isHr, loadPerson, onOpenHistory, onOpenProfile, addPerson }: DirectoryScreenProps) {
  const [search, setSearch] = useState(query.q);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (search === query.q) return;
    const t = setTimeout(() => onQuery({ ...query, q: search, offset: 0 }), 300);
    return () => clearTimeout(t);
  }, [search, query, onQuery]);
  const open = page?.people.find((p) => p.id === openId) ?? null;
  const filtered = Boolean(query.q || query.legalEntityId || query.departmentId || query.locationId);
  const columns: TableColumn<DirectoryPerson>[] = [
    { key: 'name', header: 'Name', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: refName(r.designation) }), width: 260, hideable: false },
    { key: 'department', header: 'Department', value: (r) => refName(r.department), width: 150 },
    { key: 'location', header: 'Location', value: (r) => refName(r.location), width: 150, optional: true },
    { key: 'manager', header: 'Manager', value: (r) => refName(r.manager), width: 170, optional: true },
    ...(isHr
      ? [
          { key: 'code', header: 'Code', type: 'id', value: (r: DirectoryPerson) => r.employeeCode ?? '', width: 110, optional: true } as TableColumn<DirectoryPerson>,
          { key: 'joined', header: 'Joined', value: (r: DirectoryPerson) => r.joinedOn ?? '', render: (r: DirectoryPerson) => (r.joinedOn ? dateLabel(r.joinedOn) : '—'), width: 120, optional: true } as TableColumn<DirectoryPerson>,
        ]
      : []),
    // A long address breaks after the @, never mid-word ("kaverifood / s.test").
    { key: 'email', header: 'Work email', value: (r) => r.workEmail ?? '—', render: (r) => (r.workEmail?.includes('@') ? <>{r.workEmail.replace(/@.*/, '@')}<wbr />{r.workEmail.replace(/^[^@]*@/, '')}</> : r.workEmail ?? '—'), width: 230, optional: true },
  ];
  const limit = page?.limit ?? 50;
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Directory' }]} />} title="Directory" description="Find colleagues by name, team or location. Colleagues see only name, role, team, location, work email and manager." actions={addPerson && state === 'ready' ? <Button variant="primary" onClick={() => setAdding(true)}>Add person</Button> : undefined} />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load the directory." description="Check your connection and try again." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="the directory" />}
      {state === 'ready' && page && (
        <>
          <div className="yx-ppl2__filters">
            <TextField type="search" aria-label="Search people" placeholder={isHr ? 'Search name, email or code' : 'Search name or email'} value={search} onChange={setSearch} maxLength={100} />
            <Select aria-label="Legal entity" placeholder="All entities" clearable options={opts(choices.legalEntities)} value={query.legalEntityId} onChange={(v) => onQuery({ ...query, legalEntityId: v, offset: 0 })} />
            <Select aria-label="Department" placeholder="All departments" clearable searchable options={opts(choices.departments)} value={query.departmentId} onChange={(v) => onQuery({ ...query, departmentId: v, offset: 0 })} />
            <Select aria-label="Location" placeholder="All locations" clearable options={opts(choices.locations)} value={query.locationId} onChange={(v) => onQuery({ ...query, locationId: v, offset: 0 })} />
          </div>
          <DataTable
            label="People"
            columns={columns}
            rows={page.people}
            getRowId={(r) => r.id}
            rowNoun={['person', 'people']}
            pageSize={limit}
            cardSummary
            filtered={filtered}
            onClearFilters={() => {
              setSearch('');
              onQuery({ q: '', legalEntityId: null, departmentId: null, locationId: null, offset: 0 });
            }}
            empty={<EmptyState compact title="No one here yet." description="People appear once HR adds them." action={addPerson ? <Button onClick={() => setAdding(true)}>Add person</Button> : undefined} />}
            onRowClick={(r) => setOpenId(r.id)}
            activeRowId={openId}
          />
          {page.total > limit && <Pagination page={Math.floor(page.offset / limit) + 1} pageSize={limit} total={page.total} onPageChange={(p) => onQuery({ ...query, offset: (p - 1) * limit })} />}
        </>
      )}
      <Drawer
        open={Boolean(open)}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open?.name ?? ''}
        subtitle={open ? [refName(open.designation), refName(open.department)].join(' · ') : undefined}
        footer={
          <>
            <Button onClick={() => setOpenId(null)}>Close</Button>
            {open && isHr && onOpenProfile && <Button onClick={() => onOpenProfile(open.id)}>Profile</Button>}
            {open && isHr && onOpenHistory && (
              <Button variant="primary" onClick={() => onOpenHistory(open.id)}>
                Job history
              </Button>
            )}
          </>
        }
      >
        {open && (
          <div className="yx-ppl2__stack">
            <Avatar name={open.name} size={64} />
            <dl className="yx-ppl2__dl">
              <div>
                <dt>Location</dt>
                <dd>{refName(open.location)}</dd>
              </div>
              <div>
                <dt>Legal entity</dt>
                <dd>{refName(open.legalEntity)}</dd>
              </div>
              <div>
                <dt>Manager</dt>
                <dd>{refName(open.manager)}</dd>
              </div>
              {open.workEmail && (
                <div>
                  <dt>Work email</dt>
                  <dd>{open.workEmail}</dd>
                </div>
              )}
              {open.employeeCode && (
                <div>
                  <dt>Code</dt>
                  <dd className="yx-mono">{open.employeeCode}</dd>
                </div>
              )}
              {open.joinedOn && (
                <div>
                  <dt>Joined</dt>
                  <dd>{dateLabel(open.joinedOn)}</dd>
                </div>
              )}
            </dl>
            {open.workEmail && (
              <Button asChild size="sm" icon={Mail}>
                <a href={`mailto:${open.workEmail}`}>Email {open.name.split(' ')[0]}</a>
              </Button>
            )}
            {isHr && loadPerson && <PersonPanel id={open.id} loadPerson={loadPerson} />}
          </div>
        )}
      </Drawer>
      {adding && addPerson && <HireDrawer {...addPerson} onClose={() => setAdding(false)} />}
    </div>
  );
}
