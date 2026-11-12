import type { Meta, StoryObj } from '@storybook/react-vite';
import { choose, fails, ok, play, press, pressFirst, tab, type } from '../_kit/story-play';
import { CatalogAdmin, type CatalogAdminProps } from '../desk/catalog-admin';
import { ChatQueuesAdmin, DeskOrgAdmin, LifecycleAdmin, SchedulesAdmin, type DeskOrgAdminProps } from '../desk/esm2';
import { MessagingAdmin } from '../desk/esm3';
import { RulesAdmin, type RulesAdminProps } from '../desk/rules-admin';
import { ADMIN_CHAT_QUEUES, BRANCHES, CATALOG_ITEMS, CATALOG_SCHEMA, DOC_TEMPLATES, JOURNEYS, LIFECYCLE, MSG_SETUP, PICKS, RECURRING, RULES, RULE_RUNS, RULE_SCHEMA, SEQUENCES, WEBHOOKS, WIDGETS } from '../desk/esm-data';
import { PageHeader } from '../../components/shell';
import { OpsDesk } from './ops-kit';

// Helpdesk HLP-18 · Desk set-up tabs (the founder, 12 Nov 2026: draw the live stand-ins, then they are the live page).
// The rest of Desk set-up (/yx/desk/setup), one tab each: catalogue items and their forms, rules and webhooks, the ticket
// lifecycle, chat queues, desks and branches with document templates and journeys, recurring tickets and follow-ups,
// and WhatsApp, SMS and the web chat widget.
const meta: Meta = { title: 'Screens/Helpdesk/HLP-18 · Desk set-up tabs', component: CatalogAdmin, subcomponents: { RulesAdmin, LifecycleAdmin, ChatQueuesAdmin, DeskOrgAdmin, SchedulesAdmin, MessagingAdmin }, parameters: { layout: 'fullscreen' }, decorators: [(Story) => <OpsDesk area="helpdesk" active="Desk set-up"><div className="yx-auth__page"><PageHeader title="Desk set-up" /><Story /></div></OpsDesk>] };
export default meta;
type S = StoryObj;
const picks = async () => PICKS;
const GROUPS = [{ id: 'g-it', name: 'IT field support' }, { id: 'g-net', name: 'Network team' }];

