// Fictional, deterministic sample data for the live service-management (ESM) pieces' design stories. Kaveri Foods, 28 Oct 2026.
import type { FormDef } from '../../lib/forms';
import type { Catalogue, CatalogItemAdmin, CatalogItemPage, CatalogSchema, DeskRule, DeskRuleSchema, MyRequestView, OrderGuideView, PickOption, RuleRun, RuleWebhook, TicketRequestView } from './esm-types';
import type { BranchView, ChatQueue, ChatSession, DocTemplate, DocumentsView, HrSummary, InteractionView, JourneySetup, LifecycleSetup, MyChatQueue, RecurringView, RequestDocument, SequenceDef, SequenceRunView, TicketShare } from './esm2-types';
import type { AvailabilityRow, DevOutboxItem, ForecastView, MsgSetup, MyChannels, ShiftView, TeamMember, WidgetView } from './esm3-types';
import type { TicketArticleLink } from './ticket-kb';

// ------------------------------------------------------------------ Catalogue and requests
export const LAPTOP_FORM: FormDef = {
  sections: [
    {
      id: 's1',
      title: 'Your laptop',
      columns: 2,
      fields: [
        { key: 'model', type: 'choice', label: 'Model', labels: { hi: 'मॉडल' }, required: true, options: [{ value: 'std', label: 'Standard (14 inch)', colour: 'blue' }, { value: 'dev', label: 'Developer (16 inch, 32 GB)', colour: 'purple' }] },
        { key: 'reason', type: 'textarea', label: 'Why the developer model?' },
        { key: 'qty', type: 'number', label: 'How many', min: 1, max: 3 },
      ],
    },
  ],
  rules: [{ id: 'r', when: { id: 'w', join: 'and', items: [{ id: 'c', field: 'model', operator: 'is', value: 'dev' }] }, then: [{ action: 'show', field: 'reason' }, { action: 'require', field: 'reason' }] }],
};
export const CATALOGUE: Catalogue = {
  items: [
    { id: 'i1', deskId: 'd-it', desk: 'IT help desk', category: 'Laptops', name: 'New laptop', shortText: 'A standard or developer laptop, set up for you', cost: 85000, currency: 'INR', deliveryDays: 5 },
    { id: 'i2', deskId: 'd-it', desk: 'IT help desk', category: 'Accessories', name: 'Monitor', shortText: '24 inch, with a stand', cost: 14500, currency: 'INR', deliveryDays: 3 },
    { id: 'i3', deskId: 'd-hr', desk: 'HR help desk', category: 'Letters', name: 'Address proof letter', shortText: 'For a bank or a rental agreement', cost: null, currency: 'INR', deliveryDays: 2 },
  ],
  guides: [{ id: 'g1', name: 'New joiner kit', description: 'Everything a new joiner needs on day one' }],
};
export const LAPTOP_PAGE: CatalogItemPage = { id: 'i1', name: 'New laptop', shortText: 'A standard or developer laptop, set up for you', desk: 'IT help desk', cost: 85000, currency: 'INR', deliveryDays: 5, version: 3, bodyHtml: '<p>Pick a model. Developer laptops need a reason.</p>', media: [], form: LAPTOP_FORM, profile: {}, approvals: ['Your manager', 'Cost-centre owner'] };
export const JOINER_GUIDE: OrderGuideView = { id: 'g1', name: 'New joiner kit', description: 'Everything a new joiner needs on day one', form: { sections: [{ id: 'g', title: 'The joiner', columns: 1, fields: [{ key: 'role', type: 'choice', label: 'Role', required: true, options: [{ value: 'office', label: 'Office' }, { value: 'plant', label: 'Plant' }] }] }], rules: [] } };
export const PICKS: PickOption[] = [
  { id: 'u-arjun', label: 'Arjun Kulkarni', detail: 'Quality Analyst' },
  { id: 'u-kavitha', label: 'Kavitha Sundaram', detail: 'Line Operator' },
];
const ROUTE = {
  status: 'pending',
  steps: [
    { name: 'Your manager', state: 'approved', rule: 'any', approvers: [{ name: 'Divya Raghunathan', onBehalfOf: null, status: 'approved' }], waitingFor: [] },
    { name: 'Cost-centre owner', state: 'open', rule: 'any', approvers: [{ name: 'Ramesh Gowda', onBehalfOf: null, status: 'pending' }], waitingFor: ['Ramesh Gowda'] },
  ],
  log: [{ action: 'approved', by: 'Divya Raghunathan', onBehalfOf: null, step: 1, reason: null, channel: 'web', at: '2026-10-27T05:00:00Z' }],
};
export const MY_REQUEST: MyRequestView = {
  ticketId: 't-1020',
  number: 'IT-1020',
  subject: 'New laptop',
  systemState: 'open',
  items: [
    {
      id: 'ri1',
      item: 'New laptop',
      itemVersion: 3,
      quantity: 1,
      stage: 'approval',
      stageAt: '2026-10-27T05:00:00Z',
      tracker: [{ stage: 'submitted', state: 'done' }, { stage: 'approval', state: 'current' }, { stage: 'fulfilment', state: 'next' }, { stage: 'delivered', state: 'next' }],
      canCancel: true,
      answers: [{ label: 'Model', value: 'Developer (16 inch, 32 GB)' }, { label: 'Why the developer model?', value: 'Builds of the plant dashboards' }],
      approval: ROUTE,
      tasks: [],
    },
  ],
};
export const TICKET_REQUEST: TicketRequestView = {
  items: MY_REQUEST.items,
  approvals: [{ ...ROUTE, id: 'ap1', title: 'New laptop for Arjun Kulkarni', summary: [{ label: 'Item', value: 'New laptop' }, { label: 'Cost', value: '₹85,000' }], submittedAt: '2026-10-26T05:00:00Z' }],
};

