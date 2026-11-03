import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { choose, fails, never, ok, pick, play, press, pressFirst, tab, tick, type } from '../_kit/story-play';
import { CatalogScreen, RequestTracker, type CatalogScreenProps } from './catalog';
import { CatalogAdmin, type CatalogAdminProps } from './catalog-admin';
import { ArticleBody, type KbArticleView } from './help-kb';
import { AgentChatScreen, RequesterChatScreen, type AgentChatProps, type RequesterChatProps } from './chat';
import { ChatQueuesAdmin, DeskOrgAdmin, LifecycleAdmin, MyDocumentsCard, SchedulesAdmin, TicketEsmRail, type DeskOrgAdminProps, type TicketEsmRailProps } from './esm2';
import { MessagingAdmin, TeamScreen, type TeamScreenProps } from './esm3';
import { RequestPanel } from './request-panel';
import { RulesAdmin, type RulesAdminProps } from './rules-admin';
import { TicketKbCard, type TicketKbCardProps } from './ticket-kb';
import { EscalateDialog } from './work';
import { DETAIL, TICKET } from './data';
import {
  ADMIN_CHAT_QUEUES,
  AVAILABILITY,
  BRANCHES,
  CATALOGUE,
  CATALOG_ITEMS,
  CATALOG_SCHEMA,
  CHAT,
  CHAT_ENDED,
  CHAT_QUEUED,
  CHAT_QUEUES,
  DOCS_VIEW,
  DOCUMENTS,
  DOC_TEMPLATES,
  FORECAST,
  HR_SUMMARY,
  INTERACTIONS,
  JOINER_GUIDE,
  JOURNEYS,
  KB_LINKS,
  LAPTOP_PAGE,
  LIFECYCLE,
  MSG_SETUP,
  MY_REQUEST,
  PICKS,
  RECURRING,
  RULES,
  RULE_RUNS,
  RULE_SCHEMA,
  SEQUENCES,
  SEQUENCE_RUNS,
  SHARES,
  SHIFTS,
  TEAM,
  TICKET_REQUEST,
  WEBHOOKS,
  WIDGETS,
} from './esm-data';

// The live Helpdesk pieces (catalogue, chat, the help centre's cards, the ticket's side cards and dialogs, the desk
// set-up admin cards and the team page): the same components the pages render, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Service desk/Live · Catalogue, chat, team and set-up', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;
const picks = async () => PICKS;
const GROUPS = [{ id: 'g-it', name: 'IT field support' }, { id: 'g-net', name: 'Network team' }];

// ------------------------------------------------------------------ Service catalogue (SD-2.03 / SD-2.04)
const catalog = (over: Partial<CatalogScreenProps> = {}) => (
  <CatalogScreen state="ready" catalogue={CATALOGUE} onOpenItem={async () => LAPTOP_PAGE} onOpenGuide={async () => JOINER_GUIDE} onResolveGuide={async () => [{ id: 'i1', name: 'New laptop', shortText: null, cost: 85000 }]} onCheckout={async () => ({ requests: [{ ticketId: 't-1020', number: 'IT-1020' }] })} onPick={picks} onOpenRequest={() => undefined} {...over} />
);
export const Catalog: S = { name: 'Catalogue · items and a guide', render: () => catalog() };
export const CatalogItem: S = { name: 'Catalogue · an item open', render: () => catalog(), play: play(press('Open New laptop')) };
export const CatalogItemMissing: S = { name: 'Catalogue · Add to cart pressed with a required answer missing', render: () => catalog(), play: play(press('Open New laptop'), press('Add to cart')) };
export const CatalogItemFailed: S = { name: 'Catalogue · the item could not be opened', render: () => catalog({ onOpenItem: fails('This item was retired a moment ago.') }), play: play(press('Open New laptop')) };
const toCart = [press('Open New laptop'), pick(/^Model/, /Standard/), press('Add to cart')];
export const CatalogSent: S = { name: 'Catalogue · request sent (toast with Follow)', render: () => catalog(), play: play(...toCart, press('Send request')) };
export const CatalogForOtherMissing: S = { name: 'Catalogue · Send request for someone else with nobody chosen', render: () => catalog(), play: play(...toCart, choose('For someone else'), press('Send request')) };
export const CatalogEmpty: S = { name: 'Catalogue · nothing to order', render: () => catalog({ catalogue: { items: [], guides: [] } }) };
export const CatalogLoading: S = { name: 'Catalogue · loading', render: () => catalog({ state: 'loading' }) };
export const CatalogError: S = { name: 'Catalogue · could not load', render: () => catalog({ state: 'error', onRetry: () => undefined }) };

