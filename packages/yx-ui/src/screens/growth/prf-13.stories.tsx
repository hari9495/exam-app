import type { Meta, StoryObj } from '@storybook/react-vite';
import { HandoverListScreen } from './perf-people';
import { HANDOVER } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-13 · Hand-over list', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const NewManager: S = { name: 'New manager · handed over to you', render: () => <HandoverListScreen persona="mgr" rows={HANDOVER.filter((r) => r.to === 'Karthik Subramanian')} leaver="Priya Nair" /> };
export const HrDecisions: S = { name: 'HR · needs decision', render: () => <HandoverListScreen persona="hr" rows={HANDOVER} leaver="Priya Nair" /> };
export const Empty: S = { render: () => <HandoverListScreen persona="hr" rows={[]} leaver="Priya Nair" /> };
export const Loading: S = { render: () => <HandoverListScreen persona="hr" rows={[]} state="loading" leaver="Priya Nair" /> };
