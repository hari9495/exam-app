import type { Meta, StoryObj } from '@storybook/react-vite';
import { CardImportScreen } from './expenses-finance';
import { CARD_LINES } from './expenses-data';

const meta: Meta = { title: 'Screens/Expenses/EXP-08 · Card statement import & matching', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Upload: S = { name: 'Upload statement', render: () => <CardImportScreen lines={CARD_LINES} current="upload" /> };
export const Map: S = { name: 'Check columns', render: () => <CardImportScreen lines={CARD_LINES} current="map" /> };
export const Match: S = { name: 'Auto-match results', render: () => <CardImportScreen lines={CARD_LINES} /> };
export const Resolve: S = { render: () => <CardImportScreen lines={CARD_LINES} current="resolve" /> };
export const EmployeePhone: S = { name: 'Employee explains lines · phone', globals: PHONE, render: () => <CardImportScreen lines={CARD_LINES} device="phone" /> };