// ------------------------------------------------------------------ My request (help centre) and the ticket's request panel
export const Tracker: S = { name: 'My request · tracker with the approval route', render: () => <RequestTracker request={MY_REQUEST} onCancel={ok} timeZone="Asia/Kolkata" /> };
export const TrackerCancel: S = { name: 'My request · cancel, asks why', render: () => <RequestTracker request={MY_REQUEST} onCancel={ok} timeZone="Asia/Kolkata" />, play: play(pressFirst('Cancel this')) };
export const TrackerCancelFailed: S = { name: 'My request · cancel refused', render: () => <RequestTracker request={MY_REQUEST} onCancel={fails('The laptop is already being imaged; ask IT to stop it.')} timeZone="Asia/Kolkata" />, play: play(pressFirst('Cancel this'), type(/Why/, 'Got a laptop from the spare pool'), press(/^Cancel/)) };
export const TrackerReadOnly: S = { name: 'My request · cannot cancel any more', render: () => <RequestTracker request={{ ...MY_REQUEST, items: MY_REQUEST.items.map((i) => ({ ...i, canCancel: false, stage: 'fulfilment' as const })) }} timeZone="Asia/Kolkata" /> };
export const Panel: S = { name: 'Ticket · request panel (agent can ask for approval)', render: () => <RequestPanel view={TICKET_REQUEST} canAsk onAsk={ok} onFindPeople={picks} /> };
export const PanelAsk: S = { name: 'Ticket · ask for approval, open', render: () => <RequestPanel view={TICKET_REQUEST} canAsk onAsk={ok} onFindPeople={picks} />, play: play(press(/^Ask for approval/)) };
export const PanelReadOnly: S = { name: 'Ticket · request panel, read only', render: () => <RequestPanel view={TICKET_REQUEST} canAsk={false} onAsk={ok} onFindPeople={picks} /> };

const docs = (over: Partial<Parameters<typeof MyDocumentsCard>[0]> = {}) => <MyDocumentsCard documents={DOCUMENTS} onSendCode={async () => ({ to: 'ar****@kaverifoods.test', minutes: 5 })} onSign={ok} onDecline={ok} {...over} />;
export const Documents: S = { name: 'My request · documents to sign', render: () => docs() };
export const DocumentsSign: S = { name: 'My request · read and sign, open', render: () => docs(), play: play(press('Read and sign')) };
export const DocumentsSignMissing: S = { name: 'My request · Send me a code pressed with nothing filled', render: () => docs(), play: play(press('Read and sign'), press('Send me a code')) };
export const DocumentsCodeFailed: S = { name: 'My request · the code could not be sent', render: () => docs({ onSendCode: fails('Your work email bounced; ask HR to check it.') }), play: play(press('Read and sign'), type(/Type your full name/, 'Arjun Kulkarni'), tick(/I have read this document/), press('Send me a code')) };
export const DocumentsNone: S = { name: 'My request · no documents', render: () => docs({ documents: [] }) };

