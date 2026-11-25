import type { Meta, StoryObj } from '@storybook/react-vite';
import { PipsScreen } from './pips';

// Improvement plans list, wired (batch PM8). The plan itself is the designed PRF-12 screen. In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Improvement plans', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
export const List: S = { render: () => <PipsScreen state="ready" view="team" onView={noop} hasTeam canScope pips={[{ id: 'p1', employee: 'Arjun Rao', manager: 'Priya Nair', status: 'active', startsOn: '2026-10-01', endsOn: '2026-11-30', nextCheckin: '2026-11-12' }]} onOpen={noop} team={[{ id: 'e1', name: 'Arjun Rao' }]} lengths={[30, 60, 90]} onPropose={ok} /> };
