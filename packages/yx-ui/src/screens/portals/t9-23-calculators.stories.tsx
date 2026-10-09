import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalculatorsScreen } from './t9-public';

const meta: Meta = { title: 'Screens/Portals/T9-23 · Public calculators and letter generators', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const CtcToInHand: S = { name: 'CTC to in-hand', render: () => <CalculatorsScreen calc="ctc" /> };
export const Regime: S = { name: 'Old vs new regime', render: () => <CalculatorsScreen calc="regime" /> };
export const Hra: S = { name: 'HRA exemption', render: () => <CalculatorsScreen calc="hra" /> };
export const Gratuity: S = { render: () => <CalculatorsScreen calc="gratuity" /> };
export const PfEsi: S = { name: 'PF and ESI', render: () => <CalculatorsScreen calc="pf-esi" /> };
export const Leave: S = { name: 'Leave encashment', render: () => <CalculatorsScreen calc="leave" /> };
export const Letters: S = { name: 'Letter generator', render: () => <CalculatorsScreen calc="letters" /> };
export const Phone: S = { name: 'Gratuity · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <CalculatorsScreen calc="gratuity" /> };