// ------------------------------------------------------------------ Chat (requester and agent)
const LIVE = { connected: true, typing: false };
const requester = (over: Partial<RequesterChatProps> = {}) => (
  <RequesterChatScreen state="ready" queues={CHAT_QUEUES} chats={[CHAT, CHAT_ENDED]} current={CHAT} live={LIVE} onStart={ok} onOpen={() => undefined} onSend={ok} onUpload={ok} onOpenFile={() => undefined} onTyping={() => undefined} onEnd={ok} onRate={ok} onOpenTicket={() => undefined} onPick={picks} {...over} />
);
export const RequesterChat: S = { name: 'Chat · requester, talking to IT', render: () => requester() };
export const RequesterChatTyping: S = { name: 'Chat · requester, the agent is typing', render: () => requester({ live: { connected: true, typing: true } }) };
export const RequesterChatOffline: S = { name: 'Chat · requester, connection lost', render: () => requester({ live: { connected: false, typing: false } }) };
export const RequesterChatNew: S = { name: 'Chat · requester, start a new chat', render: () => requester({ current: null }) };
export const RequesterChatNewMissing: S = { name: 'Chat · requester, start pressed with no subject', render: () => requester({ current: null }), play: play(press(/^Start (the )?chat/)) };
export const RequesterChatSendMissing: S = { name: 'Chat · requester, Send pressed with nothing written', render: () => requester(), play: play(press('Send')) };
export const RequesterChatRateMissing: S = { name: 'Chat · requester, Rate pressed with no stars', render: () => requester({ current: { ...CHAT_ENDED, rating: null } }), play: play(press('Rate this chat')) };
export const RequesterChatEnded: S = { name: 'Chat · requester, ended (rate it)', render: () => requester({ current: { ...CHAT_ENDED, rating: null } }) };
export const RequesterChatSendFailed: S = { name: 'Chat · requester, a message not sent', render: () => requester({ onSend: fails('The chat ended on the agent’s side.') }), play: play(type(/^Message/, 'Still dropping on home Wi-Fi'), press('Send')) };
export const RequesterChatEmpty: S = { name: 'Chat · requester, no chats yet', render: () => requester({ chats: [], current: null }) };
export const RequesterChatLoading: S = { name: 'Chat · requester, loading', render: () => requester({ state: 'loading' }) };
export const RequesterChatError: S = { name: 'Chat · requester, could not load', render: () => requester({ state: 'error', onRetry: () => undefined }) };

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
export const AgentChat: S = { name: 'Live chat · agent, in a chat', render: () => agent() };
export const AgentChatWaiting: S = { name: 'Live chat · agent, a chat waiting to be taken', render: () => agent({ current: CHAT_QUEUED }) };
export const AgentChatTakeFailed: S = { name: 'Live chat · agent, Take refused', render: () => agent({ current: CHAT_QUEUED, onAccept: fails('Suresh Pillai took this chat a moment ago.') }), play: play(press('Take this chat')) };
export const AgentChatHandMissing: S = { name: 'Live chat · agent, Hand over pressed with nobody chosen', render: () => agent(), play: play(press('Hand over')) };
export const AgentCallMissing: S = { name: 'Calls · Save pressed with no subject', render: () => agent(), play: play(choose('Calls and walk-ups'), press('Save')) };
export const AgentChatEmpty: S = { name: 'Live chat · agent, no chats', render: () => agent({ sessions: [], current: null, interactions: [], firstContactResolution: null }) };
export const AgentChatLoading: S = { name: 'Live chat · agent, loading', render: () => agent({ state: 'loading' }) };
export const AgentChatError: S = { name: 'Live chat · agent, could not load', render: () => agent({ state: 'error', onRetry: () => undefined }) };
export const AgentChatNoAccess: S = { name: 'Live chat · no access', render: () => agent({ state: 'no-access' }) };

