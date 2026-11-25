import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentDeskScreen } from './helpdesk';
import { TICKETS } from './helpdesk-data';
import { DESK_ROWS, liveDesk } from './helpdesk-desk-live-samples';
import { ReferenceLookupDialog } from './reference-lookup';

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

// States the real agent desk has (Helpdesk design wiring, round 2; founder answer 1: the HLP design wins). Drawn in the
// same layout as the stories above.
export const Board: S = { name: 'Board · tickets by state', render: () => <AgentDeskScreen live={liveDesk({ query: { ...liveDesk().query, layout: 'board' } })} /> };
export const SavedView: S = { name: 'Saved views · my own view open', render: () => <AgentDeskScreen live={liveDesk({ query: { viewId: 'v1', filters: { search: 'vpn' }, layout: 'list' }, page: { items: [DESK_ROWS[0]], total: 1, nextCursor: null } })} /> };
export const ChangePriority: S = { name: 'Bulk · change priority (with a reason)', render: () => <AgentDeskScreen live={liveDesk({ start: { selected: ['t1', 't2'], dialog: 'priority' } })} /> };
export const MoveQueue: S = { name: 'Bulk · move to another queue', render: () => <AgentDeskScreen live={liveDesk({ start: { selected: ['t1'], dialog: 'move' } })} /> };
export const AddTag: S = { name: 'Bulk · add a tag', render: () => <AgentDeskScreen live={liveDesk({ start: { selected: ['t1', 't3'], dialog: 'tag' } })} /> };
export const BulkRefused: S = { name: 'Bulk · some tickets not changed', render: () => <AgentDeskScreen live={liveDesk({ start: { bulkResult: '1 changed. 1 not changed: IT-1004: This ticket was changed by someone else. Open it again.' } })} /> };
export const NewTicket: S = { name: 'New ticket for an employee', render: () => <AgentDeskScreen live={liveDesk({ start: { dialog: 'new' } })} /> };
export const QuickViewLive: S = { name: 'Quick view · both response targets, assign to me', render: () => <AgentDeskScreen live={liveDesk({ start: { openId: 't2' } })} /> };
export const AgentNotLead: S = { name: 'Agent (not a team lead) · no bulk selection', render: () => <AgentDeskScreen live={liveDesk({ page: { items: DESK_ROWS.map((r) => ({ ...r, canBulk: false })), total: 3, nextCursor: null } })} /> };
export const NoAccess: S = { name: 'No access (no desk seat)', render: () => <AgentDeskScreen live={liveDesk({ state: 'no-access' })} /> };

// Answer 947: an agent looks up the reference a person read out from a Not found page.
const LOOKED_UP = { code: 'NF-7KQ2MP', at: '2026-11-11T05:42:00.000Z', who: 'Anitha Rao', path: '/yx/people/3f2c9a1e-7b44-4c1d-9a55-0e6b1f2d8c11' };
export const LookUpButton: S = { name: 'Look up a Not found reference · button', render: () => <AgentDeskScreen live={liveDesk({ onLookUpReference: async () => LOOKED_UP })} /> };
export const LookUpResult: S = { name: 'Look up a Not found reference · found', render: () => <ReferenceLookupDialog initialCode="NF-7KQ2MP" initialResult={LOOKED_UP} onLookUp={async () => LOOKED_UP} onClose={() => {}} /> };
