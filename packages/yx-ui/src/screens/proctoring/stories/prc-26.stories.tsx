import type { Meta, StoryObj } from '@storybook/react-vite';
import { LIVE_RUNNER } from '../runner-live-samples';
import { TestRunnerScreen } from '../candidate';

const meta: Meta<typeof TestRunnerScreen> = { title: 'Screens/Proctoring/PRC-26 · Test runner', component: TestRunnerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TestRunnerScreen>;

export const Mcq: S = { name: 'Multiple choice with sections' };
export const Coding: S = { name: 'Coding question', args: { view: 'coding' } };
export const Descriptive: S = { name: 'Descriptive answer', args: { view: 'descriptive' } };
export const CalculatorOpen: S = { name: 'Calculator', args: { view: 'calculator' } };
export const Accessibility: S = { name: 'Accessibility settings: large text, high contrast', args: { view: 'accessibility' } };
export const Reconnecting: S = { name: 'Reconnecting: answers kept on device', args: { view: 'reconnecting' } };
export const WeakConnection: S = { name: 'Weak connection', args: { conn: 'weak' } };
export const Break: S = { name: 'Break between sections', args: { view: 'break' } };
export const PausedByProctor: S = { name: 'Paused by proctor', args: { view: 'paused' } };
export const AiAllowed: S = { name: 'AI-allowed test: logged assistant', args: { view: 'ai-allowed' } };
export const Finish: S = { name: 'Finish confirmation', args: { view: 'finish' } };
export const Submitted: S = { name: 'Submitted and optional survey', args: { view: 'submitted' } };

// AS-4a: the runner with a real attempt (live): offline past the company's limit, and submitted with the survey.
export const LiveOfflineStopped: S = { name: 'Live · offline past the limit (answers kept on device)', args: { live: { ...LIVE_RUNNER, connection: 'offline', offlineSeconds: 360, queued: 2, saveStatus: 'offline' } } };
export const LiveSubmittedSurvey: S = { name: 'Live · submitted, survey', args: { live: { ...LIVE_RUNNER, status: 'submitted', submittedAt: '11:52 am' } } };
export const LiveBreak: S = { name: 'Live · on a break', args: { live: { ...LIVE_RUNNER, status: 'break', breakSecondsLeft: 236, breaksLeft: 0 } } };
// AS-4b (answer 2164): screen-reader mode approved for this candidate shows in Display settings.
export const LiveReaderApproved: S = { name: 'Live · screen-reader mode approved for you', args: { live: { ...LIVE_RUNNER, approvedHelp: ['reader', 'time'] } } };