// ------------------------------------------------------------------ Ticket side cards and dialogs
const rail = (over: Partial<TicketEsmRailProps> = {}) => (
  <TicketEsmRail
    canWork
    canMove
    hr={HR_SUMMARY}
    desks={[{ id: 'd-it', name: 'IT help desk' }, { id: 'd-hr', name: 'HR help desk' }]}
    currentDeskId="d-it"
    shares={SHARES}
    categories={() => [{ id: 'cat-pay', name: 'Payslips', sensitive: true }, { id: 'cat-let', name: 'Letters', sensitive: false }]}
    sensitive={false}
    onMove={ok}
    onShare={ok}
    onUnshare={ok}
    documents={DOCS_VIEW}
    onMakeDocument={ok}
    onWithdrawDocument={ok}
    sequences={SEQUENCES}
    runs={SEQUENCE_RUNS}
    onStartSequence={ok}
    onStopSequence={ok}
    {...over}
  />
);
export const Rail: S = { name: 'Ticket · HR summary, sharing, documents, follow-ups', render: () => rail() };
export const RailReadOnly: S = { name: 'Ticket · side cards, someone who cannot work it', render: () => rail({ canWork: false, canMove: false }) };
export const RailMoveMissing: S = { name: 'Ticket · Move pressed with no reason', render: () => rail(), play: play(choose('Move'), press('Move ticket')) };
export const RailSensitive: S = { name: 'Ticket · sensitive ticket (no HR details shown)', render: () => rail({ sensitive: true, hr: null }) };
const kb = (over: Partial<TicketKbCardProps> = {}) => <TicketKbCard links={KB_LINKS} solved={false} canWork spaces={[{ id: 's1', name: 'IT help' }]} onSolvedBy={ok} onFlag={ok} onMakeArticle={async () => ({ id: 'a9' })} onOpenArticle={() => undefined} {...over} />;
export const Kb: S = { name: 'Ticket · articles linked', render: () => kb() };
export const KbFlag: S = { name: 'Ticket · flag an article out of date', render: () => kb(), play: play(pressFirst('Out of date')) };
export const KbSolved: S = { name: 'Ticket · solved by an article', render: () => kb({ solved: true }) };
export const KbNone: S = { name: 'Ticket · no articles yet (make one)', render: () => kb({ links: [] }) };
export const KbMakeFailed: S = { name: 'Ticket · make an article refused', render: () => kb({ solved: true, onMakeArticle: fails('You cannot write in the IT help space.') }), play: play(pick(/^Make an article/, 'IT help'), press('Make draft article')) };
function Escalate({ onEscalate = ok as never }: { onEscalate?: (i: { tier: string; groupId?: string; reason: string }) => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return <EscalateDialog open={open} onOpenChange={setOpen} ticket={TICKET} detail={DETAIL} onEscalate={onEscalate} />;
}
export const EscalateOpen: S = { name: 'Escalate · open', render: () => <Escalate /> };
export const EscalateFilled: S = { name: 'Escalate · reason given', render: () => <Escalate />, play: play(type(/^Reason/, 'Needs the network team: the core switch at Hosur')) };
export const EscalateMissing: S = { name: 'Escalate · pressed with no reason', render: () => <Escalate />, play: play(press(/^Move to/)) };
export const EscalateFailed: S = { name: 'Escalate · the server refuses', render: () => <Escalate onEscalate={fails('L3 has no group on this desk yet.')} />, play: play(type(/^Reason/, 'Needs the network team'), press(/^Move to/)) };

// ------------------------------------------------------------------ Desk set-up admin cards
export const Lifecycle: S = { name: 'Set-up · ticket lifecycle designer', render: () => <LifecycleAdmin setup={LIFECYCLE} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} /> };
export const LifecycleProblem: S = { name: 'Set-up · lifecycle check finds a problem', render: () => <LifecycleAdmin setup={LIFECYCLE} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: false, problem: 'Solved cannot be reached from New.' })} onPublish={ok} onRetire={ok} />, play: play(press('Check')) };
export const LifecycleReady: S = { name: 'Set-up · lifecycle check passes (toast)', render: () => <LifecycleAdmin setup={LIFECYCLE} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} />, play: play(press(/^Check/)) };
export const LifecycleEmpty: S = { name: 'Set-up · no lifecycle yet', render: () => <LifecycleAdmin setup={{ ...LIFECYCLE, lifecycles: [] }} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} /> };
export const LifecycleLoading: S = { name: 'Set-up · lifecycle loading', render: () => <LifecycleAdmin setup={undefined} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} /> };
const schedules = (over: Partial<Parameters<typeof SchedulesAdmin>[0]> = {}) => <SchedulesAdmin timeZone="Asia/Kolkata" groups={GROUPS} recurring={RECURRING} sequences={SEQUENCES} onCreate={ok} onState={ok} onSaveSequence={ok} {...over} />;
export const Schedules: S = { name: 'Set-up · recurring tickets and follow-ups', render: () => schedules() };
export const SchedulesEmpty: S = { name: 'Set-up · no schedules yet', render: () => schedules({ recurring: [], sequences: [] }) };
export const SchedulesMissing: S = { name: 'Set-up · recurring ticket Save pressed with nothing filled', render: () => schedules(), play: play(pressFirst(/^Save$/)) };
export const SequenceMissing: S = { name: 'Set-up · Save sequence pressed with nothing filled', render: () => schedules(), play: play(press('Save sequence')) };
export const SchedulesStateFailed: S = { name: 'Set-up · pausing a schedule refused', render: () => schedules({ onState: fails('Someone changed this a moment ago.') }), play: play(pressFirst('Pause')) };
export const ChatQueues: S = { name: 'Set-up · chat queues and prompts', render: () => <ChatQueuesAdmin queues={ADMIN_CHAT_QUEUES} groups={GROUPS} onSave={ok} /> };
export const ChatQueuesEdit: S = { name: 'Set-up · edit a chat queue', render: () => <ChatQueuesAdmin queues={ADMIN_CHAT_QUEUES} groups={GROUPS} onSave={ok} />, play: play(pressFirst('Edit')) };
export const ChatQueuesNewMissing: S = { name: 'Set-up · new chat queue saved with no name', render: () => <ChatQueuesAdmin queues={[]} groups={GROUPS} onSave={ok} />, play: play(press(/^New (chat )?queue/), press(/^Save/)) };
export const ChatQueuesEmpty: S = { name: 'Set-up · no chat queues yet', render: () => <ChatQueuesAdmin queues={[]} groups={GROUPS} onSave={ok} /> };
const messaging = (over: Partial<Parameters<typeof MessagingAdmin>[0]> = {}) => <MessagingAdmin deskId="d-it" setup={MSG_SETUP} onAdd={async () => ({ webhookUrl: 'https://api.kaverifoods.test/msg/ln2', secret: 'whsec_9f2c41d7' })} onSave={ok} onRotate={async () => ({ webhookUrl: 'https://api.kaverifoods.test/msg/ln1', secret: 'whsec_1a2b3c4d' })} widgets={{ list: WIDGETS, portals: [{ id: 'pt1', name: 'Kaveri careers' }], onAdd: async () => ({ ...WIDGETS[0]!, secret: 'wgt_7e8f' }), onSave: ok, onRotate: async () => ({ secret: 'wgt_8a9b' }) }} {...over} />;
export const Messaging: S = { name: 'Set-up · WhatsApp, SMS and web chat widget', render: () => messaging() };
export const MessagingEmpty: S = { name: 'Set-up · no messaging lines yet', render: () => messaging({ setup: { channels: [], accounts: [], devTransport: false }, widgets: null }) };
export const MessagingAddMissing: S = { name: 'Set-up · Add the line pressed with nothing filled', render: () => messaging(), play: play(choose('SMS'), press('Add the line')) };
export const MessagingWidgetMissing: S = { name: 'Set-up · Add the widget pressed with no name', render: () => messaging(), play: play(press('Add the widget')) };
export const MessagingLoading: S
 = { name: 'Set-up · messaging loading', render: () => messaging({ setup: undefined }) };
