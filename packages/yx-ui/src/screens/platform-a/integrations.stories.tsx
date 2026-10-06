import type { Meta, StoryObj } from '@storybook/react-vite';
import { at, d } from './platform-data';
import {
  AuditLogScreen, BillingScreen, DevelopersScreen, IntegrationsScreen, SupportAccessScreen,
  type ApiKeyRow, type AuditRow, type Connector, type InvoiceRow, type RunRow, type SupportRequest, type WebhookDelivery,
} from './integrations';

const meta: Meta = { title: 'Screens/Platform/Integrations, audit & billing', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

/* PLT-14 */
const CONNECTORS: Connector[] = [
  { id: 'c1', name: 'Hosur plant biometric devices', area: 'Attendance devices', method: 'Agent download', status: 'Degraded', lastRun: at(29, 9, 40), note: '7 devices at gate and canteen' },
  { id: 'c2', name: 'LedgerBook accounting', area: 'Accounting', method: 'OAuth', status: 'Connected', lastRun: at(28, 23, 0), note: 'Payroll and expense journals' },
  { id: 'c3', name: 'Slack', area: 'Chat', method: 'OAuth', status: 'Available', note: 'Approvals, check-in and balances in chat' },
  { id: 'c4', name: 'Teams', area: 'Chat', method: 'OAuth', status: 'Available', note: 'Approvals, check-in and balances in chat' },
  { id: 'c5', name: 'Single sign-on (SAML)', area: 'Sign-in', method: 'API key', status: 'Connected', lastRun: at(29, 8, 0), note: 'Staff sign in with company accounts' },
  { id: 'c6', name: 'NaukriHub job board', area: 'Job boards', method: 'API key', status: 'Broken', lastRun: at(27, 6, 0), note: 'Key expired on 27 Sep' },
  { id: 'c7', name: 'Salary bank file (host-to-host)', area: 'Banking', method: 'Device registration', status: 'Available', note: 'Send payment files directly to your bank' },
];
const RUNS: RunRow[] = [
  { id: 'u1', at: at(29, 9, 40), kind: 'Punch sync', records: 312, errors: 0, status: 'Done' },
  { id: 'u2', at: at(29, 7, 10), kind: 'Punch sync · canteen gate', records: 0, errors: 1, status: 'Failed' },
  { id: 'u3', at: at(29, 6, 40), kind: 'Punch sync', records: 188, errors: 4, status: 'Done' },
  { id: 'u4', at: at(28, 22, 0), kind: 'User list push', records: 412, errors: 0, status: 'Done' },
];
export const PLT14Catalogue: S = { name: 'PLT-14 · Integrations · catalogue & health', render: () => <IntegrationsScreen view="catalogue" connectors={CONNECTORS} runs={RUNS} /> };
export const PLT14Wizard: S = { name: 'PLT-14 · Integrations · connect wizard', render: () => <IntegrationsScreen view="wizard" connectors={CONNECTORS} runs={RUNS} /> };
export const PLT14Mapping: S = { name: 'PLT-14 · Integrations · connect wizard ledger mapping', render: () => <IntegrationsScreen view="wizard" wizardStep="map" connectors={CONNECTORS} runs={RUNS} /> };
export const PLT14Detail: S = { name: 'PLT-14 · Integrations · health, run log, mappings', render: () => <IntegrationsScreen view="detail" connectors={CONNECTORS} runs={RUNS} /> };

/* PLT-15 */
const KEYS: ApiKeyRow[] = [
  { id: 'k1', name: 'Payroll export key', prefix: 'yx_live_kf_7Hq2', scopes: 'payroll.read, employees.read', classes: 'Public, Internal, Confidential', lastUsed: at(29, 6, 0), expires: d(31, 2), status: 'Active' },
  { id: 'k2', name: 'Canteen vendor sync', prefix: 'yx_live_kf_Q81a', scopes: 'employees.read', classes: 'Public, Internal', lastUsed: at(28, 12, 30), expires: d(31, 11), status: 'Active' },
  { id: 'k3', name: 'Old intranet', prefix: 'yx_live_kf_z0Pd', scopes: 'directory.read', classes: 'Public', lastUsed: null, expires: d(1, 7), status: 'Expired' },
];
const HOOKS: WebhookDelivery[] = [
  { id: 'w1', at: at(29, 9, 13), event: 'leave.approved', endpoint: 'hooks.kaverifoods.in', code: 200, attempts: 1, status: 'Delivered' },
  { id: 'w2', at: at(29, 8, 2), event: 'employee.hired', endpoint: 'hooks.kaverifoods.in', code: 503, attempts: 3, status: 'Retrying' },
  { id: 'w3', at: at(28, 17, 44), event: 'payroll.run.approved', endpoint: 'hooks.kaverifoods.in', code: null, attempts: 6, status: 'Failed' },
];
export const PLT15Keys: S = { name: 'PLT-15 · Developers · API keys', render: () => <DevelopersScreen keys={KEYS} deliveries={HOOKS} /> };
export const PLT15Create: S = { name: 'PLT-15 · Developers · create key (scopes, field classes)', render: () => <DevelopersScreen keys={KEYS} deliveries={HOOKS} createOpen /> };
export const PLT15Secret: S = { name: 'PLT-15 · Developers · key shown once', render: () => <DevelopersScreen keys={KEYS} deliveries={HOOKS} newSecret /> };
export const PLT15OAuth: S = { name: 'PLT-15 · Developers · connected OAuth apps', render: () => <DevelopersScreen tab="oauth" keys={KEYS} deliveries={HOOKS} /> };
export const PLT15Webhooks: S = { name: 'PLT-15 · Developers · webhooks, delivery log, replay', render: () => <DevelopersScreen tab="webhooks" keys={KEYS} deliveries={HOOKS} /> };
export const PLT15Usage: S = { name: 'PLT-15 · Developers · usage', render: () => <DevelopersScreen tab="usage" keys={KEYS} deliveries={HOOKS} /> };
export const PLT15Empty: S = { name: 'PLT-15 · Developers · no keys', render: () => <DevelopersScreen keys={[]} deliveries={[]} /> };

/* PLT-16 */
const AUDIT: AuditRow[] = [
  {
    id: 'au1', at: at(29, 9, 21), actor: 'Lakshmi Venkatesan', actorRole: 'HR Business Partner', category: 'Data change', action: 'Changed salary bank account', subject: 'Anita Desai (KF-0077)', channel: 'Web',
    diff: [{ field: 'Bank account', before: 'XXXX4417 · Canara Bank', after: 'XXXX9023 · Union Bank' }, { field: 'IFSC', before: 'CNRB0001234', after: 'UBIN0555123' }],
  },
  { id: 'au2', at: at(29, 9, 12), actor: 'Karthik Subramanian', actorRole: 'Head of Quality', category: 'Approval', action: 'Approved casual leave LV-26-01838', subject: 'Meera Krishnan', channel: 'Mobile' },
  { id: 'au3', at: at(29, 8, 55), actor: 'Suresh Pillai', actorRole: 'Payroll Manager', category: 'Sensitive view', action: 'Viewed salary', subject: 'Vikram Rao (KF-0150)', channel: 'Web' },
  { id: 'au4', at: at(29, 8, 40), actor: 'Suresh Pillai', actorRole: 'Payroll Manager', category: 'Export', action: 'Exported payroll register · 248 rows', subject: 'September 2026 run', channel: 'Web' },
  {
    id: 'au5', at: at(28, 18, 2), actor: 'Farhan Sheikh', actorRole: 'HR Executive', category: 'Configuration', action: 'Changed approval policy Expense claim to v4', subject: 'Approval policies', channel: 'Web',
    diff: [{ field: 'Step 2', before: 'Finance team', after: 'Department head' }, { field: 'Monthly CTC', before: '₹1,20,000', after: '₹1,32,000' }],
  },
  { id: 'au6', at: at(28, 7, 58), actor: 'Vikram Rao', actorRole: 'Plant Supervisor', category: 'Access & security', action: 'Failed sign-in (wrong passkey) · 3 times', subject: 'Own account', channel: 'Mobile' },
  { id: 'au7', at: at(27, 23, 30), actor: 'Suresh Pillai', actorRole: 'Payroll Manager', category: 'Lock', action: 'Locked August 2026 attendance', subject: 'All entities', channel: 'Web' },
];
export const PLT16List: S = { name: 'PLT-16 · Audit log', render: () => <AuditLogScreen rows={AUDIT} /> };
export const PLT16Diff: S = { name: 'PLT-16 · Audit log · diff viewer', render: () => <AuditLogScreen rows={AUDIT} openId="au1" /> };
export const PLT16Masked: S = { name: 'PLT-16 · Audit log · diff masked for reader', render: () => <AuditLogScreen rows={AUDIT} openId="au5" masked /> };
export const PLT16Broken: S = { name: 'PLT-16 · Audit log · chain check failed', render: () => <AuditLogScreen rows={AUDIT} chain="broken" /> };
export const PLT16Empty: S = { name: 'PLT-16 · Audit log · empty', render: () => <AuditLogScreen rows={[]} /> };
export const PLT16Loading: S = { name: 'PLT-16 · Audit log · loading', render: () => <AuditLogScreen rows={AUDIT} state="loading" /> };
export const PLT16Error: S = { name: 'PLT-16 · Audit log · error', render: () => <AuditLogScreen rows={AUDIT} state="error" /> };

/* PLT-17 */
const SUPPORT: SupportRequest[] = [
  { id: 'sp1', ticket: 'YXS-40218', agent: 'Anand Iyer (YukthiX)', reason: 'Check why PF is calculated on ₹15,000 for 3 employees in the September run', scope: 'Payroll settings and September run · Kaveri Foods Pvt Ltd', requested: at(29, 9, 5), hours: 24, status: 'Requested' },
  { id: 'sp2', ticket: 'YXS-40102', agent: 'Meenal Shah (YukthiX)', reason: 'Device sync failing at Hosur plant', scope: 'Integrations and attendance punches · Hosur plant', requested: at(27, 11, 0), hours: 24, status: 'Active', endsAt: at(30, 11, 0) },
  { id: 'sp3', ticket: 'YXS-39877', agent: 'Anand Iyer (YukthiX)', reason: 'Leave balance import mismatch', scope: 'Leave balances', requested: at(12, 15, 0), hours: 4, status: 'Ended' },
];
export const PLT17List: S = { name: 'PLT-17 · Support access · requests', render: () => <SupportAccessScreen rows={SUPPORT} /> };
export const PLT17Approve: S = { name: 'PLT-17 · Support access · approve window', render: () => <SupportAccessScreen rows={SUPPORT} approveId="sp1" /> };
export const PLT17Activity: S = { name: 'PLT-17 · Support access · session activity', render: () => <SupportAccessScreen rows={SUPPORT} activeId="sp2" /> };
export const PLT17Empty: S = { name: 'PLT-17 · Support access · empty', render: () => <SupportAccessScreen rows={[]} /> };

/* PLT-19 */
const INVOICES: InvoiceRow[] = [
  { id: 'i1', number: 'YX/26-27/004812', period: 'Sep 2026', amount: 22320, gst: 4018, status: 'Due soon', date: d(29) },
  { id: 'i2', number: 'YX/26-27/003977', period: 'Aug 2026', amount: 21960, gst: 3953, status: 'Paid', date: d(31, 7) },
  { id: 'i3', number: 'YX/26-27/003101', period: 'Jul 2026', amount: 21600, gst: 3888, status: 'Paid', date: d(31, 6) },
];
export const PLT19Plan: S = { name: 'PLT-19 · Billing · plan & add-ons', render: () => <BillingScreen invoices={INVOICES} /> };
export const PLT19Usage: S = { name: 'PLT-19 · Billing · usage vs fair use', render: () => <BillingScreen tab="usage" invoices={INVOICES} /> };
export const PLT19Invoices: S = { name: 'PLT-19 · Billing · invoices', render: () => <BillingScreen tab="invoices" invoices={INVOICES} /> };
export const PLT19Units: S = { name: 'PLT-19 · Billing · billable people', render: () => <BillingScreen tab="units" invoices={INVOICES} /> };
export const PLT19Sandbox: S = { name: 'PLT-19 · Sandbox · clone, dry run', render: () => <BillingScreen tab="sandbox" invoices={INVOICES} sandbox /> };
export const PLT19Promote: S = { name: 'PLT-19 · Sandbox · promote wizard', render: () => <BillingScreen invoices={INVOICES} sandbox promoteStep="diff" /> };
