import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScoreReportScreen } from '../bank-tests';

const meta: Meta<typeof ScoreReportScreen> = { title: 'Screens/Proctoring/PRC-06 · Candidate score report', component: ScoreReportScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ScoreReportScreen>;

export const TestOwner: S = { name: 'Test owner view (section cut-off not met)' };
export const Recruiter: S = { name: 'Recruiter view', args: { viewer: 'recruiter' } };
export const Held: S = { name: 'Held: incident open', args: { held: true } };
export const Adaptive: S = { name: 'Adaptive test (θ ± SE)', args: { adaptive: true } };
