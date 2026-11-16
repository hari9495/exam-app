import type { Meta, StoryObj } from '@storybook/react-vite';
import { IdentityCheckScreen } from '../candidate';
import { LIVE_SELFIE } from '../runner-live-samples';

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

// Answer 2201: the selfie on the candidate's own camera (the page passes its video).
export const LiveSelfieTryFailed: S = { name: 'Live · selfie, a try failed', args: { live: { ...LIVE_SELFIE, tries: 1, failed: true, hint: 'We could not get a clear photo in time. Face the camera in good light, then blink.' } } };
export const LiveSelfieBlocked: S = { name: 'Live · photo required and not taken: manual check asked', args: { live: { ...LIVE_SELFIE, tries: 3, blocked: true, manual: { state: 'asked', onAsk: async () => undefined } } } };
