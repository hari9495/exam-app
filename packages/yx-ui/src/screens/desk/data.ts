// Fictional sample data for the Service Desk stories and tests (Kaveri Foods demo company).
import type { CalendarItem, CannedResponse, ComplianceReport, DeskDetail, DeskTemplates, SlaSetup, TicketWork, DeskSummary, MyTicket, MyTicketRow, RaiseDesk, RequesterContext, TicketDetail, TicketRow, TimelineEntry } from './types';

export const DESK: DeskSummary = {
  id: 'd-it',
  key: 'IT',
  name: 'IT help desk',
  kind: 'it',
  audience: 'employee',
  billingClass: 'service_desk',
  privacy: 'standard',
  calendarId: 'cal-1',
  numberPrefix: 'IT-',
  numberSuffix: '',
  attachmentTypes: ['pdf', 'png', 'jpg', 'txt'],
  attachmentMaxMb: 10,
  vipRaisesPriority: true,
  status: 'active',
  version: 3,
  myRole: 'agent',
  canSetUp: false,
  canWork: true,
};
export const HR_DESK: DeskSummary = { ...DESK, id: 'd-hr', key: 'HR', name: 'HR help desk', kind: 'hr', billingClass: 'hrms_included', canSetUp: true, myRole: 'admin', canWork: false };

export const DETAIL: DeskDetail = {
  desk: DESK,
  types: [
    { id: 'ty-1', kind: 'incident', name: 'Something is broken', active: true, sortOrder: 0 },
    { id: 'ty-2', kind: 'request', name: 'Request', active: true, sortOrder: 1 },
  ],
  statuses: [
    { id: 'st-new', label: 'New', systemState: 'new', ticketTypeId: null, sortOrder: 0, active: true },
    { id: 'st-open', label: 'In progress', systemState: 'open', ticketTypeId: null, sortOrder: 1, active: true },
    { id: 'st-wait', label: 'Waiting on requester', systemState: 'pending', ticketTypeId: null, sortOrder: 2, active: true },
    { id: 'st-done', label: 'Resolved', systemState: 'solved', ticketTypeId: null, sortOrder: 4, active: true },
    { id: 'st-closed', label: 'Closed', systemState: 'closed', ticketTypeId: null, sortOrder: 5, active: true },
  ],
  categories: [
    { id: 'c-net', name: 'Network and Wi-Fi', parentId: null, sensitive: false, defaultGroupId: 'g-1', defaultPriority: null, active: true, sortOrder: 0 },
    { id: 'c-acc', name: 'Access and accounts', parentId: null, sensitive: false, defaultGroupId: 'g-1', defaultPriority: null, active: true, sortOrder: 1 },
    { id: 'c-sec', name: 'Security incident', parentId: null, sensitive: true, defaultGroupId: 'g-1', defaultPriority: 1, active: true, sortOrder: 2 },
  ],
  groups: [{ id: 'g-1', name: 'IT help desk team', tier: null, assignmentMethod: 'round_robin', maxOpenPerAgent: null, active: true, memberIds: ['u-suresh', 'u-farah'] }],
  matrix: [1, 2, 3, 4].flatMap((impact) => [1, 2, 3, 4].map((urgency) => ({ impact, urgency, priority: Math.max(1, Math.min(4, impact + urgency - 2)) }))),
  members: [
    { id: 'm1', userId: 'u-suresh', name: 'Suresh Pillai', email: 'it-agent@kaveri.test', role: 'agent', tier: 'L1', skills: [], validFrom: '2026-10-01', validTo: null, active: true },
    { id: 'm2', userId: 'u-farah', name: 'Farah Khan', email: 'it-lead@kaveri.test', role: 'lead', tier: 'L2', skills: [], validFrom: '2026-10-01', validTo: null, active: true },
    { id: 'm3', userId: 'u-imran', name: 'Imran Sheikh', email: 'it-collab@kaveri.test', role: 'collaborator', tier: null, skills: [], validFrom: '2026-10-01', validTo: null, active: true },
  ],
  scenarios: [{ id: 'sc-1', name: 'Ask for the laptop tag', active: true, actions: { statusId: 'st-wait', reply: '<p>Please send the asset tag.</p>' } }],
  myRole: 'agent',
  canSetUp: false,
  canManageMembers: false,
};

