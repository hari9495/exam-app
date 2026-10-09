import type { Meta, StoryObj } from '@storybook/react-vite';
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
