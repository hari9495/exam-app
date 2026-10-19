import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { OrgChartScreen } from './org-chart';
import { TeamScreen, type TeamScreenProps } from './team';
import { ProbationScreen } from './probation';
import { BulkChangesScreen } from './bulk';
import { BATCH_DETAIL, BATCHES, BULK_RESULT, ORG_CHART, PEOPLE, PROBATIONS, TEAM, TODAY_ISO } from './data';
import { IMPACT, OPTIONS } from '../history/data';

const meta: Meta = { title: 'Screens/People/People core', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
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
