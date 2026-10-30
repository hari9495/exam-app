import type { Meta, StoryObj } from '@storybook/react-vite';
import { KioskScreen } from './field';

const meta: Meta<typeof KioskScreen> = { title: 'Screens/Time/TIM-13 · Kiosk', component: KioskScreen, render: (args) => <KioskScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof KioskScreen>;

export const Code: S = { name: 'Employee code' };
export const UnknownCode: S = { name: 'Unknown employee code', args: { view: 'unknown_code' } };
export const Qr: S = { name: 'Scan ID card QR', args: { view: 'qr' } };
export const Pin: S = { name: 'PIN', args: { view: 'pin' } };
export const WrongPin: S = { name: 'Wrong PIN', args: { view: 'wrong_pin' } };
export const Menu: S = { name: 'Menu · balance, proxy request banner', args: { view: 'menu' } };
export const CheckedIn: S = { name: 'Checked in', args: { view: 'checked_in' } };
export const Training: S = { name: 'Training attendance', args: { view: 'training' } };
export const TrainingNone: S = { name: 'Training · none today', args: { view: 'training_none' } };
export const Leave: S = { name: 'Apply leave', args: { view: 'leave' } };
export const Status: S = { name: 'Request status', args: { view: 'status' } };
