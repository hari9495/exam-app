import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProofQueueScreen } from './admin-tax-loans';

const meta: Meta<typeof ProofQueueScreen> = { title: 'Screens/Pay/PAY-23 · Proof verification queue', component: ProofQueueScreen, render: (args) => <ProofQueueScreen {...args} />, parameters: { layout: 'fullscreen' } };
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
// Founder 30 Oct 2026 (last 10, items 7 and 10): the residential-status request row and its decision drawer.
export const ResidencyQueue: S = { name: 'Residency · in the queue (TRC and back to resident)', args: { residency: 'queue' } };
export const ResidencyPendingTrc: S = { name: 'Residency · to non-resident with a TRC · decide', args: { residency: 'pending-trc' } };
export const ResidencyBackToResident: S = { name: 'Residency · back to resident · no document', args: { residency: 'back-to-resident' } };
export const ResidencyApproved: S = { name: 'Residency · approved', args: { residency: 'approved' } };
export const ResidencyRefused: S = { name: 'Residency · refused with a reason', args: { residency: 'refused' } };
export const ResidencyOwn: S = { name: 'Residency · deciding your own · refused', args: { residency: 'own' } };
// PAY-22 NoPan (2 Nov 2026): the PAN-Aadhaar link confirmation an employee sends is checked here.
export const PanLinkQueue: S = { name: 'PAN link · in the queue', args: { panLink: 'queue' } };
export const PanLinkDecide: S = { name: 'PAN link · confirmation · decide', args: { panLink: 'decide' } };
export const PanLinkRefused: S = { name: 'PAN link · refused with a reason', args: { panLink: 'refused' } };
export const Windows: S = { name: 'Windows · HR opens or locks early (E1)', args: { windows: true } };
