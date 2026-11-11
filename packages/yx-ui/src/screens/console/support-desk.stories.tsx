import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsoleShell } from './console-shell';
import { SupportDeskQueueScreen, SupportDeskTicketScreen } from './support-desk';
import { DESK_NOW, DESK_TICKET, QUEUE, UNLINKED_TICKET } from './support-desk-data';

const meta: Meta = { title: 'Screens/YukthiX console/Support desk (SD-1.31)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = () => new Promise<void>((r) => setTimeout(r, 400));
const shell = (children: React.ReactNode) => (
  <ConsoleShell active="support-desk" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    {children}
  </ConsoleShell>
);

function Queue() {
  const [show, setShow] = useState<'open' | 'all'>('open');
  return <SupportDeskQueueScreen state="ready" rows={QUEUE} show={show} onShow={setShow} onOpen={() => {}} now={DESK_NOW} />;
}
const ticket = (view = DESK_TICKET) => <SupportDeskTicketScreen state="ready" view={view} canRequestAccess onBack={() => {}} onPost={wait} onAssignMe={wait} onResolve={wait} onLink={wait} onRequestAccess={wait} now={DESK_NOW} />;

export const QueueStory: S = { name: 'Queue', render: () => shell(<Queue />) };
export const NotAgent: S = { name: 'Queue · not a support agent', render: () => shell(<SupportDeskQueueScreen state="no-access" blocked="You are not a YukthiX Support agent. Ask the support lead to add you." rows={[]} show="open" onShow={() => {}} onOpen={() => {}} />) };
export const Ticket: S = { name: 'Ticket · Priority Support', render: () => shell(ticket()) };
export const Asked: S = { name: 'Ticket · access asked', render: () => shell(ticket({ ...DESK_TICKET, session: { id: 's', status: 'requested', hours: 4, startsAt: null, endsAt: null, mine: true, requestedBy: 'You', decidedBy: null, decisionNote: null } })) };
export const Unlinked: S = { name: 'Ticket · not linked', render: () => shell(ticket(UNLINKED_TICKET)) };

// Answer 1051: staff look up a Not found reference across companies; one code can exist in two.
export const LookUpReference: S = {
  name: 'Queue · look up a Not found reference (two companies)',
  render: () =>
    shell(
      <SupportDeskQueueScreen
        state="ready"
        rows={QUEUE}
        show="open"
        onShow={() => {}}
        onOpen={() => {}}
        now={DESK_NOW}
        onLookUpReference={async () => []}
        lookUp={{ code: 'NF-7KQ2MP', result: [{ code: 'NF-7KQ2MP', company: 'Kaveri Foods Pvt Ltd', at: '2026-11-11T05:42:00.000Z', path: '/api/v1/people/employees/3f2c9a1e/profile' }, { code: 'NF-7KQ2MP', company: 'Sahyadri Textiles', at: '2026-10-02T10:15:00.000Z', path: '/yx/no-such-page' }] }}
      />,
    ),
};
