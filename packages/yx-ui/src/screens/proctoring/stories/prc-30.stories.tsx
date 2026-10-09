import type { Meta, StoryObj } from '@storybook/react-vite';
import { InvigilatorAppScreen } from '../delivery';

const meta: Meta<typeof InvigilatorAppScreen> = { title: 'Screens/Proctoring/PRC-30 · Invigilator app', component: InvigilatorAppScreen, parameters: { layout: 'fullscreen' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export default meta;
type S = StoryObj<typeof InvigilatorAppScreen>;

export const RollCall: S = { name: 'Roll call · phone' };
export const Scan: S = { name: 'Admit-card QR check-in · phone', args: { view: 'scan' } };
export const IdMismatch: S = { name: 'Photo ID mismatch: admit with reason · phone', args: { view: 'id-mismatch' } };
export const Incident: S = { name: 'Incident log · phone', args: { view: 'incident' } };
export const Offline: S = { name: 'Offline sync status · phone', args: { view: 'offline' } };
