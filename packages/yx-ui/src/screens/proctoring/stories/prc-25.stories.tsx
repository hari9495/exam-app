import type { Meta, StoryObj } from '@storybook/react-vite';
import { IdentityCheckScreen } from '../candidate';

const meta: Meta<typeof IdentityCheckScreen> = { title: 'Screens/Proctoring/PRC-25 · ID check, room scan, phone pairing', component: IdentityCheckScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IdentityCheckScreen>;

export const IdCard: S = { name: 'ID card capture' };
export const IdBlurry: S = { name: 'ID photo blurry', args: { step: 'id-blurry' } };
export const Selfie: S = { name: 'Selfie and liveness', args: { step: 'selfie' } };
export const LivenessFailed: S = { name: 'Liveness failed: retry', args: { step: 'liveness-fail' } };
export const ManualReview: S = { name: 'Manual review by proctor', args: { step: 'manual' } };
export const RoomScan: S = { name: 'Room scan', args: { step: 'room' } };
export const PhonePairing: S = { name: 'Companion phone pairing', args: { step: 'phone' } };
export const WaitingRoom: S = { name: 'Live waiting room (10-minute fall-back)', args: { step: 'waiting' } };