// ------------------------------------------------------------------ Catalogue and rules set-up
export const CATALOG_ITEMS: CatalogItemAdmin[] = [
  { id: 'i1', deskId: 'd-it', categoryId: 'c-lap', name: 'New laptop', shortText: 'A standard or developer laptop', state: 'published', currentVersion: 3, audience: null, cost: 85000, currency: 'INR', deliveryDays: 5, sortOrder: 1, draft: { bodyHtml: '<p>Pick a model.</p>', form: LAPTOP_FORM, approval: [{ name: 'Your manager', approvers: [{ kind: 'manager' }], mode: 'any' }], fulfilment: [{ title: 'Image and hand over', groupId: 'g-it', olaHours: 24 }] }, version: 7, updatedAt: '2026-10-20T05:00:00Z', versions: [{ version: 3, publishedAt: '2026-10-20T05:00:00Z' }], orders: { '2026-10': 14 } },
  { id: 'i2', deskId: 'd-it', categoryId: 'c-acc', name: 'Monitor', shortText: '24 inch, with a stand', state: 'draft', currentVersion: null, audience: null, cost: 14500, currency: 'INR', deliveryDays: 3, sortOrder: 2, draft: {}, version: 1, updatedAt: '2026-10-27T05:00:00Z' },
];
export const CATALOG_SCHEMA: CatalogSchema = {
  requesterFields: [{ key: 'location', label: 'Location', type: 'choice', options: [{ value: 'blr', label: 'Bengaluru head office' }, { value: 'hosur', label: 'Hosur plant' }] }],
  groups: [{ id: 'g-it', name: 'IT field support' }],
  categories: [{ id: 'c-lap', name: 'Laptops' }, { id: 'c-acc', name: 'Accessories' }],
  userGroups: [{ id: 'ug-fin', name: 'Finance approvers' }],
  questionnaires: [],
  costCentresWithoutOwner: ['CC-HSR-OPS'],
};
const ALL = { id: 'root', join: 'and' as const, items: [] };
export const RULES: DeskRule[] = [
  { id: 'ru1', name: 'Hosur plant tickets to field support', description: 'Anything raised from the plant goes to the field team', status: 'active', pausedReason: null, sortOrder: 1, stopAfter: false, maxRunsPerHour: 100, currentVersion: 2, recipeKey: null, version: 4, trigger: { type: 'ticket.created' }, condition: { id: 'c', join: 'and', items: [{ id: 'x', field: 'location', operator: 'is', value: 'hosur' }] }, actions: [{ type: 'assign', groupId: 'g-it' }], lastWeek: { matched: 23, failed: 0 } },
  { id: 'ru2', name: 'Waiting on requester for 3 days', description: null, status: 'paused', pausedReason: 'Paused by Farah Khan while the reminders were reworded', sortOrder: 2, stopAfter: false, maxRunsPerHour: 50, currentVersion: 1, recipeKey: 'stale_pending', version: 2, trigger: { type: 'time.pending', hours: 72 }, condition: ALL, actions: [{ type: 'notify', to: 'assignee', message: 'Nudge the requester' }] },
];
export const RULE_SCHEMA: DeskRuleSchema = {
  triggers: [{ key: 'ticket.created', label: 'A ticket is raised' }, { key: 'ticket.updated', label: 'A ticket changes' }, { key: 'time.pending', label: 'Waiting on the requester for', time: true }],
  fields: [{ key: 'location', label: 'Location', type: 'choice', options: [{ value: 'blr', label: 'Bengaluru head office' }, { value: 'hosur', label: 'Hosur plant' }] }, { key: 'priority', label: 'Priority', type: 'number' }],
  groups: [{ id: 'g-it', name: 'IT field support' }],
  people: [{ id: 'u-farah', name: 'Farah Khan', role: 'lead' }],
  categories: [{ id: 'cat-net', name: 'Network' }],
  types: [{ id: 'ty-inc', name: 'Incident' }],
  statuses: [{ id: 'st-open', name: 'Open' }],
  webhooks: [],
  canUseWebhooks: true,
  recipes: [{ key: 'stale_pending', name: 'Nudge when waiting on the requester', description: 'After a set time, remind the assignee' }],
};
export const RULE_RUNS: RuleRun[] = [
  { id: 'rr1', at: '2026-10-28T04:10:00Z', ruleVersion: 2, trigger: 'ticket.created', ticketId: 't-1031', ticket: 'IT-1031', outcome: 'matched', depth: 0, trace: [{ id: 'x', label: 'Location', operator: 'is', expected: 'hosur', actual: 'hosur', pass: true }], actions: [{ type: 'assign', result: 'Assigned to IT field support' }], error: null },
];
export const WEBHOOKS: RuleWebhook[] = [{ id: 'wh1', name: 'Plant alerts board', url: 'https://alerts.kaverifoods.test/hooks/desk', active: true }];

