import type { Meta, StoryObj } from '@storybook/react-vite';
import { LIVE_INVITATIONS, liveInvitations } from '../delivery-live-samples';
import { InvitationsScreen } from '../delivery';
import { DRIVES, INVITATIONS } from '../proctoring-data';

const meta: Meta<typeof InvitationsScreen> = { title: 'Screens/Proctoring/PRC-07 · Invitations and drives', component: InvitationsScreen, parameters: { layout: 'fullscreen' }, args: { invitations: INVITATIONS, drives: DRIVES } };
export default meta;
type S = StoryObj<typeof InvitationsScreen>;

export const Invitations: S = {};
export const Drives: S = { args: { tab: 'drives' } };
export const InviteDrawer: S = { name: 'Invite candidates', args: { inviteOpen: true } };
export const MissedCandidate: S = { name: 'Missed test: re-invite', args: { defaultOpenId: 'INV-3406' } };
export const EmployeeTestTaker: S = { name: 'Employee test-taker', args: { defaultOpenId: 'INV-3407' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
export const Error: S = { args: { state: 'error' } };

// AS-3: the company's real invitations and drives (live).
export const LiveInvitations: S = { name: 'Live · invitations', render: () => <InvitationsScreen live={liveInvitations()} /> };
export const LiveEmpty: S = { name: 'Live · no one invited yet', render: () => <InvitationsScreen live={liveInvitations({ invitations: [], drives: [] })} /> };
export const LiveError: S = { name: 'Live · could not load', render: () => <InvitationsScreen live={liveInvitations({ state: 'error' })} /> };
export const LiveReinvited: S = { name: 'Live · missed, already re-invited', render: () => <InvitationsScreen live={liveInvitations({ invitations: LIVE_INVITATIONS.filter((r) => r.id === 'i6') })} /> };
