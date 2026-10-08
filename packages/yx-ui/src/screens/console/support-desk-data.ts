import type { DeskConsoleTicket, DeskQueueRow } from './support-desk';

// Sample data for the Support desk stories and tests (SD-1.31). Made-up companies and people.
const at = (h: number) => new Date(Date.UTC(2026, 9, 8, h, 0)).toISOString();
export const DESK_NOW = new Date(Date.UTC(2026, 9, 8, 9, 0));

/** In the API's order: severity, then Priority Support before Standard, then due time. */
export const QUEUE: DeskQueueRow[] = [
  { id: 'q1', number: 'YXS-1042', subject: 'Nobody can sign in', company: 'Godavari Agro', tier: 'priority', severity: 1, status: 'Open', state: 'open', assignee: null, mine: false, dueAt: at(9), breached: false, createdAt: at(8) },
  { id: 'q2', number: 'YXS-1040', subject: 'Payslips stuck at readiness', company: 'Kaveri Foods', tier: 'standard', severity: 1, status: 'Open', state: 'open', assignee: 'Anand Iyer', mine: true, dueAt: at(8), breached: true, createdAt: at(7) },
  { id: 'q3', number: 'YXS-1043', subject: 'How do I add a new location?', company: null, tier: 'standard', severity: 3, status: 'New', state: 'new', assignee: null, mine: false, dueAt: at(20), breached: false, createdAt: at(8) },
];

export const DESK_TICKET: DeskConsoleTicket = {
  ticket: {
    id: 'q1',
    number: 'YXS-1042',
    subject: 'Nobody can sign in',
    systemState: 'open',
    version: 3,
    status: { label: 'Open' },
    assignee: null,
    requester: { name: 'Sunita Rao', email: 'sunita@godavari.test' },
    screen: '/yx/me/security',
    createdAt: at(8),
    messages: [
      { id: 'm1', kind: 'reply', side: 'requester', author: 'Sunita Rao', bodyHtml: '<p>Since 8:00 nobody in the company can sign in.</p>', createdAt: at(8) },
      { id: 'm2', kind: 'note', side: 'agent', author: 'Anand Iyer', mine: true, bodyHtml: '<p>Their sign-in provider looks down. Checking.</p>', createdAt: at(8) },
    ],
  },
  severityLabel: 'Severity 1 (down)',
  tier: 'priority',
  tenant: {
    name: 'Godavari Agro',
    tenantId: 'c2',
    plan: { name: 'Business', tier: 'priority' },
    open: 2,
    csat: 4.6,
    nps: 40,
    company: { name: 'Godavari Agro Pvt Ltd', slug: 'godavari-agro', lifecycle: 'active', billingStatus: 'active', trialEndsAt: null, createdAt: at(1), products: ['hrms', 'service_desk'], adminLastSignIn: at(7) },
    health: 80,
    healthFactors: [],
  },
  session: null,
  linkable: [],
};

export const UNLINKED_TICKET: DeskConsoleTicket = {
  ...DESK_TICKET,
  ticket: { ...DESK_TICKET.ticket, id: 'q3', number: 'YXS-1043', subject: 'How do I add a new location?' },
  tier: 'standard',
  tenant: null,
  linkable: [
    { id: 'a1', name: 'Godavari Agro' },
    { id: 'a2', name: 'Kaveri Foods' },
  ],
};
