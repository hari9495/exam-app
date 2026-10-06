import type { Meta, StoryObj } from '@storybook/react-vite';
import { APPEALS, AppealsScreen } from '../integrity';

const meta: Meta<typeof AppealsScreen> = { title: 'Screens/Proctoring/PRC-18 · Appeals queue', component: AppealsScreen, parameters: { layout: 'fullscreen' }, args: { appeals: APPEALS } };
export default meta;
type S = StoryObj<typeof AppealsScreen>;

export const Default: S = { name: 'Decide an appeal' };
export const Overturned: S = { args: { decided: 'overturned' } };
export const Upheld: S = { args: { decided: 'upheld' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