export const ROWS: TicketRow[] = [
  { id: 't1', number: 'IT-1001', subject: 'VPN keeps disconnecting from home', deskId: 'd-it', desk: 'IT help desk', type: 'Something is broken', statusId: 'st-open', status: 'In progress', systemState: 'open', priority: 2, category: 'Network and Wi-Fi', group: 'IT help desk team', requester: 'Divya Raghunathan', requestedFor: null, assigneeUserId: 'u-suresh', assignee: 'Suresh Pillai', tags: ['vpn'], vip: false, sensitive: false, private: false, version: 4, createdAt: '2026-10-07T04:30:00Z', updatedAt: '2026-10-08T05:10:00Z', canBulk: true },
  { id: 't2', number: 'IT-1002', subject: 'New laptop for Arjun', deskId: 'd-it', desk: 'IT help desk', type: 'Request', statusId: 'st-new', status: 'New', systemState: 'new', priority: 3, category: 'Laptop and devices', group: 'IT help desk team', requester: 'Divya Raghunathan', requestedFor: 'Arjun Kulkarni', assigneeUserId: null, assignee: null, tags: [], vip: false, sensitive: false, private: false, version: 1, createdAt: '2026-10-08T02:00:00Z', updatedAt: '2026-10-08T02:00:00Z', canBulk: true },
  { id: 't3', number: 'IT-1004', subject: 'Printer on 2nd floor jams', deskId: 'd-it', desk: 'IT help desk', type: 'Something is broken', statusId: 'st-wait', status: 'Waiting on requester', systemState: 'pending', priority: 2, category: 'Other', group: 'IT help desk team', requester: 'Meera Iyer', requestedFor: null, assigneeUserId: 'u-farah', assignee: 'Farah Khan', tags: [], vip: true, sensitive: false, private: false, version: 2, createdAt: '2026-10-08T06:00:00Z', updatedAt: '2026-10-08T06:30:00Z', canBulk: true },
];

export const TICKET: TicketDetail = {
  id: 't1',
  number: 'IT-1001',
  deskId: 'd-it',
  subject: 'VPN keeps disconnecting from home',
  kind: 'incident',
  systemState: 'open',
  statusId: 'st-open',
  typeId: 'ty-1',
  categoryId: 'c-net',
  groupId: 'g-1',
  priority: 2,
  impact: null,
  urgency: null,
  assigneeUserId: 'u-suresh',
  channel: 'portal',
  sensitive: false,
  private: false,
  vip: false,
  tags: ['vpn'],
  firstResponseAt: '2026-10-07T06:30:00Z',
  resolvedAt: null,
  version: 4,
  createdAt: '2026-10-07T04:30:00Z',
  updatedAt: '2026-10-08T05:10:00Z',
  access: 'agent',
  canWork: true,
  canNote: true,
  canAssignOthers: false,
  desk: { id: 'd-it', key: 'IT', name: 'IT help desk', audience: 'employee' },
  type: { id: 'ty-1', name: 'Something is broken' },
  status: { id: 'st-open', label: 'In progress' },
  category: { id: 'c-net', name: 'Network and Wi-Fi' },
  group: { id: 'g-1', name: 'IT help desk team' },
  requester: { id: 'p-divya', name: 'Divya Raghunathan', email: 'divya.raghunathan@kaveri.test' },
  requestedFor: null,
  assignee: { id: 'u-suresh', name: 'Suresh Pillai' },
  openedBy: 'Divya Raghunathan',
  messages: [
    { id: 'm1', kind: 'reply', side: 'requester', author: 'Divya Raghunathan', mine: false, bodyHtml: '<p>Since Monday the VPN drops every 10 minutes when I work from home.</p>', channel: 'portal', createdAt: '2026-10-07T04:30:00Z', editedAt: null },
    { id: 'm2', kind: 'note', side: 'agent', author: 'Suresh Pillai', mine: true, bodyHtml: '<p>Same router model as last week. Checking the client version.</p>', channel: 'agent', createdAt: '2026-10-07T06:00:00Z', editedAt: null },
    { id: 'm3', kind: 'reply', side: 'agent', author: 'Suresh Pillai', mine: true, bodyHtml: '<p>Hi Divya, please update the VPN app to version 7.2.</p>', channel: 'agent', createdAt: '2026-10-07T06:30:00Z', editedAt: null },
  ],
  attachments: [{ id: 'a1', fileName: 'vpn-log.txt', contentType: 'text/plain', sizeBytes: 2048, scanStatus: 'clean', side: 'requester', messageId: 'm1', createdAt: '2026-10-07T04:30:00Z' }],
  watchers: [],
  collaborators: [{ userId: 'u-imran', name: 'Imran Sheikh' }],
  time: { totalMinutes: 20, entries: [{ id: 'te1', minutes: 20, note: 'Checked logs', workedOn: '2026-10-07', who: 'Suresh Pillai', mine: true }] },
};