// ------------------------------------------------------------------ Desk set-up admin cards
export const Lifecycle: S = { name: 'Ticket lifecycle designer', render: () => <LifecycleAdmin setup={LIFECYCLE} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} /> };
export const LifecycleProblem: S = { name: 'Lifecycle check finds a problem', render: () => <LifecycleAdmin setup={LIFECYCLE} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: false, problem: 'Solved cannot be reached from New.' })} onPublish={ok} onRetire={ok} />, play: play(press('Check')) };
export const LifecycleReady: S = { name: 'Lifecycle check passes (toast)', render: () => <LifecycleAdmin setup={LIFECYCLE} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} />, play: play(press(/^Check/)) };
export const LifecycleEmpty: S = { name: 'No lifecycle yet', render: () => <LifecycleAdmin setup={{ ...LIFECYCLE, lifecycles: [] }} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} /> };
export const LifecycleLoading: S = { name: 'Lifecycle loading', render: () => <LifecycleAdmin setup={undefined} onCreate={ok} onSave={ok} onCheck={async () => ({ ok: true, problem: null })} onPublish={ok} onRetire={ok} /> };
const schedules = (over: Partial<Parameters<typeof SchedulesAdmin>[0]> = {}) => <SchedulesAdmin timeZone="Asia/Kolkata" groups={GROUPS} recurring={RECURRING} sequences={SEQUENCES} onCreate={ok} onState={ok} onSaveSequence={ok} {...over} />;
export const Schedules: S = { name: 'Recurring tickets and follow-ups', render: () => schedules() };
export const SchedulesEmpty: S = { name: 'No schedules yet', render: () => schedules({ recurring: [], sequences: [] }) };
export const SchedulesMissing: S = { name: 'Recurring ticket Save pressed with nothing filled', render: () => schedules(), play: play(pressFirst(/^Save$/)) };
export const SequenceMissing: S = { name: 'Save sequence pressed with nothing filled', render: () => schedules(), play: play(press('Save sequence')) };
export const SchedulesStateFailed: S = { name: 'Pausing a schedule refused', render: () => schedules({ onState: fails('Someone changed this a moment ago.') }), play: play(pressFirst('Pause')) };
export const ChatQueues: S = { name: 'Chat queues and prompts', render: () => <ChatQueuesAdmin queues={ADMIN_CHAT_QUEUES} groups={GROUPS} onSave={ok} /> };
export const ChatQueuesEdit: S = { name: 'Edit a chat queue', render: () => <ChatQueuesAdmin queues={ADMIN_CHAT_QUEUES} groups={GROUPS} onSave={ok} />, play: play(pressFirst('Edit')) };
export const ChatQueuesNewMissing: S = { name: 'New chat queue saved with no name', render: () => <ChatQueuesAdmin queues={[]} groups={GROUPS} onSave={ok} />, play: play(press(/^New (chat )?queue/), press(/^Save/)) };
export const ChatQueuesEmpty: S = { name: 'No chat queues yet', render: () => <ChatQueuesAdmin queues={[]} groups={GROUPS} onSave={ok} /> };
const messaging = (over: Partial<Parameters<typeof MessagingAdmin>[0]> = {}) => <MessagingAdmin deskId="d-it" setup={MSG_SETUP} onAdd={async () => ({ webhookUrl: 'https://api.kaverifoods.test/msg/ln2', secret: 'whsec_9f2c41d7' })} onSave={ok} onRotate={async () => ({ webhookUrl: 'https://api.kaverifoods.test/msg/ln1', secret: 'whsec_1a2b3c4d' })} widgets={{ list: WIDGETS, portals: [{ id: 'pt1', name: 'Kaveri careers' }], onAdd: async () => ({ ...WIDGETS[0]!, secret: 'wgt_7e8f' }), onSave: ok, onRotate: async () => ({ secret: 'wgt_8a9b' }) }} {...over} />;
export const Messaging: S = { name: 'WhatsApp, SMS and web chat widget', render: () => messaging() };
export const MessagingEmpty: S = { name: 'No messaging lines yet', render: () => messaging({ setup: { channels: [], accounts: [], devTransport: false }, widgets: null }) };
export const MessagingAddMissing: S = { name: 'Add the line pressed with nothing filled', render: () => messaging(), play: play(choose('SMS'), press('Add the line')) };
export const MessagingWidgetMissing: S = { name: 'Add the widget pressed with no name', render: () => messaging(), play: play(press('Add the widget')) };
export const MessagingLoading: S
 = { name: 'Messaging loading', render: () => messaging({ setup: undefined }) };
