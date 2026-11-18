import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyFlexBenefitsScreen } from './flex-benefits';

const meta: Meta<typeof MyFlexBenefitsScreen> = { title: 'Screens/Pay/PAY-59 · My flexible benefits', component: MyFlexBenefitsScreen, render: (args) => <MyFlexBenefitsScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MyFlexBenefitsScreen>;

export const Ledger: S = { name: 'This year · ledger' };
export const Empty: S = { name: 'No plan', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
