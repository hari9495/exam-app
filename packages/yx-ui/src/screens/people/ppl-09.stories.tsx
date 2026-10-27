import type { Meta, StoryObj } from '@storybook/react-vite';
import { REVIEW_ID } from '../../components/stepper';
import { RestructureWizard } from './changes';
import { RestructureRecord, type ContinuityItemData, type RestructureRecordData } from './restructure';
import { d } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-09 · Bulk transfer and restructure', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Scope: S = { name: 'Step 1 · merge scope', render: () => <RestructureWizard /> };
export const Options: S = { name: 'Step 2 · transfer options and overrides', render: () => <RestructureWizard current="options" /> };
export const CloseBlocked: S = { name: 'Step 3 · close blocked (payroll not locked)', render: () => <RestructureWizard current="close" payrollLocked={false} /> };
export const CloseReady: S = { name: 'Step 3 · close checks pass', render: () => <RestructureWizard current="close" /> };
export const Confirm: S = { name: 'Review and send for approval (typed)', render: () => <RestructureWizard current={REVIEW_ID} confirmOpen /> };

const result = (name: string, code: string, newCode: string) => ({
  employeeId: code,
  name,
  code,
  status: 'moved' as const,
  reason: null,
  from: { entity: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', code, location: 'Chennai office', department: 'Sales', manager: null },
  to: { entity: 'Kaveri Foods Pvt Ltd', code: newCode, location: 'Bengaluru head office', department: 'Sales', manager: null },
  service: { from: '2019-06-03', kept: true },
  leave: [{ name: 'Privilege leave', days: 11.5, action: 'carried' as const }],
  pay: 'kept' as const,
});
const RECORD: RestructureRecordData = {
  id: 'r1',
  kind: 'merge',
  title: 'Merge Kaveri Foods Pvt Ltd (Tamil Nadu) into Kaveri Foods Pvt Ltd',
  effectiveDate: '2026-10-01',
  status: 'pending',
  moved: 0,
  failed: 0,
  requestedBy: 'Lakshmi Venkatesan',
  mine: false,
  reason: 'Tamil Nadu entity merges into the main entity (board resolution 14 Sep 2026)',
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  canDecide: true,
  canCancel: false,
  count: 2,
  people: [
    { employeeId: 'p1', name: 'Rahul Sharma', status: 'pending', reason: null, result: null, openItems: 0 },
    { employeeId: 'p2', name: 'Selvi Perumal', status: 'pending', reason: null, result: null, openItems: 0 },
    { employeeId: 'p3', name: 'Manoj Patil', status: 'left_out', reason: 'Left out: retiring 31 Oct 2026, full and final at the old entity', result: null, openItems: 0 },
  ],
};
const DONE: RestructureRecordData = {
  ...RECORD,
  status: 'done',
  moved: 1,
  failed: 1,
  decidedBy: 'Ramesh Iyengar',
  canDecide: false,
  people: [
    { employeeId: 'p1', name: 'Rahul Sharma', status: 'moved', reason: null, result: result('Rahul Sharma', 'KFT-0031', 'KF-0261'), openItems: 4 },
    { employeeId: 'p2', name: 'Selvi Perumal', status: 'failed', reason: 'Has a transfer on 05 Oct 2026, on or after the move date. Decide or cancel it first.', result: null, openItems: 0 },
    { employeeId: 'p3', name: 'Manoj Patil', status: 'left_out', reason: 'Left out: retiring 31 Oct 2026, full and final at the old entity', result: null, openItems: 0 },
  ],
};
const ITEMS: ContinuityItemData[] = [
  { id: 'i1', key: 'uan', title: 'PF: same UAN; transfer the PF balance (Form 13 or EPFO auto-transfer)', owner: 'Payroll', dueOn: '2026-10-31', status: 'open', note: 'UAN on file', version: 1 },
  { id: 'i2', key: 'esi', title: 'ESI: the same IP number carries over', owner: 'Payroll', dueOn: '2026-10-31', status: 'done', note: null, version: 2 },
  { id: 'i3', key: 'form12b', title: "Form 12B: carry this tax year's income and TDS from Kaveri Foods Pvt Ltd (Tamil Nadu)", owner: 'Payroll', dueOn: '2026-10-31', status: 'open', note: null, version: 1 },
  { id: 'i4', key: 'declarations', title: 'Tax declarations and proofs: copy to the new entity', owner: 'Payroll', dueOn: '2026-10-31', status: 'open', note: null, version: 1 },
  { id: 'i5', key: 'leave', title: 'Leave balances carried (Privilege leave 11.5)', owner: 'HR', dueOn: null, status: 'done', note: null, version: 1 },
  { id: 'i6', key: 'gratuity', title: 'Gratuity: service continues, one payout at final exit', owner: 'Payroll', dueOn: null, status: 'done', note: null, version: 1 },
  { id: 'i7', key: 'loan1', title: 'Loan (advance) moved to Kaveri Foods Pvt Ltd (no F&F)', owner: 'Finance', dueOn: '2026-10-31', status: 'open', note: null, version: 1 },
];
const noop = async () => {};
export const Record: S = { name: 'Restructure record · approver', render: () => <RestructureRecord state="ready" onRetry={() => {}} data={RECORD} today={d(2026, 9, 28)} onApprove={noop} onReject={noop} /> };
export const Done: S = { name: 'Restructure record · done, one person could not move', render: () => <RestructureRecord state="ready" onRetry={() => {}} data={DONE} today={d(2026, 10, 12)} onItems={async () => ITEMS} onItem={noop} onLetters={() => {}} /> };
export const Checklist: S = { name: 'PPL-10 · continuity checklist (live items)', render: () => <RestructureRecord state="ready" onRetry={() => {}} data={DONE} today={d(2026, 10, 12)} onItems={async () => ITEMS} onItem={noop} defaultChecklistFor="p1" /> };
export const PayrollNoAccess: S = { name: 'Payroll · no access (HR decides restructures)', render: () => <RestructureRecord state="forbidden" onRetry={() => {}} data={null} today={d(2026, 10, 12)} /> };

// "Save and exit": the start page lists the person's own saved drafts (Continue or Delete).
const SETUP = {
  today: '2026-10-21',
  entities: [
    { id: 'tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', shortName: 'KFTN', people: 96 },
    { id: 'ka', name: 'Kaveri Foods Pvt Ltd', shortName: 'KF', people: 152 },
  ],
  locations: [
    { id: 'chn', name: 'Chennai office', legalEntityId: 'tn', people: 96, state: 'Tamil Nadu' },
    { id: 'blr', name: 'Bengaluru head office', legalEntityId: 'ka', people: 152, state: 'Karnataka' },
  ],
  departments: [],
  masters: [],
  costCentres: [],
  open: [],
};
export const Drafts: S = {
  name: 'Start · saved drafts (Save and exit)',
  render: () => (
    <RestructureWizard
      live={{
        state: 'ready',
        onRetry: () => {},
        setup: SETUP,
        people: [],
        onPreview: async () => ({ people: [], checks: [], counts: { ready: 0, failed: 0, leftOut: 0 } }),
        onSend: noop,
        onOpen: () => {},
        drafts: [{ id: 'd1', title: 'Merge Kaveri Foods Pvt Ltd (Tamil Nadu) into Kaveri Foods Pvt Ltd', updatedAt: '2026-10-20T10:00:00Z' }],
        onSaveDraft: noop,
        onContinueDraft: () => {},
        onDeleteDraft: noop,
      }}
    />
  ),
};
