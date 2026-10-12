import type { Meta, StoryObj } from '@storybook/react-vite';
import { FeedbackScreen, OneOnOneScreen, OneOnOnesScreen, type FeedbackScreenProps } from './feedback';
import type { FeedbackItem, OneOnOne } from './types';

// Feedback and 1:1s, wired (batch PM3; PRF-04 / 05). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Feedback and 1:1s', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const item = (o: Partial<FeedbackItem> = {}): FeedbackItem => ({ id: 'f1', from: 'Sita Iyer', fromEmployeeId: 'e2', to: 'Arjun Rao', toEmployeeId: 'e1', kind: 'praise', text: 'Thanks for covering the Madurai visit.', visibility: 'private', goalId: null, fromRequest: false, at: '2026-10-10T09:00:00.000Z', sealed: false, can: { withdraw: false, seal: false }, ...o });
const people = [
  { value: 'e1', label: 'Arjun Rao' },
  { value: 'e2', label: 'Sita Iyer' },
  { value: 'e3', label: 'Priya Nair' },
];
const props: FeedbackScreenProps = {
  state: 'ready',
  view: 'received',
  onView: noop,
  hasTeam: true,
  canSeal: false,
  sealEmployeeId: null,
  onSealEmployee: noop,
  items: [item(), item({ id: 'f2', kind: 'suggestion', text: null, sealed: true })],
  requests: [{ id: 'r1', about: 'Arjun Rao', aboutEmployeeId: 'e1', requestedBy: 'Priya Nair', question: 'How did Arjun handle the dealer meet?', dueOn: '2026-10-20' }],
  colleagues: people,
  askAbout: people.slice(0, 1),
  concernHref: '/yx/desk/help',
  onGive: ok,
  onWithdraw: ok,
  onRequest: ok,
  onDecline: ok,
  onSeal: ok,
};
const meeting: OneOnOne = {
  id: 'm1',
  employee: 'Arjun Rao',
  employeeId: 'e1',
  manager: 'Priya Nair',
  managerEmployeeId: 'e3',
  role: 'manager',
  on: '2026-10-13',
  status: 'planned',
  sharedNotes: 'Agreed on Q3 targets.',
  agenda: [{ id: 'a1', text: 'Dealer targets', done: false, addedBy: 'Arjun Rao' }],
  actions: [{ id: 'x1', text: 'Send the dealer list', owner: 'Arjun Rao', ownerEmployeeId: 'e1', dueOn: '2026-10-17', goalId: null, done: false }],
  privateNote: 'Ready for a bigger territory.',
  version: 2,
};

export const Received: S = { render: () => <FeedbackScreen {...props} /> };
export const AskedOfMe: S = { render: () => <FeedbackScreen {...props} view="requests" /> };
export const Concerns: S = { render: () => <FeedbackScreen {...props} view="concerns" canSeal sealEmployeeId="e1" items={[item({ can: { withdraw: false, seal: true } }), item({ id: 'f2', sealed: true, text: 'Sealed text, shown only to HR who handle concerns.' })]} /> };
export const OneOnOnes: S = { render: () => <OneOnOnesScreen state="ready" meetings={[{ id: 'm1', with: 'Arjun Rao', on: '2026-10-13', status: 'planned', role: 'manager' }]} partners={people} onCreate={ok} onOpen={noop} /> };
export const OneOnOneRecord: S = { render: () => <OneOnOneScreen state="ready" meeting={meeting} onBack={noop} onUpdate={ok} onAgenda={ok} onAgendaDone={ok} onPrivateNote={ok} onAction={ok} onActionDone={ok} /> };
