import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsentScreen } from '../candidate';

const meta: Meta<typeof ConsentScreen> = { title: 'Screens/Proctoring/PRC-24 · Consent and what we record', component: ConsentScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ConsentScreen>;

export const Default: S = {};
export const Minor: S = { name: 'Under 18: guardian consent', args: { minor: true } };
export const NoFaceDetection: S = { name: 'No face detection', args: { noFace: true } };
export const Declined: S = { name: 'Declined: manual path offered', args: { declined: true } };
export const Phone: S = { name: 'Consent · phone', globals: { viewport: { value: 'mobile2', isRotated: false } } };
