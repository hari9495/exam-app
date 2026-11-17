import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReadinessCheckScreen, ReadyToStartScreen } from '../candidate';

const meta: Meta<typeof ReadinessCheckScreen> = { title: 'Screens/Proctoring/PRC-22 · Readiness check and practice', component: ReadinessCheckScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ReadinessCheckScreen>;

export const Issues: S = { name: 'System check: fails with fix steps' };
export const Running: S = { name: 'System check running', args: { state: 'running' } };
export const Passed: S = { name: 'All passed: practice test', args: { state: 'passed' } };
export const SecureClient: S = { name: 'Secure Client install and self-test', args: { state: 'client' } };
export const Phone: S = { name: 'System check · phone', globals: { viewport: { value: 'mobile2', isRotated: false } } };

// AS-4b (PRC-22): the checks run on the candidate's own computer (camera, displays, browser, network, device).
const LIVE_CHECKS = [
  { id: 'camera', label: 'Camera', status: 'pass' as const, detail: 'Camera found and allowed.', blocking: true },
  { id: 'displays', label: 'Displays', status: 'fail' as const, detail: 'More than one display is connected.', blocking: true, fix: ['Unplug the extra display, or switch to one display in your settings.', 'Run the check again.'] },
  { id: 'browser', label: 'Browser', status: 'pass' as const, detail: 'This browser can run the test.', blocking: true },
  { id: 'network', label: 'Network', status: 'warn' as const, detail: 'Delay 820 ms. The test works, but slowly.', fix: ['Move closer to your Wi-Fi router or use a cable.', 'Pause downloads and video calls.'] },
  { id: 'device', label: 'Device', status: 'pass' as const, detail: '8 processor cores.' },
];
export const LiveChecks: S = { name: 'Your computer: one problem blocks the start', render: () => <ReadinessCheckScreen live={{ companyName: 'Kaveri Foods', testTitle: 'Java Backend Developer · L2', checks: LIVE_CHECKS, running: false, onRunAgain: () => {}, onBack: () => {} }} /> };
export const LiveRunning: S = { name: 'Your computer: checking', render: () => <ReadinessCheckScreen live={{ companyName: 'Kaveri Foods', testTitle: 'Java Backend Developer · L2', checks: LIVE_CHECKS.map((c, i) => ({ ...c, status: i < 2 ? c.status : ('running' as const), fix: undefined })), running: true, onRunAgain: () => {}, onBack: () => {} }} /> };

// Answer 2232: the last step on /welcome, before the test starts.
export const ReadyToStart: S = { name: 'Ready to start', render: () => <ReadyToStartScreen /> };
export const ReadyCameraOff: S = { name: 'Ready to start: camera not on yet', render: () => <ReadyToStartScreen state="camera-off" /> };
export const ReadyNotOpen: S = { name: 'Ready to start: not open yet', render: () => <ReadyToStartScreen state="not-open" /> };
export const ReadySeb: S = { name: 'Ready to start: Safe Exam Browser required', render: () => <ReadyToStartScreen state="seb" /> };
export const ReadyProblem: S = { name: 'Ready to start: another display found', render: () => <ReadyToStartScreen state="problem" /> };
