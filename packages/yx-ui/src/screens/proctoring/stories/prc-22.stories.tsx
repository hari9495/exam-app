import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReadinessCheckScreen } from '../candidate';

const meta: Meta<typeof ReadinessCheckScreen> = { title: 'Screens/Proctoring/PRC-22 · Readiness check and practice', component: ReadinessCheckScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ReadinessCheckScreen>;

export const Issues: S = { name: 'System check: fails with fix steps' };
export const Running: S = { name: 'System check running', args: { state: 'running' } };
export const Passed: S = { name: 'All passed: practice test', args: { state: 'passed' } };
export const SecureClient: S = { name: 'Secure Client install and self-test', args: { state: 'client' } };
export const Phone: S = { name: 'System check · phone', globals: { viewport: { value: 'mobile2', isRotated: false } } };
