import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipRecordScreen, type LivePip } from './perf-people';
import { PIP, PIP_NOT_MET, PIP_PROPOSED, PIP_TO_ACK } from './perf-data-2';
import { PipsScreen } from './pips-list';
import type { PipSummary } from '../performance/live/types';

const meta: Meta = { title: 'Screens/Performance/PRF-12 · PIP record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
// The phone stories for HR and the manager use the live app's own rules (the `can` flags the API sends), so they draw
// exactly what the live page shows under 768 px (founder, 3 Nov 2026).
const noop = async () => {};
const can = (c: Partial<LivePip['can']>): LivePip => ({
  today: new Date(2026, 6, 20),
  can: { decide: false, acknowledge: false, checkin: false, employeeNote: false, outcome: false, letter: false, startExit: false, ...c },
  extendDays: 30,
  askHrHref: '#',
  onDecide: noop,
  onAcknowledge: noop,
  onCheckin: noop,
  onOutcome: noop,
  onLetter: noop,
  onEmployeeNote: noop,
  onStartExit: noop,
});

export const ManagerActive: S = { name: 'Manager · active plan', render: () => <PipRecordScreen persona="mgr" pip={PIP} /> };
export const CheckIns: S = { name: 'Manager · check-ins', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="checkins" /> };
export const HrApproval: S = { name: 'HR · approve proposed plan', render: () => <PipRecordScreen persona="hr" pip={PIP_PROPOSED} /> };
export const RecordOutcome: S = { name: 'Manager · record outcome', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="outcome" outcomeOpen /> };
export const NotMet: S = { name: 'HR · not met (next step is manual)', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" /> };
export const EmployeeAck: S = { name: 'Employee · acknowledge', render: () => <PipRecordScreen persona="emp" pip={PIP_TO_ACK} tab="ack" /> };
export const EmployeeAckPhone: S = { name: 'Employee · acknowledge on phone', globals: PHONE, render: () => <PipRecordScreen persona="emp" device="phone" pip={PIP_TO_ACK} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <PipRecordScreen persona="mgr" device="phone" pip={PIP} live={can({ checkin: true })} /> };
export const HrPhone: S = { name: 'HR · phone', globals: PHONE, render: () => <PipRecordScreen persona="hr" device="phone" pip={{ ...PIP_PROPOSED, warning: true }} live={can({ decide: true })} /> };
export const HrLetterPhone: S = { name: 'HR · phone · issue letter', globals: PHONE, render: () => <PipRecordScreen persona="hr" device="phone" pip={PIP} live={can({ letter: true, outcome: true })} /> };
export const RecordCheckIn: S = { name: 'Manager · record check-in', render: () => <PipRecordScreen persona="mgr" pip={PIP} tab="checkins" checkinOpen /> };
export const SendBack: S = { name: 'HR · send back with a reason', render: () => <PipRecordScreen persona="hr" pip={{ ...PIP_PROPOSED, warning: true }} sendBackOpen /> };
export const ExtendAfterNotMet: S = { name: 'HR · extend once more after not met', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" extendAgainOpen /> };
export const StartExit: S = { name: 'HR · open exit case after not met', render: () => <PipRecordScreen persona="hr" pip={PIP_NOT_MET} tab="outcome" exitOpen /> };

// Batch T2-C (2411, 2847): the list of plans (my team's, those in my scope, or my own) and proposing one.
const PLANS: PipSummary[] = [
  { id: 'p1', employee: 'Arjun Rao', manager: 'Priya Nair', status: 'active', startsOn: '2026-10-01', endsOn: '2026-11-30', nextCheckin: '2026-11-12' },
  { id: 'p2', employee: 'Sita Iyer', manager: 'Priya Nair', status: 'proposed', startsOn: '2026-12-01', endsOn: '2027-01-29', nextCheckin: null },
  { id: 'p3', employee: 'Rahul Menon', manager: 'Karthik Subramanian', status: 'met', startsOn: '2026-06-01', endsOn: '2026-08-29', nextCheckin: null },
];
const list = { onView: () => undefined, onOpen: () => undefined, team: [{ id: 'e1', name: 'Arjun Rao' }, { id: 'e2', name: 'Sita Iyer' }], lengths: [30, 60, 90], onPropose: async () => ({}) };
export const Plans: S = { name: 'Manager · my team's plans', render: () => <PipsScreen state="ready" view="team" hasTeam canScope={false} pips={PLANS.slice(0, 2)} {...list} /> };
export const PlansHr: S = { name: 'HR · plans in my scope', render: () => <PipsScreen state="ready" view="scope" hasTeam={false} canScope pips={PLANS} {...list} /> };
export const PlansEmpty: S = { name: 'Employee · no plans', render: () => <PipsScreen state="ready" view="mine" hasTeam={false} canScope={false} pips={[]} {...list} /> };
export const PlansLoading: S = { name: 'Plans · loading', render: () => <PipsScreen state="loading" view="team" hasTeam canScope={false} pips={[]} {...list} /> };
export const PlansError: S = { name: 'Plans · could not load', render: () => <PipsScreen state="error" onRetry={() => undefined} view="team" hasTeam canScope={false} pips={[]} {...list} /> };
