import type { Meta, StoryObj } from '@storybook/react-vite';
import { choose, fails, ok, play, press, type } from '../_kit/story-play';
import { AgentChatScreen, RequesterChatScreen, type AgentChatProps, type RequesterChatProps } from '../desk/chat';
import { CHAT, CHAT_ENDED, CHAT_QUEUED, CHAT_QUEUES, INTERACTIONS, PICKS } from '../desk/esm-data';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-16 · Chat with a desk (the founder, 12 Nov 2026: draw the live stand-ins, then they are the live page).
// Live chat: the requester's chat with a desk (/yx/desk/chat) and the agent's chat and calls page (/yx/desk/live-chat):
// taking a waiting chat, handing over, typing and connection state, rating, and logging calls and walk-ups.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-16 · Chat with a desk', component: RequesterChatScreen, subcomponents: { AgentChatScreen }, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Live chat"><Story /></OpsDesk>] };
export default meta;
type S = StoryObj;
const picks = async () => PICKS;
const GROUPS = [{ id: 'g-it', name: 'IT field support' }, { id: 'g-net', name: 'Network team' }];

// ------------------------------------------------------------------ Chat (requester and agent)
const LIVE = { connected: true, typing: false };
const requester = (over: Partial<RequesterChatProps> = {}) => (
  <RequesterChatScreen state="ready" queues={CHAT_QUEUES} chats={[CHAT, CHAT_ENDED]} current={CHAT} live={LIVE} onStart={ok} onOpen={() => undefined} onSend={ok} onUpload={ok} onOpenFile={() => undefined} onTyping={() => undefined} onEnd={ok} onRate={ok} onOpenTicket={() => undefined} onPick={picks} {...over} />
);
export const RequesterChat: S = { name: 'Requester, talking to IT', render: () => requester() };
export const RequesterChatTyping: S = { name: 'Requester, the agent is typing', render: () => requester({ live: { connected: true, typing: true } }) };
export const RequesterChatOffline: S = { name: 'Requester, connection lost', render: () => requester({ live: { connected: false, typing: false } }) };
export const RequesterChatNew: S = { name: 'Requester, start a new chat', render: () => requester({ current: null }) };
export const RequesterChatNewMissing: S = { name: 'Requester, start pressed with no subject', render: () => requester({ current: null }), play: play(press(/^Start (the )?chat/)) };
export const RequesterChatSendMissing: S = { name: 'Requester, Send pressed with nothing written', render: () => requester(), play: play(press('Send')) };
export const RequesterChatRateMissing: S = { name: 'Requester, Rate pressed with no stars', render: () => requester({ current: { ...CHAT_ENDED, rating: null } }), play: play(press('Rate this chat')) };
export const RequesterChatEnded: S = { name: 'Requester, ended (rate it)', render: () => requester({ current: { ...CHAT_ENDED, rating: null } }) };
export const RequesterChatSendFailed: S = { name: 'Requester, a message not sent', render: () => requester({ onSend: fails('The chat ended on the agent’s side.') }), play: play(type(/^Message/, 'Still dropping on home Wi-Fi'), press('Send')) };
export const RequesterChatEmpty: S = { name: 'Requester, no chats yet', render: () => requester({ chats: [], current: null }) };
export const RequesterChatLoading: S = { name: 'Requester, loading', render: () => requester({ state: 'loading' }) };
export const RequesterChatError: S = { name: 'Requester, could not load', render: () => requester({ state: 'error', onRetry: () => undefined }) };

const agent = (over: Partial<AgentChatProps> = {}) => (
  <AgentChatScreen
    state="ready"
    desks={[{ id: 'd-it', name: 'IT help desk' }]}
    deskId="d-it"
    onDesk={() => undefined}
    meId="u-farah"
    sessions={[CHAT, CHAT_QUEUED]}
    current={CHAT}
    live={LIVE}
    queues={[{ id: 'q-it', name: 'IT chat' }]}
    agents={[{ id: 'u-suresh', name: 'Suresh Pillai' }]}
    onOpen={() => undefined}
    onAccept={ok}
    onSend={ok}
    onUpload={ok}
    onOpenFile={() => undefined}
    onTyping={() => undefined}
    onTransfer={ok}
    onEnd={ok}
    onOpenTicket={() => undefined}
    interactions={INTERACTIONS}
    firstContactResolution={0.72}
    onLog={ok}
    onPromote={ok}
    onCloseInteraction={ok}
    {...over}
  />
);
export const AgentChat: S = { name: 'Agent, in a chat', render: () => agent() };
export const AgentChatWaiting: S = { name: 'Agent, a chat waiting to be taken', render: () => agent({ current: CHAT_QUEUED }) };
export const AgentChatTakeFailed: S = { name: 'Agent, Take refused', render: () => agent({ current: CHAT_QUEUED, onAccept: fails('Suresh Pillai took this chat a moment ago.') }), play: play(press('Take this chat')) };
export const AgentChatHandMissing: S = { name: 'Agent, Hand over pressed with nobody chosen', render: () => agent(), play: play(press('Hand over')) };
export const AgentCallMissing: S = { name: 'Agent, calls · Save pressed with no subject', render: () => agent(), play: play(choose('Calls and walk-ups'), press('Save')) };
export const AgentChatEmpty: S = { name: 'Agent, no chats', render: () => agent({ sessions: [], current: null, interactions: [], firstContactResolution: null }) };
export const AgentChatLoading: S = { name: 'Agent, loading', render: () => agent({ state: 'loading' }) };
export const AgentChatError: S = { name: 'Agent, could not load', render: () => agent({ state: 'error', onRetry: () => undefined }) };
export const AgentChatNoAccess: S = { name: 'No access', render: () => agent({ state: 'no-access' }) };
