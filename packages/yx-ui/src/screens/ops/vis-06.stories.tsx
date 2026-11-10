import type { Meta, StoryObj } from '@storybook/react-vite';
import { ROLLCALL_SAMPLE, RollCallScreen } from './visitor-rollcall';

// Visitors slice 4 (answer 612): everyone on site now, visitors and employees, one printable list.
const meta: Meta = { title: 'Screens/Visitors/VIS-06 · Emergency roll-call', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const RollCall: S = { name: 'On site now · visitors and employees', render: () => <RollCallScreen data={ROLLCALL_SAMPLE} /> };
export const Empty: S = { render: () => <RollCallScreen data={ROLLCALL_SAMPLE} state="empty" /> };
export const Loading: S = { render: () => <RollCallScreen data={ROLLCALL_SAMPLE} state="loading" /> };
