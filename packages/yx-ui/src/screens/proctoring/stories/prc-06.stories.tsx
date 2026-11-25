import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScoreReportScreen } from '../bank-tests';
import { liveReport } from '../tests-live-samples';

const meta: Meta<typeof ScoreReportScreen> = { title: 'Screens/Proctoring/PRC-06 · Candidate score report', component: ScoreReportScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ScoreReportScreen>;

export const TestOwner: S = { name: 'Test owner view (section cut-off not met)' };
export const Recruiter: S = { name: 'Recruiter view', args: { viewer: 'recruiter' } };
export const Held: S = { name: 'Held: incident open', args: { held: true } };
export const Adaptive: S = { name: 'Adaptive test (θ ± SE)', args: { adaptive: true } };

// AS-2: one candidate's result from the company's report; raw marks for test writers only.
export const LiveRecruiter: S = { name: 'Company result: recruiter view', render: () => <ScoreReportScreen live={liveReport({ viewer: 'recruiter' })} /> };
export const LiveHeld: S = { name: 'Company result: held (evidence kept)', render: () => <ScoreReportScreen live={liveReport({ report: { ...liveReport().report!, releaseOverride: 'held', released: false } })} /> };