// ------------------------------------------------------------------ Chat
export const CHAT_QUEUES: MyChatQueue[] = [
  { id: 'q-it', deskId: 'd-it', desk: 'IT help desk', name: 'IT chat', welcome: 'Hi! Tell us what is not working.', preChat: { sections: [{ id: 'p', title: '', columns: 1, fields: [{ key: 'device', type: 'choice', label: 'Device', options: [{ value: 'laptop', label: 'Laptop' }, { value: 'phone', label: 'Phone' }] }] }], rules: [] }, online: true },
  { id: 'q-hr', deskId: 'd-hr', desk: 'HR help desk', name: 'HR chat', welcome: null, preChat: { sections: [], rules: [] }, online: false },
];
export const CHAT: ChatSession = {
  id: 'ch1',
  deskId: 'd-it',
  queueId: 'q-it',
  state: 'active',
  subject: 'VPN keeps dropping',
  agentUserId: 'u-farah',
  ticketId: null,
  rating: null,
  endReason: null,
  requesterSeenAt: '2026-10-28T05:06:00Z',
  agentSeenAt: '2026-10-28T05:05:00Z',
  startedAt: '2026-10-28T05:00:00Z',
  acceptedAt: '2026-10-28T05:01:00Z',
  endedAt: null,
  person: 'Arjun Kulkarni',
  queue: 'IT chat',
  agent: 'Farah Khan',
  preChat: [{ label: 'Device', value: 'Laptop' }],
  messages: [
    { id: 'm1', author: 'requester', name: 'Arjun Kulkarni', body: 'The VPN drops every ten minutes since this morning.', card: null, file: null, at: '2026-10-28T05:00:30Z' },
    { id: 'm2', author: 'system', body: 'Farah Khan joined the chat.', card: null, file: null, at: '2026-10-28T05:01:00Z' },
    { id: 'm3', author: 'agent', name: 'Farah Khan', body: 'Sorry about that. Are you on the office Wi-Fi or at home?', card: null, file: null, at: '2026-10-28T05:02:00Z' },
    { id: 'm4', author: 'agent', name: 'Farah Khan', body: '', card: { title: 'Did restarting the VPN client help?', buttons: [{ label: 'Yes', reply: 'Yes, it works now' }, { label: 'No', reply: 'No, it still drops' }] }, file: null, at: '2026-10-28T05:05:00Z' },
  ],
};
export const CHAT_QUEUED: ChatSession = { ...CHAT, id: 'ch2', state: 'queued', subject: 'Payslip PDF will not open', agentUserId: null, acceptedAt: null, agent: null, person: 'Kavitha Sundaram', messages: [{ id: 'n1', author: 'requester', name: 'Kavitha Sundaram', body: 'My September payslip does not open on my phone.', card: null, file: null, at: '2026-10-28T05:20:00Z' }] };
export const CHAT_ENDED: ChatSession = { ...CHAT, id: 'ch0', state: 'ended', subject: 'Outlook asks for my password again', endReason: 'resolved', endedAt: '2026-10-27T09:00:00Z', rating: 5, ticket: { id: 't-1012', number: 'IT-1012' }, ticketId: 't-1012' };
export const ADMIN_CHAT_QUEUES: ChatQueue[] = [
  { id: 'q-it', name: 'IT chat', groupId: 'g-it', active: true, maxPerAgent: 3, waitMinutes: 5, welcome: 'Hi! Tell us what is not working.', preChat: CHAT_QUEUES[0]!.preChat, prompts: [{ id: 'pr1', pathPrefix: '/yx/me/pay', text: 'Questions about your payslip? Chat with us.', afterSeconds: 30 }], version: 2 },
];
export const INTERACTIONS: InteractionView[] = [
  { id: 'iv1', channel: 'call', subject: 'Printer on the 2nd floor jams', notes: 'Cleared the tray; asked to call back if it happens again.', outcome: 'resolved', person: 'Divya Raghunathan', agent: 'Farah Khan', ticketId: null, ticketNumber: null, callRef: 'CALL-8821', startedAt: '2026-10-28T03:40:00Z', endedAt: '2026-10-28T03:48:00Z', version: 1 },
  { id: 'iv2', channel: 'walk_up', subject: 'Badge does not open the lab door', notes: '', outcome: 'open', person: 'Sanjay Rao', agent: 'Farah Khan', ticketId: null, ticketNumber: null, callRef: null, startedAt: '2026-10-28T04:30:00Z', endedAt: null, version: 1 },
];

