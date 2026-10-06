import type { Meta, StoryObj } from '@storybook/react-vite';
import { IntegrityReportsScreen } from '../integrity';

const meta: Meta<typeof IntegrityReportsScreen> = { title: 'Screens/Proctoring/PRC-20 · Integrity reports', component: IntegrityReportsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IntegrityReportsScreen>;

export const Collusion: S = {};
export const Plagiarism: S = { name: 'Plagiarism and code similarity', args: { tab: 'plagiarism' } };
export const Agreement: S = { name: 'Inter-rater agreement', args: { tab: 'agreement' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
