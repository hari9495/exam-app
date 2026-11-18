import type { Meta, StoryObj } from '@storybook/react-vite';
import { TestResultsScreen } from '../tests-results';
import { liveResults } from '../tests-live-samples';

// Answer 2437: test results for people who read results but do not build tests.
const meta: Meta<typeof TestResultsScreen> = { title: 'Screens/Proctoring/PRC-04 · Test results (readers)', component: TestResultsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TestResultsScreen>;

const tests = [{ id: 't2', title: 'Campus aptitude 2026' }, { id: 't3', title: 'Java Backend Developer · L2' }];
export const Picked: S = { name: 'A test picked', args: { live: { tests, testId: 't2', onPickTest: () => undefined, results: liveResults({ onRelease: undefined }) } } };
export const NonePicked: S = { name: 'No test picked yet', args: { live: { tests, testId: null, onPickTest: () => undefined, results: null } } };
export const NoTests: S = { name: 'No tests to show', args: { live: { tests: [], testId: null, onPickTest: () => undefined, results: null } } };