// ------------------------------------------------------------------ Help centre cards, documents, ticket rail
export const MY_CHANNELS: MyChannels = { devTransport: false, lines: [{ kind: 'whatsapp', name: 'IT help on WhatsApp', sendTo: '+91 80 4567 0000', linked: { masked: '+91 98•••••678', since: '2026-09-02T05:00:00Z' } }, { kind: 'sms', name: 'HR help by SMS', sendTo: '+91 80 4567 0001', linked: null }] };
export const DEV_OUTBOX: DevOutboxItem[] = [{ kind: 'whatsapp', text: 'Your phone is linked to IT help.', template: null, at: '2026-10-28T05:00:00Z' }];
export const DOCUMENTS: RequestDocument[] = [
  { id: 'doc1', title: 'Laptop hand-over form', status: 'pending', sha256: 'b7f3', signedAt: null, createdAt: '2026-10-27T05:00:00Z', needsMe: true, text: 'I, the employee, received a Developer laptop (asset KF-LT-0412) in working order and will return it when I leave Kaveri Foods.' },
  { id: 'doc2', title: 'Address proof letter', status: 'issued', sha256: 'c1d2', signedAt: null, createdAt: '2026-10-10T05:00:00Z', needsMe: false },
  { id: 'doc3', title: 'Asset return note', status: 'signed', sha256: 'e4f5', signedAt: '2026-08-12T05:00:00Z', createdAt: '2026-08-11T05:00:00Z', needsMe: false },
];
export const HR_SUMMARY: HrSummary = { source: 'hr', name: 'Arjun Kulkarni', designation: 'Quality Analyst', department: 'Quality', location: 'Bengaluru head office', manager: 'Divya Raghunathan', workEmail: 'arjun.kulkarni@kaverifoods.test', internal: { employeeCode: 'KF-0142', joinedOn: '2023-06-12', tenure: '3 years 4 months', grade: 'L3', employmentType: 'Permanent' } };
export const SHARES: TicketShare[] = [{ deskId: 'd-hr', desk: 'HR help desk', level: 'view', at: '2026-10-27T05:00:00Z' }];
export const DOCS_VIEW: DocumentsView = { documents: DOCUMENTS.slice(0, 2), templates: [{ id: 'tp1', name: 'Laptop hand-over form', needsSignature: true }, { id: 'tp2', name: 'Address proof letter', needsSignature: false }] };
export const SEQUENCES: SequenceDef[] = [{ id: 'sq1', name: 'Waiting on the requester', steps: [{ afterHours: 24, bodyHtml: '<p>Just checking in: did that help?</p>' }, { afterHours: 72, bodyHtml: '<p>We will close this in two days if we do not hear back.</p>' }], active: true, version: 1 }];
export const SEQUENCE_RUNS: SequenceRunView[] = [{ id: 'sr1', sequence: 'Waiting on the requester', step: 1, state: 'running', nextAt: '2026-10-29T05:00:00Z', stopReason: null }];
export const KB_LINKS: TicketArticleLink[] = [{ id: 'a1', number: 12, title: 'Connect to the office Wi-Fi', kind: 'linked' }, { id: 'a2', number: 31, title: 'Fix a VPN that keeps dropping', kind: 'solved' }];

