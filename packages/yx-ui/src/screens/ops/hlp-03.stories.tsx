import type { Meta, StoryObj } from '@storybook/react-vite';
import { TicketWorkspaceScreen } from './helpdesk';
import { ARTICLES, MACROS, TICKETS, TICKET_ACTIVITY, TICKET_MESSAGES } from './helpdesk-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-03 · Ticket workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { ticket: TICKETS[0], messages: TICKET_MESSAGES, macros: MACROS, articles: ARTICLES, activity: TICKET_ACTIVITY, today: TODAY };

export const Reply: S = { render: () => <TicketWorkspaceScreen {...base} /> };
export const MacroInserted: S = { name: 'Reply with saved reply', render: () => <TicketWorkspaceScreen {...base} defaultDraft={MACROS[0].body.replace('{first_name}', 'Divya')} /> };
export const InternalNote: S = { name: 'Internal note', render: () => <TicketWorkspaceScreen {...base} defaultMode="note" defaultDraft="Checked with Karthik: leave was approved late because he was travelling." /> };
export const WaitingOnEmployee: S = { name: 'Waiting on employee (SLA paused)', render: () => <TicketWorkspaceScreen {...base} ticket={TICKETS[2]} messages={TICKET_MESSAGES.slice(0, 2)} /> };
export const Breached: S = { name: 'Breached SLA', render: () => <TicketWorkspaceScreen {...base} ticket={TICKETS[4]} messages={TICKET_MESSAGES.slice(0, 1)} /> };
export const Resolved: S = { render: () => <TicketWorkspaceScreen {...base} resolved /> };
