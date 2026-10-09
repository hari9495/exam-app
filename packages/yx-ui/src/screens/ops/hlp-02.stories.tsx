import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentDeskScreen } from './helpdesk';
import { TICKETS } from './helpdesk-data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-02 · Agent desk', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const MyOpenTickets: S = { name: 'My open tickets', render: () => <AgentDeskScreen tickets={TICKETS} /> };
export const AtRisk: S = { name: 'At risk or breached view', render: () => <AgentDeskScreen tickets={TICKETS} view="risk" /> };
export const Unassigned: S = { render: () => <AgentDeskScreen tickets={TICKETS} view="unassigned" /> };
export const QuickView: S = { name: 'Row quick view', render: () => <AgentDeskScreen tickets={TICKETS} openTicketId="HD-2281" /> };
export const Bulk: S = { name: 'Bulk selection', render: () => <AgentDeskScreen tickets={TICKETS} defaultSelected={['HD-2290', 'HD-2276']} /> };
export const ItAgentNoSensitive: S = { name: 'IT agent (sensitive tickets hidden)', render: () => <AgentDeskScreen tickets={TICKETS} view="all" myQueues={['IT']} /> };
export const Filtered: S = {
  name: 'Filtered to nothing',
  render: () => (
    <AgentDeskScreen
      tickets={TICKETS}
      defaultFilters={[
        { key: 'queue', type: 'multi', values: ['Finance'] },
        { key: 'priority', type: 'multi', values: ['Low'] },
      ]}
    />
  ),
};
export const Empty: S = { render: () => <AgentDeskScreen tickets={TICKETS} state="empty" /> };
export const Loading: S = { render: () => <AgentDeskScreen tickets={TICKETS} state="loading" /> };
export const Error: S = { render: () => <AgentDeskScreen tickets={TICKETS} state="error" /> };
