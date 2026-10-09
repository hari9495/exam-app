import type { Meta, StoryObj } from '@storybook/react-vite';
import { SlaDashboardScreen } from './helpdesk';
import { TICKETS } from './helpdesk-data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-05 · SLA dashboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const QueueLead: S = { name: 'Queue lead', render: () => <SlaDashboardScreen tickets={TICKETS} /> };
export const Loading: S = { render: () => <SlaDashboardScreen tickets={TICKETS} loading /> };
export const Empty: S = { name: 'Empty (no tickets in period)', render: () => <SlaDashboardScreen tickets={[]} empty /> };
