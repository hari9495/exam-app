// Sample data for the console stories and tests. Fictional companies and people only.
import type { CompanyDetail, CompanyRow, PlatformAuditEntry, Product, SupportActivity, SupportSession } from './types';

export const NOW = new Date('2026-10-08T10:00:00+05:30');
export const TODAY = '2026-10-08';
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

export const COMPANIES: CompanyRow[] = [
  { id: 'c1', name: 'Kaveri Foods', slug: 'kaveri-foods', lifecycle: 'active', signInAllowed: true, trialEndsAt: null, createdAt: '2026-06-02T09:00:00Z', products: ['hrms'], employees: 248 },
  { id: 'c2', name: 'Godavari Agro', slug: 'godavari-agro', lifecycle: 'trial', signInAllowed: true, trialEndsAt: '2026-10-30T00:00:00Z', createdAt: '2026-09-30T09:00:00Z', products: ['hrms', 'service_desk'], employees: 12 },
  { id: 'c3', name: 'Malabar Spices Exports', slug: 'malabar-spices', lifecycle: 'suspended', signInAllowed: false, trialEndsAt: null, createdAt: '2025-03-10T09:00:00Z', products: ['hrms'], employees: 96 },
  { id: 'c4', name: 'Konkan Cold Chain', slug: 'konkan-cold', lifecycle: 'closed', signInAllowed: false, trialEndsAt: null, createdAt: '2025-01-15T09:00:00Z', products: ['service_desk'], employees: 0 },
];

export const COMPANY: CompanyDetail = {
  ...COMPANIES[1],
  trialExtended: false,
  lifecycleChangedAt: '2026-09-30T09:00:00Z',
  admins: [{ name: 'Sunita Rao', email: 'sunita.rao@godavari-agro.test', status: 'active' }],
  history: [
    { id: 'h2', action: 'platform.company.trial_extended', by: 'Anand Iyer', at: '2026-10-05T10:30:00Z', details: { days: 7, reason: 'Set-up call booked' } },
    { id: 'h1', action: 'platform.company.created', by: 'Anand Iyer', at: '2026-09-30T09:00:00Z', details: { products: ['hrms', 'service_desk'] } },
  ],
};

export const PRODUCTS: Product[] = [
  {
    code: 'hrms',
    name: 'YukthiX HR',
    unit: 'employee',
    prices: [
      { id: 'p1', currency: 'INR', unitPrice: 99, minimumMonthly: 499, validFrom: '2026-10-01', reason: 'Launch price', createdAt: '2026-10-01T00:00:00Z', state: 'current' },
      { id: 'p2', currency: 'USD', unitPrice: 1, minimumMonthly: 5, validFrom: '2026-10-01', reason: 'Launch price', createdAt: '2026-10-01T00:00:00Z', state: 'current' },
      { id: 'p5', currency: 'INR', unitPrice: 109, minimumMonthly: 549, validFrom: '2027-04-01', reason: 'New financial year', createdAt: '2026-10-07T00:00:00Z', state: 'scheduled' },
    ],
  },
  {
    code: 'service_desk',
    name: 'YukthiX Service Desk',
    unit: 'agent',
    prices: [
      { id: 'p3', currency: 'INR', unitPrice: 999, minimumMonthly: 999, validFrom: '2026-10-01', reason: 'Launch price', createdAt: '2026-10-01T00:00:00Z', state: 'current' },
      { id: 'p4', currency: 'USD', unitPrice: 10, minimumMonthly: 10, validFrom: '2026-10-01', reason: 'Launch price', createdAt: '2026-10-01T00:00:00Z', state: 'current' },
    ],
  },
];

const base = { organizationId: 'c2', company: 'Godavari Agro', requestedByEmail: 'anand.iyer@yukthix.test', ticket: null, decidedBy: null, decidedAt: null, decisionNote: null, startsAt: null, endsAt: null, endedBy: null, endedAt: null };
export const SESSIONS: SupportSession[] = [
  { ...base, id: 's1', mine: true, requestedBy: 'Anand Iyer', reason: 'Payroll run stuck at readiness; need to check the PF mapping', ticket: 'TKT-8841', hours: 24, status: 'approved', decidedBy: 'Sunita Rao', decidedAt: at(-1), startsAt: at(-1), endsAt: at(23), createdAt: at(-2) },
  { ...base, id: 's2', mine: false, requestedBy: 'Kavitha Menon', requestedByEmail: 'kavitha.menon@yukthix.test', reason: 'Leave balances look wrong after import', hours: 4, status: 'ended', decidedBy: 'Sunita Rao', decidedAt: at(-50), startsAt: at(-50), endsAt: at(-46), endedBy: 'Kavitha Menon', endedAt: at(-48), createdAt: at(-51) },
  { ...base, id: 's3', organizationId: 'c1', company: 'Kaveri Foods', mine: true, requestedBy: 'Anand Iyer', reason: 'Location set-up question from the admin', hours: 4, status: 'requested', createdAt: at(-0.5) },
];
export const REQUEST: SupportSession = { ...SESSIONS[2], id: 's4', organizationId: 'c2', company: 'Godavari Agro', mine: undefined };

export const ACTIVITY: SupportActivity[] = [
  { id: 'a1', at: at(-2), action: 'support_session.requested', by: 'Anand Iyer', byYukthix: true, method: null, path: null, details: { hours: 24 } },
  { id: 'a2', at: at(-1), action: 'support_session.approved', by: 'Sunita Rao', byYukthix: false, method: null, path: null, details: { hours: 24 } },
  { id: 'a3', at: at(-0.9), action: 'super_admin.org_switch_in', by: 'Anand Iyer', byYukthix: true, method: null, path: null, details: null },
  { id: 'a4', at: at(-0.8), action: 'support_session.request', by: 'Anand Iyer', byYukthix: true, method: 'GET', path: '/org/legal-entities', details: { method: 'GET', path: '/org/legal-entities' } },
];

export const AUDIT: PlatformAuditEntry[] = [
  { id: 'e3', at: at(-1), action: 'support_session.approved', entityType: 'support_session', entityId: 's1', actor: 'Sunita Rao', actorIsStaff: false, company: 'Godavari Agro', companyId: 'c2', details: { hours: 24 } },
  { id: 'e2', at: at(-20), action: 'platform.company.lifecycle', entityType: 'organization', entityId: 'c3', actor: 'Anand Iyer', actorIsStaff: true, company: 'Malabar Spices Exports', companyId: 'c3', details: { from: 'active', to: 'suspended', reason: 'Invoice 45 days overdue' } },
  { id: 'e1', at: at(-30), action: 'platform.price.scheduled', entityType: 'product_price', entityId: 'p5', actor: 'Anand Iyer', actorIsStaff: true, company: null, companyId: null, details: { product: 'hrms', currency: 'INR', unitPrice: 109, validFrom: '2027-04-01', reason: 'New financial year' } },
];
