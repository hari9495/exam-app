import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateAppScreen } from '../candidate';

const meta: Meta<typeof CandidateAppScreen> = { title: 'Screens/Proctoring/PRC-31 · Candidate app', component: CandidateAppScreen, parameters: { layout: 'fullscreen' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export default meta;
type S = StoryObj<typeof CandidateAppScreen>;

export const MyTests: S = { name: 'My tests · phone' };
export const Readiness: S = { name: 'Readiness · phone', args: { view: 'readiness' } };
export const Pinning: S = { name: 'Screen pinning required · phone', args: { view: 'pinning' } };
export const Runner: S = { name: 'Proctored runner · phone', args: { view: 'runner' } };
export const Result: S = { name: 'Result · phone', args: { view: 'result' } };
export const Privacy: S = { name: 'Privacy centre · phone', args: { view: 'privacy' } };
