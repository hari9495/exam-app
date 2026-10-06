import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProofQueueScreen } from './admin-tax-loans';

const meta: Meta<typeof ProofQueueScreen> = { title: 'Screens/Pay/PAY-23 · Proof verification queue', component: ProofQueueScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ProofQueueScreen>;

export const Queue: S = { name: 'Waiting lines' };
export const Line: S = { name: 'Line with document · approve', args: { openId: 'pr1' } };
export const Partial: S = { name: 'Approve part with comment', args: { openId: 'pr1', decision: 'partial' } };
export const Reject: S = { name: 'Reject with comment', args: { openId: 'pr1', decision: 'reject' } };
/** Suresh Pillai's own line (pr-own in PROOF_ROWS): the payroll manager can't verify it himself. */
export const OwnProof: S = { name: 'Own proof · cannot verify', args: { openId: 'pr-own' } };
export const Empty: S = { name: 'Empty · nothing submitted', args: { rows: [] } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
