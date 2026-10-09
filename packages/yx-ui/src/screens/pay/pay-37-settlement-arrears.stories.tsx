import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettlementArrearsScreen } from './offcycle';

const meta: Meta<typeof SettlementArrearsScreen> = { title: 'Screens/Pay/PAY-37 · Wage-settlement arrears', component: SettlementArrearsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof SettlementArrearsScreen>;

export const Categories: S = { name: 'Categories and arrears' };
export const Settlement: S = { name: 'Settlement terms', args: { step: 'settlement' } };
export const Worksheet: S = { name: 'Arrears worksheet', args: { step: 'worksheet' } };
