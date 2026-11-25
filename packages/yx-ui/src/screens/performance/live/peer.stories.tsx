import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewerBlocksScreen } from './peer';

// Peer and 360° feedback, wired (batch PM5; PRF-07). In the affordance guard set ('screens-performance-live').
const meta: Meta = { title: 'Screens/Performance/Live · Peer feedback', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
// Batch F (answer 2579): the tasks list and the answer form are designed screens now (PRF-07 stories).
export const Blocks: S = { render: () => <ReviewerBlocksScreen state="ready" blocks={[{ id: 'b1', a: 'Arjun Rao', b: 'Sita Iyer', employeeA: 'e1', employeeB: 'e2', reasonCode: 'conflict', untilOn: null }]} people={[]} onSearch={noop} onBlock={ok} onEnd={ok} /> };
