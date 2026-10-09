import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayBandScreen } from './employee-pay';

const meta: Meta<typeof PayBandScreen> = { title: 'Screens/Pay/PAY-39 · My pay band', component: PayBandScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayBandScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const InBand: S = { name: 'Within band' };
export const Above: S = { name: 'Above band maximum', args: { variant: 'above' } };
export const Off: S = { name: 'Visibility off', args: { variant: 'off' } };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const ErrorState: S = { name: 'Error', args: { state: 'error' } };