const org = (over: Partial<DeskOrgAdminProps> = {}) => (
  <DeskOrgAdmin deskId="d-hr" deskKind="hr" desks={[{ id: 'd-it', name: 'IT help desk' }, { id: 'd-hr', name: 'HR help desk' }]} forwardTo={['d-it']} canCreateDesks branches={BRANCHES} locations={[{ id: 'loc-blr', name: 'Bengaluru head office' }, { id: 'loc-hosur', name: 'Hosur plant' }]} groups={GROUPS} templates={DOC_TEMPLATES} docFields={[{ key: 'employee.name', label: 'Employee name' }, { key: 'asset.name', label: 'Asset' }]} onForwardTo={ok} onClone={ok} onStarterPack={async () => ({ items: 6, sla: true })} onAddBranch={ok} onSaveTemplate={ok} journeys={{ setup: JOURNEYS, onSave: ok }} {...over} />
);
export const Org: S = { name: 'Desks, branches, document templates, journeys', render: () => org() };
export const OrgStarter: S = { name: 'Starter pack asks about a restricted HR desk', render: () => org(), play: play(press('Add the starter pack')) };
export const OrgStarterDone: S = { name: 'Starter pack added (toast)', render: () => org({ onStarterPack: async () => ({ items: 3, sla: true }) }), play: play(press('Add the starter pack')) };
export const OrgSiteMissing: S = { name: 'Add site pressed with no location', render: () => org(), play: play(press('Add site')) };
export const OrgTemplateMissing: S = { name: 'Save template pressed with nothing filled', render: () => org(), play: play(press('Save template')) };
export const OrgJourneyMissing: S = { name: 'Save journey pressed with nothing filled', render: () => org(), play: play(press('Save journey')) };
export const OrgCloneMissing: S = { name: 'Copy desk pressed with nothing filled', render: () => org(), play: play(press('Copy desk')) };
export const OrgNoCreate: S = { name: 'Someone who cannot make desks', render: () => org({ canCreateDesks: false, journeys: null }) };
const catalogAdmin = (over: Partial<CatalogAdminProps> = {}) => (
  <CatalogAdmin items={CATALOG_ITEMS} schema={CATALOG_SCHEMA} onLoad={async (id) => CATALOG_ITEMS.find((i) => i.id === id)!} onCreate={async () => CATALOG_ITEMS[1]!} onSave={async () => CATALOG_ITEMS[0]!} onPublish={ok} onRetire={ok} onFindPeople={picks} onPick={picks} highValueAbove={50000} onHighValue={ok} {...over} />
);
export const CatalogSetup: S = { name: 'Catalogue items', render: () => catalogAdmin() };
export const CatalogSetupEdit: S = { name: 'Catalogue item editor', render: () => catalogAdmin(), play: play(pressFirst('Edit')) };
export const CatalogSetupAddMissing: S = { name: 'Add item pressed with no name', render: () => catalogAdmin(), play: play(press('Add item')) };
export const CatalogSetupLimitStep: S = { name: 'Moving the first section up says it is already first', render: () => catalogAdmin(), play: play(pressFirst('Edit'), tab('Form'), pressFirst(/^Move section 1 up/)) };
// Helpdesk plan item 3: an access request item, approved by the owner of the application picked in its form.
const ACCESS_ITEM = { ...CATALOG_ITEMS[0]!, id: 'i9', name: 'Application access', shortText: 'Access to one of the company applications', cost: null, draft: { bodyHtml: '<p>Choose the application and say why you need it.</p>', form: { sections: [{ id: 's', columns: 1 as const, fields: [{ key: 'app', type: 'app' as const, label: 'Which application?', required: true }, { key: 'why', type: 'textarea' as const, label: 'Why do you need it?', required: true }] }], rules: [] }, approval: [{ name: 'Application owner', approvers: [{ kind: 'app_owner' as const, field: 'app' }], mode: 'any' as const }], fulfilment: [{ title: 'Give access', groupId: 'g-it', olaHours: 8 }] } };
export const CatalogSetupAppOwner: S = { name: 'Access request approved by the application owner', render: () => catalogAdmin({ items: [ACCESS_ITEM], onLoad: async () => ACCESS_ITEM }), play: play(pressFirst('Edit'), tab('Approvals')) };
export const CatalogSetupEmpty: S = { name: 'No catalogue items yet', render: () => catalogAdmin({ items: [] }) };
export const CatalogSetupSaveFailed: S = { name: 'Saving an item refused', render: () => catalogAdmin({ onSave: fails('Someone published a newer version a moment ago.') }), play: play(pressFirst('Edit'), press('Save draft')) };
const rules = (over: Partial<RulesAdminProps> = {}) => <RulesAdmin rules={RULES} schema={RULE_SCHEMA} webhooks={WEBHOOKS} timeZone="Asia/Kolkata" onSave={ok} onStatus={ok} onRuns={async () => RULE_RUNS} onDryRun={async () => ({ checked: 40, matched: 6, records: [] })} onInstall={ok} onAddWebhook={async () => ({ secret: 'whsec_44aa' })} onWebhookActive={ok} {...over} />;
export const Rules: S = { name: 'Rules', render: () => rules() };
export const RulesEdit: S = { name: 'Rule editor', render: () => rules(), play: play(pressFirst('Edit')) };
export const RulesRuns: S = { name: 'What a rule did', render: () => rules(), play: play(pressFirst('What it did')) };
export const RulesEmpty: S = { name: 'No rules yet (recipes)', render: () => rules({ rules: [] }) };
export const RulesSaveFailed: S = { name: 'Saving a rule refused', render: () => rules({ onSave: fails('A rule with this name already exists.') }), play: play(pressFirst('Edit'), press('Save')) };
export const RulesTooEarly: S = { name: 'New rule saved with no name', render: () => rules(), play: play(press('New rule'), press('Save')) };
export const WebhookTooEarly: S = { name: 'Add webhook pressed with nothing filled', render: () => rules(), play: play(press('Add webhook')) };
export const WebhookAdded: S = { name: 'Webhook added, secret to copy', render: () => rules(), play: play(type('Webhook name', 'Plant board'), type('Webhook address', 'https://board.kaverifoods.test/h'), press('Add webhook')) };
