import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProctoringSettingsScreen } from '../live';

const meta: Meta<typeof ProctoringSettingsScreen> = { title: 'Screens/Proctoring/PRC-12 · Proctoring settings', component: ProctoringSettingsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ProctoringSettingsScreen>;

export const RecordAndReview: S = { name: 'Record & review with action matrix' };
export const Live: S = { name: 'Live: mode minimums locked', args: { defaultMode: 'live' } };
export const Open: S = { name: 'Open (matrix off)', args: { defaultMode: 'open' } };
export const NoFaceDetection: S = { name: 'No face detection', args: { noFace: true } };
export const AiAllowed: S = { name: 'AI-allowed test', args: { aiAllowed: true } };
export const Simple: S = { name: 'Mode picker only', args: { showMatrix: false, defaultMode: 'ai' } };