const org = (over: Partial<DeskOrgAdminProps> = {}) => (
  <DeskOrgAdmin deskId="d-hr" deskKind="hr" desks={[{ id: 'd-it', name: 'IT help desk' }, { id: 'd-hr', name: 'HR help desk' }]} forwardTo={['d-it']} canCreateDesks branches={BRANCHES} locations={[{ id: 'loc-blr', name: 'Bengaluru head office' }, { id: 'loc-hosur', name: 'Hosur plant' }]} groups={GROUPS} templates={DOC_TEMPLATES} docFields={[{ key: 'employee.name', label: 'Employee name' }, { key: 'asset.name', label: 'Asset' }]} onForwardTo={ok} onClone={ok} onStarterPack={async () => ({ items: 6, sla: true })} onAddBranch={ok} onSaveTemplate={ok} journeys={{ setup: JOURNEYS, onSave: ok }} {...over} />
);
export const Org: S = { name: 'Set-up · desks, branches, document templates, journeys', render: () => org() };
export const OrgStarter: S = { name: 'Set-up · starter pack asks about a restricted HR desk', render: () => org(), play: play(press('Add the starter pack')) };
export const OrgStarterDone: S = { name: 'Set-up · starter pack added (toast)', render: () => org({ onStarterPack: async () => ({ items: 3, sla: true }) }), play: play(press('Add the starter pack')) };
export const OrgSiteMissing: S = { name: 'Set-up · Add site pressed with no location', render: () => org(), play: play(press('Add site')) };
export const OrgTemplateMissing: S = { name: 'Set-up · Save template pressed with nothing filled', render: () => org(), play: play(press('Save template')) };
export const OrgJourneyMissing: S = { name: 'Set-up · Save journey pressed with nothing filled', render: () => org(), play: play(press('Save journey')) };
export const OrgCloneMissing: S = { name: 'Set-up · Copy desk pressed with nothing filled', render: () => org(), play: play(press('Copy desk')) };
export const OrgNoCreate: S = { name: 'Set-up · someone who cannot make desks', render: () => org({ canCreateDesks: false, journeys: null }) };
const catalogAdmin = (over: Partial<CatalogAdminProps> = {}) => (
  <CatalogAdmin items={CATALOG_ITEMS} schema={CATALOG_SCHEMA} onLoad={async (id) => CATALOG_ITEMS.find((i) => i.id === id)!} onCreate={async () => CATALOG_ITEMS[1]!} onSave={async () => CATALOG_ITEMS[0]!} onPublish={ok} onRetire={ok} onFindPeople={picks} onPick={picks} highValueAbove={50000} onHighValue={ok} {...over} />
);
export const CatalogSetup: S = { name: 'Set-up · catalogue items', render: () => catalogAdmin() };
export const CatalogSetupEdit: S = { name: 'Set-up · catalogue item editor', render: () => catalogAdmin(), play: play(pressFirst('Edit')) };
export const CatalogSetupAddMissing: S = { name: 'Set-up · Add item pressed with no name', render: () => catalogAdmin(), play: play(press('Add item')) };
export const CatalogSetupLimitStep: S = { name: 'Set-up · moving the first section up says it is already first', render: () => catalogAdmin(), play: play(pressFirst('Edit'), tab('Form'), pressFirst(/^Move section 1 up/)) };
export const CatalogSetupEmpty: S = { name: 'Set-up · no catalogue items yet', render: () => catalogAdmin({ items: [] }) };
export const CatalogSetupSaveFailed: S = { name: 'Set-up · saving an item refused', render: () => catalogAdmin({ onSave: fails('Someone published a newer version a moment ago.') }), play: play(pressFirst('Edit'), press('Save draft')) };
const rules = (over: Partial<RulesAdminProps> = {}) => <RulesAdmin rules={RULES} schema={RULE_SCHEMA} webhooks={WEBHOOKS} timeZone="Asia/Kolkata" onSave={ok} onStatus={ok} onRuns={async () => RULE_RUNS} onDryRun={async () => ({ checked: 40, matched: 6, records: [] })} onInstall={ok} onAddWebhook={async () => ({ secret: 'whsec_44aa' })} onWebhookActive={ok} {...over} />;
export const Rules: S = { name: 'Set-up · rules', render: () => rules() };
export const RulesEdit: S = { name: 'Set-up · rule editor', render: () => rules(), play: play(pressFirst('Edit')) };
export const RulesRuns: S = { name: 'Set-up · what a rule did', render: () => rules(), play: play(pressFirst('What it did')) };
export const RulesEmpty: S = { name: 'Set-up · no rules yet (recipes)', render: () => rules({ rules: [] }) };
export const RulesSaveFailed: S = { name: 'Set-up · saving a rule refused', render: () => rules({ onSave: fails('A rule with this name already exists.') }), play: play(pressFirst('Edit'), press('Save')) };
export const RulesTooEarly: S = { name: 'Set-up · new rule saved with no name', render: () => rules(), play: play(press('New rule'), press('Save')) };
export const WebhookTooEarly: S = { name: 'Set-up · Add webhook pressed with nothing filled', render: () => rules(), play: play(press('Add webhook')) };
export const WebhookAdded: S = { name: 'Set-up · webhook added, secret to copy', render: () => rules(), play: play(type('Webhook name', 'Plant board'), type('Webhook address', 'https://board.kaverifoods.test/h'), press('Add webhook')) };