export const TIMELINE: TimelineEntry[] = [
  { id: 'e1', kind: 'created', from: null, to: 'IT-1001', reason: null, by: 'Divya Raghunathan', at: '2026-10-07T04:30:00Z' },
  { id: 'e2', kind: 'assigned', from: null, to: 'Suresh Pillai', reason: 'Assigned automatically', by: 'YukthiX', at: '2026-10-07T04:30:00Z' },
  { id: 'e3', kind: 'priority_changed', from: '3', to: '2', reason: 'Whole team works from home on Fridays', by: 'Suresh Pillai', at: '2026-10-07T05:00:00Z' },
];

export const CONTEXT: RequesterContext = {
  person: { id: 'p-divya', name: 'Divya Raghunathan', email: 'divya.raghunathan@kaveri.test' },
  vip: false,
  employee: { code: 'KF-0001', designation: 'Quality Manager', department: 'Quality', location: 'Bengaluru HQ' },
  otherTickets: [{ id: 't2', number: 'IT-1002', subject: 'New laptop for Arjun', systemState: 'new', createdAt: '2026-10-08T02:00:00Z' }],
  assets: [],
};

export const CANNED: CannedResponse[] = [{ id: 'cr1', title: 'Password reset steps', bodyHtml: '<p>Hi {{requester.first_name}}, open My security and choose Change password.</p>', personal: false, active: true }];

export const RAISE_DESKS: RaiseDesk[] = [
  { id: 'd-it', name: 'IT help desk', key: 'IT', attachmentTypes: ['pdf', 'png'], attachmentMaxMb: 10, types: [{ id: 'ty-1', name: 'Something is broken' }, { id: 'ty-2', name: 'Request' }], categories: DETAIL.categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, sensitive: c.sensitive })) },
  { id: 'd-hr', name: 'HR help desk', key: 'HR', attachmentTypes: ['pdf'], attachmentMaxMb: 10, types: [{ id: 'ty-h', name: 'Question' }], categories: [{ id: 'c-pay', name: 'Payslip and pay', parentId: null, sensitive: true }] },
];

export const MY_ROWS: MyTicketRow[] = [
  { id: 't1', number: 'IT-1001', subject: 'VPN keeps disconnecting from home', desk: 'IT help desk', status: 'In progress', systemState: 'open', private: false, role: 'requester', createdAt: '2026-10-07T04:30:00Z', updatedAt: '2026-10-08T05:10:00Z' },
  { id: 't5', number: 'HR-1001', subject: 'LOP on my September payslip', desk: 'HR help desk', status: 'New', systemState: 'new', private: true, role: 'requester', createdAt: '2026-10-07T00:30:00Z', updatedAt: '2026-10-07T00:30:00Z' },
];

export const MY_TICKET: MyTicket = {
  id: 't1',
  number: 'IT-1001',
  subject: 'VPN keeps disconnecting from home',
  desk: { name: 'IT help desk', attachmentTypes: ['pdf', 'png', 'txt'], attachmentMaxMb: 10 },
  status: 'In progress',
  systemState: 'open',
  private: false,
  createdAt: '2026-10-07T04:30:00Z',
  requester: 'Divya Raghunathan',
  requestedFor: null,
  assignee: 'Suresh Pillai',
  canReply: true,
  messages: [TICKET.messages[0], TICKET.messages[2]].map((m) => ({ id: m.id, side: m.side, author: m.author, mine: m.side === 'requester', bodyHtml: m.bodyHtml, createdAt: m.createdAt })),
  attachments: TICKET.attachments,
  history: [{ at: '2026-10-07T05:00:00Z', from: 'New', to: 'In progress' }],
};

// ---- batch 2 (SD-1.09 to SD-1.17) ----

