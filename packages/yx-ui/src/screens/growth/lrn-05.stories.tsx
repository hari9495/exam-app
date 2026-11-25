import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrainerQrScreen } from './learn-admin';
import { SESSION_PEOPLE } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-05 · Trainer QR attendance', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { session: 'Fire safety and evacuation', slot: 'Slot 2 of 4 · 24 Sep, 11:30 am', expected: SESSION_PEOPLE.slice(0, 6) };

export const ShowingCode: S = { name: 'Rotating code', globals: PHONE, render: () => <TrainerQrScreen {...base} present={SESSION_PEOPLE.slice(0, 4)} /> };
export const Manual: S = { name: 'Mark manually', globals: PHONE, render: () => <TrainerQrScreen {...base} present={SESSION_PEOPLE.slice(0, 4)} manual /> };
export const Closed: S = { name: 'Check-in closed', globals: PHONE, render: () => <TrainerQrScreen {...base} present={SESSION_PEOPLE.slice(0, 5)} closed /> };
