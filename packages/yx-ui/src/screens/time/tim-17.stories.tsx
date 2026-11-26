import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveHomePhone, LeaveHomeScreen } from './leave';
import { MY_LEAVE } from './live/fixtures';

const meta: Meta<typeof LeaveHomeScreen> = { title: 'Screens/Time/TIM-17 · Leave home', component: LeaveHomeScreen, render: (args) => <LeaveHomeScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveHomeScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee' };
export const Manager: S = { name: 'Manager', args: { persona: 'mgr' } };
export const Hr: S = { name: 'HR', args: { persona: 'hr' } };
export const RecordAbsence: S = { name: 'HR · record long absence', args: { persona: 'hr', dialog: 'absence' } };
export const RecordAbsenceConflict: S = { name: 'HR · record long absence · leave in the way', args: { persona: 'hr', dialog: 'absence-conflict' } };
// Founder answer B: HR applies leave for someone (their types and balances, notice skipped, goes to their manager).
export const ApplyForSomeone: S = { name: 'HR · apply for someone', args: { persona: 'hr', dialog: 'apply' } };
export const ApplyForSomeoneRefused: S = { name: 'HR · apply for someone · refused', args: { persona: 'hr', dialog: 'apply-refused' } };
export const Empty: S = { name: 'Employee · no requests yet', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof LeaveHomePhone> = { name: 'Phone · employee', render: () => <LeaveHomePhone />, ...phone };
export const PhoneManager: StoryObj<typeof LeaveHomePhone> = { name: 'Phone · manager', render: () => <LeaveHomePhone persona="mgr" />, ...phone };
// Answer 2759: the manager's overview cards (counts and names only, never the leave type).
export const ManagerOverviewCards: S = {
  name: 'Manager · overview cards',
  render: () => (
    <LeaveHomeScreen
      mgrLive={{
        state: 'ready',
        data: {
          today: '2026-11-26',
          waiting: [],
          otherWaiting: 0,
          away: [{ employeeId: 'e3', name: 'Ravi Kumar', type: 'Leave', from: '2026-11-24', to: '2026-11-27' }],
          cards: { unplanned: { count: 2, people: [{ employeeId: 'e1', name: 'Arjun Kulkarni', requests: 2 }, { employeeId: 'e2', name: 'Meera Krishnan', requests: 1 }] }, noLeave: { days: 90, count: 1, people: [{ employeeId: 'e4', name: 'Suresh Pillai' }] } },
        },
        onOpen: async () => { throw new Error('Not in this story'); },
        onDecide: async () => ({}),
        onNavigate: () => undefined,
        hrefs: { approvals: '#', calendar: '#' },
      }}
    />
  ),
};
// Answer 2760: the peers-away card on the employee's leave home ("away" only, no type or times).
export const EmployeePeersAway: S = {
  name: 'Employee · peers away',
  render: () => (
    <LeaveHomeScreen
      live={{
        state: 'ready',
        data: MY_LEAVE,
        onPreview: async () => { throw new Error('Not in this story'); },
        onApply: async () => ({}),
        onWithdraw: async () => ({}),
        onCancel: async () => ({}),
        onChooseHoliday: async () => ({}),
        onFindPeople: async () => [],
        peers: { data: { from: MY_LEAVE.today, to: '2026-12-09', peers: 4, days: [{ on: '2026-11-27', names: ['Ravi Kumar'] }, { on: '2026-12-01', names: ['Meera Krishnan', 'Arjun Kulkarni'] }] } },
      }}
    />
  ),
};
