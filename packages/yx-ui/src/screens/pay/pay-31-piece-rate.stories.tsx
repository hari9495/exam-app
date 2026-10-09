import type { Meta, StoryObj } from '@storybook/react-vite';
import { PieceRateScreen } from './special-pay';

const meta: Meta<typeof PieceRateScreen> = { title: 'Screens/Pay/PAY-31 · Piece-rate cards and output', component: PieceRateScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PieceRateScreen>;

export const Check: S = { name: 'Earnings check · minimum-wage top-up' };
export const Cards: S = { name: 'Rate cards', args: { tab: 'cards' } };
export const Output: S = { name: 'Output this period', args: { tab: 'output' } };
export const Import: S = { name: 'Output import · validation preview', args: { tab: 'output', upload: true } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