// ------------------------------------------------------------------ Desk team (lead, agent)
const team = (over: Partial<TeamScreenProps> = {}) => (
  <TeamScreen state="ready" desks={[{ id: 'd-it', name: 'IT help desk' }]} deskId="d-it" onDesk={() => undefined} canLead canReport me={{ presence: 'available' }} onPresence={ok} team={TEAM} onRouting={ok} shifts={SHIFTS} range={{ from: '2026-10-26', to: '2026-11-01' }} onAddShift={ok} onRemoveShift={ok} onImportShifts={async () => ({ added: 4 })} forecast={FORECAST} availability={AVAILABILITY} mailbox={{ current: null, devAllowed: false, onLink: ok, onUnlink: ok }} {...over} />
);
export const Team: S = { name: 'Desk team · lead (capacity, shifts, forecast)', render: () => team() };
export const TeamAgent: S = { name: 'Desk team · agent (my presence only)', render: () => team({ canLead: false, canReport: false, forecast: null, availability: null }) };
export const TeamRouting: S = { name: 'Desk team · change capacity and languages', render: () => team(), play: play(pressFirst('Change capacity and languages')) };
export const TeamShiftMissing: S = { name: 'Desk team · Add the shift pressed with nothing filled', render: () => team(), play: play(press('Add the shift')) };
export const TeamImportMissing: S = { name: 'Desk team · Import shifts pressed with nothing pasted', render: () => team(), play: play(press('Import shifts')) };
export const TeamImported: S = { name: 'Desk team · shifts imported (toast)', render: () => team({ onImportShifts: async () => ({ added: 4 }) }), play: play(type(/^Or paste shifts/, 'suresh@kaverifoods.in, 2026-10-27 09:00, 2026-10-27 17:00, Day'), press('Import shifts')) };
export const TeamPresenceFailed: S = { name: 'Desk team · presence change refused', render: () => team({ onPresence: fails('You are signed out on another device.') }), play: play(async (s) => (await s.findByRole('radio', { name: 'Busy' })).click()) };
export const TeamEmpty: S = { name: 'Desk team · no one on the desk', render: () => team({ team: [], shifts: [] }) };
export const TeamLoading: S = { name: 'Desk team · loading', render: () => team({ state: 'loading' }) };
export const TeamError: S = { name: 'Desk team · could not load', render: () => team({ state: 'error', onRetry: () => undefined }) };
export const TeamWorking: S = { name: 'Desk team · saving presence', render: () => team({ onPresence: never }), play: play(async (s) => (await s.findByRole('radio', { name: 'Busy' })).click()) };

// ------------------------------------------------------------------ Help article (requester): feedback once, solved is a toast
const WIFI: KbArticleView = { id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', summary: 'Join KaveriStaff with your work sign-in.', bodyHtml: '<p>Choose <strong>KaveriStaff</strong>, then sign in with your work email.</p>', language: 'en', languages: ['en', 'hi'], fallback: false, updatedAt: '2026-10-08T10:00:00Z' };
const article = () => <ArticleBody article={WIFI} onFeedback={ok} onSolved={ok} onStillNeedHelp={() => undefined} onLanguage={() => undefined} timeZone="Asia/Kolkata" />;
export const ArticleRead: S = { name: 'Help article · was this helpful?', render: article };
export const ArticleVoteAgain: S = { name: 'Help article · a second vote (toast)', render: article, play: play(press('Yes'), press('No')) };
export const ArticleSolved: S = { name: 'Help article · This solved it (toast)', render: article, play: play(press('This solved it')) };
