import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DirectoryScreen } from './directory';
import { OrgChartScreen } from './org-chart';
import { TeamScreen, type TeamScreenProps } from './team';
import { ProbationScreen } from './probation';
import { BulkChangesScreen } from './bulk';
import { BATCH_DETAIL, BATCHES, BULK_RESULT, CHOICES, DIRECTORY, DIRECTORY_HR, ORG_CHART, PEOPLE, PERSON, PROBATIONS, TEAM, TODAY_ISO } from './data';
import { IMPACT, OPTIONS } from '../history/data';
import type { DirectoryQuery } from './types';

const meta: Meta = { title: 'Screens/People/People core', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
const EMPTY_QUERY: DirectoryQuery = { q: '', legalEntityId: null, departmentId: null, locationId: null, offset: 0 };

const ENTITY_CHOICES = CHOICES.legalEntities.map((e) => ({ value: e.id, label: e.name ?? '' }));
/** The second try links to the matched person (PPL-36). */
let tries = 0;
const hire = async (input: { personId?: string }) => {
  await wait();
  if (!input.personId && tries++ % 2 === 0) throw Object.assign(new Error('Possible same person'), { code: 'POSSIBLE_SAME_PERSON', body: { personIds: ['person-1'] } });
  return { id: 'e-new' };
};

function Directory({ hr = false }: { hr?: boolean }) {
  const [query, setQuery] = useState(EMPTY_QUERY);
  const page = hr ? DIRECTORY_HR : DIRECTORY;
  const people = page.people.filter((p) => (!query.q || p.name.toLowerCase().includes(query.q.toLowerCase())) && (!query.departmentId || p.department?.id === query.departmentId));
  return <DirectoryScreen state="ready" page={{ ...page, total: people.length, people }} query={query} onQuery={setQuery} choices={CHOICES} isHr={hr} loadPerson={() => wait().then(() => PERSON)} onOpenHistory={() => {}} onOpenProfile={hr ? () => {} : undefined} addPerson={hr ? { options: OPTIONS, legalEntities: ENTITY_CHOICES, onSubmit: hire } : undefined} />;
}

export const DirectoryEmployee: S = { name: 'Directory · employee (Public fields)', render: () => <Directory /> };
export const DirectoryHr: S = { name: 'Directory · HR (codes, person and roles)', render: () => <Directory hr /> };
export const DirectoryLoading: S = { name: 'Directory · loading', render: () => <DirectoryScreen state="loading" page={null} query={EMPTY_QUERY} onQuery={() => {}} choices={CHOICES} isHr={false} /> };

function Chart({ hr = false }: { hr?: boolean }) {
  const [asOf, setAsOf] = useState(TODAY_ISO);
  return <OrgChartScreen state="ready" data={{ ...ORG_CHART, asOf }} today={TODAY_ISO} onAsOf={hr ? setAsOf : undefined} meId="p-divya" companyName="Kaveri Foods Pvt Ltd" onOpenPerson={hr ? () => {} : undefined} />;
}
export const OrgChartEmployee: S = { name: 'Org chart · employee (today)', render: () => <Chart /> };
export const OrgChartHr: S = { name: 'Org chart · HR (view as on a date)', render: () => <Chart hr /> };

const raise = { options: { ...OPTIONS, people: PEOPLE.filter((p) => p.id !== 'p-imran'), types: ['promotion', 'transfer', 'redesignation', 'manager_change'] }, onPreview: () => wait().then(() => IMPACT), onSubmit: () => wait() } satisfies TeamScreenProps['raise'];
export const Team: S = { name: 'My team · manager raising changes', render: () => <TeamScreen state="ready" members={TEAM} today={TODAY_ISO} onOpenHistory={() => {}} raise={raise} /> };
export const TeamEmpty: S = { name: 'My team · no reports', render: () => <TeamScreen state="ready" members={[]} today={TODAY_ISO} onOpenHistory={() => {}} /> };

export const Probation: S = {
  name: 'Probation · HR',
  render: () => <ProbationScreen state="ready" rows={PROBATIONS} today={TODAY_ISO} canManage onConfirm={() => wait()} onExtend={() => wait()} onOpenHistory={() => {}} changesHref="#changes" />,
};
export const ProbationManager: S = {
  name: 'Probation · manager (read only)',
  render: () => <ProbationScreen state="ready" rows={PROBATIONS.slice(0, 2)} today={TODAY_ISO} canManage={false} onConfirm={() => wait()} onExtend={() => wait()} onOpenHistory={() => {}} changesHref="#changes" />,
};

const bulk = {
  state: 'ready' as const,
  batches: BATCHES,
  people: PEOPLE,
  canManage: true,
  canApprove: true,
  canPay: false,
  onCheckFile: () => wait().then(() => BULK_RESULT),
  onCheckReassign: () => wait().then(() => ({ ...BULK_RESULT, errors: 0, rows: BULK_RESULT.rows.slice(0, 1) })),
  loadBatch: () => wait().then(() => BATCH_DETAIL),
  onApprove: () => wait(),
  onReject: () => wait(),
  onCancel: () => wait(),
};
export const BulkFile: S = { name: 'Bulk changes · from a file', render: () => <BulkChangesScreen {...bulk} /> };
export const BulkBatch: S = { name: 'Bulk changes · batch to approve', render: () => <BulkChangesScreen {...bulk} defaultBatchId="b-1" /> };
