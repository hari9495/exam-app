import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, press, type } from '../_kit/story-play';
import { ActionLinkScreen, ChannelLinksCard } from './esm2';
import type { ActionLinkView, ChannelLinkView } from './esm2-types';

// The page behind an approval card in Teams, Slack or a phone push (SD-2.06) and "Approve from chat apps" (under the
// Approvals list). No earlier design had them; these stories are their design, with Kaveri Foods data (3 Nov 2026).
const meta: Meta = { title: 'Screens/Helpdesk/Approval links', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Approve from chat apps (on the Approvals page)
const LINKS: ChannelLinkView = { typedLinksAllowed: true, links: [{ id: 'cl1', provider: 'teams', label: 'divya@kaverifoods.in', createdAt: '2026-10-20T05:00:00Z' }] };
const SENT = [{ provider: 'teams', at: '2026-11-03T04:12:00Z', title: 'Casual leave, 6–7 Nov (2 days)', url: '/yx/act/demo-token' }];
const card = (links: ChannelLinkView, onAdd: () => Promise<unknown> = ok) => (
  <div className="yx-auth__page">
    <ChannelLinksCard links={links} sent={SENT} onAdd={onAdd} onRemove={ok} />
  </div>
);
export const ChatApps: S = { name: 'Chat apps · Teams linked, a card sent (demo)', render: () => card(LINKS) };
export const ChatAppsNone: S = { name: 'Chat apps · none linked (production)', render: () => card({ typedLinksAllowed: false, links: [] }) };
export const ChatAppsMissing: S = { name: 'Chat apps · Link pressed with no account', render: () => card(LINKS), play: play(press('Link')) };
export const ChatAppsFailed: S = { name: 'Chat apps · linking refused', render: () => card(LINKS, fails('This Slack account is already linked to someone else.')), play: play(type(/^Your account in that app/, 'U04KAVERI22'), press('Link')) };

// ------------------------------------------------------------------ The page behind an approval card (/yx/act/[token])
const VIEW: ActionLinkView = { state: 'open', title: 'Casual leave, 6–7 Nov (2 days)', summary: [{ label: 'Who', value: 'Kavya Reddy' }, { label: 'From', value: '6 Nov 2026' }, { label: 'To', value: '7 Nov 2026' }], expiresAt: '2026-11-05T12:30:00Z' };
export const LinkOpen: S = { name: 'Approval link · open', render: () => <ActionLinkScreen view={VIEW} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkRejectMissing: S = { name: 'Approval link · not approving, sent with no reason', render: () => <ActionLinkScreen view={VIEW} error={null} done={null} onDecide={ok} onSignIn={() => undefined} />, play: play(press('Not approve'), press('Send: not approved')) };
export const LinkFailed: S = { name: 'Approval link · the server refuses', render: () => <ActionLinkScreen view={VIEW} error={null} done={null} onDecide={fails('This link was already used. Open your approvals in YukthiX.')} onSignIn={() => undefined} />, play: play(press('Approve')) };
export const LinkDone: S = { name: 'Approval link · done', render: () => <ActionLinkScreen view={VIEW} error={null} done="You approved it. You can close this page." onDecide={ok} onSignIn={() => undefined} /> };
export const LinkSignIn: S = { name: 'Approval link · sensitive, sign in to decide', render: () => <ActionLinkScreen view={{ ...VIEW, state: 'sign_in', title: 'An approval is waiting for you', summary: [] }} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkClosed: S = { name: 'Approval link · already closed', render: () => <ActionLinkScreen view={{ ...VIEW, state: 'closed' }} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkInvalid: S = { name: 'Approval link · not valid', render: () => <ActionLinkScreen view={null} error="This link is not valid. Open your approvals in YukthiX." done={null} onDecide={ok} onSignIn={() => undefined} /> };
export const LinkLoading: S = { name: 'Approval link · loading', render: () => <ActionLinkScreen view={null} error={null} done={null} onDecide={ok} onSignIn={() => undefined} /> };
