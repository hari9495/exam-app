import type { Meta, StoryObj } from '@storybook/react-vite';
import { APPEALS, AppealsScreen } from '../integrity';
import { LIVE_APPEAL_ROWS } from '../integrity-live-samples';
const fn = async () => undefined;

const meta: Meta<typeof AppealsScreen> = { title: 'Screens/Proctoring/PRC-18 · Appeals queue', component: AppealsScreen, parameters: { layout: 'fullscreen' }, args: { appeals: APPEALS } };
export default meta;
type S = StoryObj<typeof AppealsScreen>;

export const Default: S = { name: 'Decide an appeal' };
export const Overturned: S = { args: { decided: 'overturned' } };
export const Upheld: S = { args: { decided: 'upheld' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };

// AS-5 part 1: real appeals; one you gave the verdict on (someone else decides it).
export const LiveDecide: S = { name: 'Live · decide an appeal', args: { live: { state: 'ready', onRetry: () => {}, rows: LIVE_APPEAL_ROWS, me: 'u-lakshmi', onUphold: fn, onOverturn: fn } } };
export const LiveExcluded: S = { name: 'Live · you gave the verdict', args: { live: { state: 'ready', onRetry: () => {}, rows: LIVE_APPEAL_ROWS, me: 'u-farah', onUphold: fn, onOverturn: fn } } };