// ------------------------------------------------------------------ Desk set-up: lifecycle, schedules, org, messaging
export const LIFECYCLE: LifecycleSetup = {
  types: [{ id: 'ty-inc', name: 'Incident', kind: 'incident' }, { id: 'ty-req', name: 'Service request', kind: 'request' }],
  statuses: [
    { id: 'n', label: 'New', systemState: 'new', ticketTypeId: null },
    { id: 'p', label: 'In progress', systemState: 'open', ticketTypeId: null },
    { id: 'w', label: 'Waiting on requester', systemState: 'pending', ticketTypeId: null },
    { id: 's', label: 'Solved', systemState: 'solved', ticketTypeId: null },
  ],
  requirable: [{ key: 'resolution_note', label: 'Resolution note' }],
  lifecycles: [{ id: 'lc1', ticketTypeId: 'ty-inc', name: 'Incident flow', state: 'draft', currentVersion: 1, draft: { startStatusId: 'n', statusIds: ['n', 'p', 'w', 's'], transitions: [{ from: 'n', to: 'p' }, { from: 'p', to: 'w' }, { from: 'w', to: 'p' }, { from: 'p', to: 's', require: ['resolution_note'] }] }, version: 3, versions: [{ version: 1, publishedAt: '2026-09-01T05:00:00Z' }] }],
};
export const RECURRING: RecurringView[] = [
  { id: 'rc1', name: 'Monthly UPS check, Hosur plant', template: { subject: 'Check the UPS batteries at Hosur', bodyHtml: '<p>Run the battery test and note the readings.</p>', groupId: 'g-it' }, rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', timeZone: 'Asia/Kolkata', startsAt: '2026-01-01T03:30:00Z', nextRunAt: '2026-11-01T03:30:00Z', lastRunAt: '2026-10-01T03:30:00Z', state: 'active', version: 2, upcoming: ['2026-11-01T03:30:00Z', '2026-12-01T03:30:00Z'], runs: [{ dueAt: '2026-10-01T03:30:00Z', ticketId: 't-0990', late: false, missed: false }] },
];
export const BRANCHES: BranchView[] = [{ id: 'br1', locationId: 'loc-hosur', location: 'Hosur plant', groupId: 'g-it', calendarId: null, adminUserId: null, version: 1, canEdit: true }];
export const DOC_TEMPLATES: DocTemplate[] = [{ id: 'tp1', name: 'Laptop hand-over form', body: 'I, {{employee.name}}, received {{asset.name}} in working order.', needsSignature: true, active: true, version: 1 }];
export const JOURNEYS: JourneySetup = {
  journeys: [{ id: 'j1', kind: 'join', name: 'Office joiner', itemIds: ['i1', 'i2'], active: true, version: 1 }],
  items: [{ id: 'i1', name: 'New laptop', deskId: 'd-it', journeyOnly: false }, { id: 'i2', name: 'Monitor', deskId: 'd-it', journeyOnly: false }],
  recent: [{ journeyId: 'j1', employeeId: 'e-kavya', date: '2026-11-02', tickets: 2, at: '2026-10-27T05:00:00Z' }],
};
export const MSG_SETUP: MsgSetup = {
  channels: [{ id: 'ln1', deskId: 'd-it', kind: 'whatsapp', name: 'IT help on WhatsApp', account: { id: 'ac1', name: 'Kaveri Foods WhatsApp', sender: '+91 80 4567 0000' }, templates: { reply_notice: { name: 'desk_reply', language: 'en', status: 'approved' } }, state: 'active', version: 1, onThisDesk: true }],
  accounts: [{ id: 'ac1', name: 'Kaveri Foods WhatsApp', channel: 'whatsapp', sender: '+91 80 4567 0000', active: true }],
  devTransport: false,
};
export const WIDGETS: WidgetView[] = [{ id: 'w1', portalId: 'pt1', key: 'kf-help', name: 'Careers site help', allowedOrigins: ['https://careers.kaverifoods.test'], allowAnonymous: true, mobile: false, state: 'active', version: 1, snippet: '<script src="https://kaverifoods.yukthix.test/widget.js" data-key="kf-help"></script>' }];

// ------------------------------------------------------------------ Team
export const TEAM: TeamMember[] = [
  { userId: 'u-farah', name: 'Farah Khan', role: 'lead', presence: 'available', awayUntil: null, skills: ['network', 'vpn'], languages: ['en', 'hi'], onShift: true, openTickets: 6, activeChats: 1, capacity: { ticket: 12, chat: 3, messaging: 5 } },
  { userId: 'u-suresh', name: 'Suresh Pillai', role: 'agent', presence: 'busy', awayUntil: null, skills: ['laptops'], languages: ['en', 'ta'], onShift: true, openTickets: 9, activeChats: 2, capacity: { ticket: null, chat: 2, messaging: null } },
  { userId: 'u-meera', name: 'Meera Iyer', role: 'agent', presence: 'away', awayUntil: '2026-10-28T08:00:00Z', skills: [], languages: ['en', 'kn'], onShift: false, openTickets: 2, activeChats: 0, capacity: { ticket: 10, chat: 2, messaging: null } },
];
export const SHIFTS: ShiftView[] = [
  { id: 'sh1', userId: 'u-farah', name: 'Farah Khan', startsAt: '2026-10-28T03:30:00Z', endsAt: '2026-10-28T12:30:00Z', note: null },
  { id: 'sh2', userId: 'u-suresh', name: 'Suresh Pillai', startsAt: '2026-10-28T08:30:00Z', endsAt: '2026-10-28T17:30:00Z', note: 'Covers the plant evening shift' },
];
export const FORECAST: ForecastView = {
  perAgentPerDay: 18,
  weeks: 6,
  history: [{ day: '2026-10-27', created: 41 }],
  days: [
    { day: '2026-10-28', weekday: 3, expected: 44, staffNeeded: 3, basis: 6, rostered: 2, short: 1 },
    { day: '2026-10-29', weekday: 4, expected: 39, staffNeeded: 3, basis: 6, rostered: 3, short: 0 },
  ],
};
export const AVAILABILITY: AvailabilityRow[] = [
  { userId: 'u-farah', name: 'Farah Khan', minutes: { available: 410, away: 30, busy: 60, offline: 0 }, replies: 38, notes: 6, solved: 14, avgHandleHours: 3.2, repliesPerOnlineHour: 5.6, timeLoggedMinutes: 380 },
  { userId: 'u-suresh', name: 'Suresh Pillai', minutes: { available: 300, away: 60, busy: 120, offline: 0 }, replies: 25, notes: 3, solved: 9, avgHandleHours: 4.1, repliesPerOnlineHour: 5, timeLoggedMinutes: 330 },
];
