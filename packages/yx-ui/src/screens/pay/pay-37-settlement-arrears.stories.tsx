import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettlementArrearsScreen } from './offcycle';

const meta: Meta<typeof SettlementArrearsScreen> = { title: 'Screens/Pay/PAY-37 · Wage-settlement arrears', component: SettlementArrearsScreen, render: (args) => <SettlementArrearsScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof SettlementArrearsScreen>;

export const Categories: S = { name: 'Categories and arrears' };
export const Settlement: S = { name: 'Settlement terms', args: { step: 'settlement' } };
export const Worksheet: S = { name: 'Arrears worksheet', args: { step: 'worksheet' } };
export const Empty: S = { name: 'Empty · no settlement yet', args: { empty: true } };
export const NewSettlement: S = { name: 'New settlement · drawer open', args: { empty: true, newSettlement: 'empty' } };
export const NewSettlementFilled: S = { name: 'New settlement · filled in', args: { newSettlement: 'filled' } };
export const NewSettlementTooEarly: S = { name: 'New settlement · pressed too early (field errors)', args: { newSettlement: 'too-early' } };
export const NewSettlementRefused: S = { name: 'New settlement · refused by the server', args: { newSettlement: 'refused' } };
