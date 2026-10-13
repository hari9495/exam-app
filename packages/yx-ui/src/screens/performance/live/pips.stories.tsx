import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipScreen, PipsScreen, type PipScreenProps } from './pips';
import type { Pip } from './types';

// Improvement plans, wired (batch PM8; PRF-12). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Improvement plans', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const pip: Pip = {
  id: 'p1',
  employee: 'Arjun Rao',
  employeeId: 'e1',
  manager: 'Priya Nair',
  reason: 'Order accuracy fell below the team standard for two quarters.',
  expectations: 'Ship orders with at most 2% errors each month.',
  support: 'Weekly coaching with the lead; a checklist for every order.',
  startsOn: '2026-10-01',
  plannedEndsOn: '2026-11-30',
  endsOn: '2026-11-30',
  pausedDays: 0,
  pausedNow: false,
  checkinEveryDays: 14,
  status: 'active',
  acknowledgedAt: null,
  employeeComment: null,
  extendedFrom: null,
  extendReason: null,
  outcomeNote: null,
  outcomeAt: null,
  letterId: null,
  exitCaseId: null,
  goals: [{ id: 'g1', text: 'Cut order errors', measure: 'Errors at or below 2% a month', status: 'open' }],
  checkins: [
    { id: 'c1', dueOn: '2026-10-15', heldOn: '2026-10-15', managerNote: 'Errors down to 3%.', employeeNote: 'The checklist helps.', status: 'held' },
    { id: 'c2', dueOn: '2026-10-29', heldOn: null, managerNote: null, employeeNote: null, status: 'missed' },
    { id: 'c3', dueOn: '2026-11-12', heldOn: null, managerNote: null, employeeNote: null, status: 'due' },
  ],
  warning: false,
  role: 'manager',
  can: { acknowledge: false, checkin: true, employeeNote: false, outcome: false, extend: false, letter: false, startExit: false },
  version: 3,
};
const props: PipScreenProps = { state: 'ready', pip, onBack: noop, onAcknowledge: ok, onCheckin: ok, onOutcome: ok, onLetter: ok, onStartExit: ok };

export const List: S = { render: () => <PipsScreen state="ready" view="team" onView={noop} hasTeam canScope pips={[{ id: 'p1', employee: 'Arjun Rao', manager: 'Priya Nair', status: 'active', startsOn: '2026-10-01', endsOn: '2026-11-30', nextCheckin: '2026-11-12' }]} onOpen={noop} team={[{ id: 'e1', name: 'Arjun Rao' }]} lengths={[30, 60, 90]} onPropose={ok} /> };
export const ManagerView: S = { render: () => <PipScreen {...props} /> };
export const EmployeeToAcknowledge: S = { render: () => <PipScreen {...props} pip={{ ...pip, role: 'employee', can: { ...pip.can, checkin: false, acknowledge: true, employeeNote: true } }} /> };
export const HrPausedWithWarning: S = { render: () => <PipScreen {...props} pip={{ ...pip, role: 'hr', warning: true, pausedNow: true, pausedDays: 10, endsOn: '2026-12-10', can: { ...pip.can, checkin: false, outcome: true, extend: true, letter: true } }} /> };
export const HrNotMet: S = { render: () => <PipScreen {...props} pip={{ ...pip, role: 'hr', status: 'not_met', outcomeNote: 'Errors stayed above 5%.', can: { ...pip.can, checkin: false, startExit: true } }} /> };
