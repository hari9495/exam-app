import type { Meta, StoryObj } from '@storybook/react-vite';
import { VrsScheme } from './relations';

const meta: Meta = { title: 'Screens/People/PPL-40 · VRS scheme', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Applications: S = { name: 'HR · applications and approvals', render: () => <VrsScheme /> };
export const Setup: S = { name: 'HR · scheme set-up', render: () => <VrsScheme tab="setup" /> };
export const Apply: S = { name: 'Employee · apply with estimate', render: () => <VrsScheme persona="emp" /> };
export const NotEligible: S = { name: 'Employee · not eligible', render: () => <VrsScheme persona="emp" eligible={false} /> };
