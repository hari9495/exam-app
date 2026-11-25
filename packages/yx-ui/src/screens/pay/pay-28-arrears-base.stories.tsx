import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrearsBaseScreen } from './offcycle';

const meta: Meta<typeof ArrearsBaseScreen> = { title: 'Screens/Pay/PAY-28 · Arrears base confirmation', component: ArrearsBaseScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ArrearsBaseScreen>;

export const Missing: S = { name: 'Month missing · approval blocked' };
export const Confirmed: S = { name: 'Base confirmed · ready to compute', args: { confirmed: true } };
export const Computed: S = { name: 'Arrears computed · send for approval', args: { confirmed: true, computed: true } };
export const List: S = { name: 'Worksheets · list (the page)', args: { view: 'list' } };
export const ListOpen: S = { name: 'Worksheets · one open, base needed', args: { view: 'list', openId: 'ws-0' } };
export const Empty: S = { name: 'Empty · no worksheets', args: { view: 'list', state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { view: 'list', state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { view: 'list', state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { view: 'list', state: 'no-access' } };