export const WORK: TicketWork = {
  parent: null,
  children: [],
  merged: [],
  mergedInto: null,
  links: [{ id: 'l1', kind: 'related', words: 'Related to', direction: 'out', ticket: { id: 't9', number: 'IT-1031', subject: 'VPN slow on Fridays', systemState: 'open', deskId: 'd-it', tracker: false } }],
  sideConversations: [{ id: 's1', channel: 'note_thread', subject: 'Ask the network team', withWhom: 'Network team', state: 'open', createdBy: 'Suresh Pillai', createdAt: '2026-10-08T05:00:00Z', childTicket: null, messages: [{ id: 'sm1', author: 'Suresh Pillai', bodyHtml: '<p>Is router 3 on the old firmware?</p>', createdAt: '2026-10-08T05:00:00Z' }] }],
  tasks: [
    { id: 'k1', ticketId: 't1', deskId: 'd-it', title: 'Check the VPN client version', note: null, checklist: false, state: 'open', assigneeUserId: 'u-imran', assignee: 'Imran Sheikh', groupId: null, dueAt: '2026-10-09T10:00:00Z', version: 1, doneAt: null },
    { id: 'k2', ticketId: 't1', deskId: 'd-it', title: 'Tell Divya the fix', note: null, checklist: true, state: 'done', assigneeUserId: null, assignee: null, groupId: null, dueAt: null, version: 2, doneAt: '2026-10-08T06:00:00Z' },
  ],
  sla: [
    { id: 'x1', kind: 'sla', metric: 'first_response', label: 'First response', state: 'met', breached: false, startedAt: '2026-10-07T04:00:00Z', dueAt: null, breachedAt: null, metAt: '2026-10-07T04:20:00Z', targetSeconds: 3600, usedSeconds: 1200, percent: 33, pauseReason: null, breachReason: null, excluded: false, exclusionReason: null, cancelReason: null, segments: [{ from: '2026-10-07T04:00:00Z', to: '2026-10-07T04:20:00Z', state: 'running', reason: null }] },
    {
      id: 'x2', kind: 'sla', metric: 'resolution', label: 'Resolution', state: 'running', breached: true, startedAt: '2026-10-07T04:00:00Z', dueAt: '2026-10-07T12:00:00Z', breachedAt: '2026-10-07T12:00:00Z', metAt: null, targetSeconds: 28800, usedSeconds: 30000, percent: 104, pauseReason: null, breachReason: null, excluded: false, exclusionReason: null, cancelReason: null,
      segments: [
        { from: '2026-10-07T04:00:00Z', to: '2026-10-07T06:00:00Z', state: 'running', reason: null },
        { from: '2026-10-07T06:00:00Z', to: '2026-10-07T08:00:00Z', state: 'paused', reason: 'Waiting on requester' },
        { from: '2026-10-07T08:00:00Z', to: '2026-10-07T12:00:00Z', state: 'running', reason: null },
        { from: '2026-10-07T12:00:00Z', to: '2026-10-07T12:20:00Z', state: 'breached', reason: null },
      ],
    },
  ],
  reminders: [{ id: 'r1', kind: 'remind', remindAt: '2026-10-09T04:30:00Z', note: 'Chase the vendor' }],
  maskedValues: [{ id: 'v1', kind: 'pan', masked: '[PAN ••234F]', messageId: 'm1' }],
  canUnmask: true,
  canSeeReads: true,
  canExclude: true,
  canMerge: true,
};

export const TEMPLATES: DeskTemplates = {
  templates: [{ id: 'tp1', name: 'New joiner laptop', ticketTypeId: null, defaults: { tags: ['joiner'] }, checklist: ['Pick a laptop', 'Install software'], active: true }],
  resolutionCodes: [
    { id: 'rc1', code: 'fixed', label: 'Fixed', active: true },
    { id: 'rc2', code: 'workaround', label: 'Workaround given', active: true },
  ],
};

export const CAL_ITEMS: CalendarItem[] = [
  { id: 'r-1', kind: 'reminder', at: '2026-10-09T04:30:00Z', title: 'Reminder: IT-1042 · VPN keeps disconnecting (Chase the vendor)', ticketId: 't1' },
  { id: 's-1', kind: 'sla', at: '2026-10-09T09:00:00Z', title: 'Resolve by: IT-1043', ticketId: 't2' },
];

export const SLA_SETUP: SlaSetup = {
  policies: [{ id: 'p1', name: 'IT standard', kind: 'sla', sortOrder: 0, active: true, version: 1, versions: [{ id: 'pv1', version: 1, validFrom: '2026-01-01T00:00:00Z', scope: { match: 'all', rules: [] }, calendarSource: 'desk', calendarId: null, targets: [{ metric: 'first_response', minutes: [30, 60, 240, 480] }, { metric: 'resolution', minutes: [240, 480, 1440, 2880] }], pauseStates: ['pending', 'on_hold'], recount: 'keep' }] }],
  complianceTargets: [{ metric: 'resolution', priority: 2, targetPercent: 95 }],
};

export const COMPLIANCE: ComplianceReport = { month: '2026-10', lines: [{ metric: 'resolution', label: 'Resolution', priority: 2, kept: 18, missed: 2, open: 3, excluded: 1, percent: 90, target: 95, atRisk: true }] };
