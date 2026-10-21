import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContractReportsLiveScreen, RegistersLiveScreen, VendorComplianceLiveScreen, type ComplianceView, type ProofDetail, type RegistersView, type ReportsView } from './compliance-live';

// CLB-03, CLB-04 and the contract labour Reports, live (founder decision 21 Oct 2026). The registers that need data not
// recorded yet (muster roll, wages, deductions, overtime) say so; Reports is designed here in the expense reports' layout.
const meta: Meta = { title: 'Screens/Contract labour/Live 2', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const ok = async () => ({});
const TODAY = '2026-10-21';
const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const st = (statuses: ComplianceView['matrix'][number]['statuses'][number]['status'][], ids = true) => (['pf', 'esi', 'wage_register', 'wage_payment', 'pt_lwf'] as const).map((type, i) => ({ type, status: statuses[i], proofId: ids && !['open', 'overdue'].includes(statuses[i]) ? `${type}-${i}` : null }));
const VIEW: ComplianceView = {
  month: '2026-09',
  dueOn: '2026-10-15',
  wageDueOn: '2026-10-07',
  proofTypes: ['pf', 'esi', 'wage_register', 'wage_payment', 'pt_lwf'],
  matrix: [
    { contractorId: 'c1', contractor: 'Sri Lakshmi Facility Services', workers: 2, statuses: st(['verified', 'verified', 'verified', 'verified', 'not_required']), held: false, released: null, standing: 'compliant', documents: { total: 2, verified: 2, expiring: 0, expired: 0 } },
    { contractorId: 'c2', contractor: 'Vetri Security Agency', workers: 2, statuses: st(['verified', 'discrepancy', 'submitted', 'overdue', 'overdue']), held: true, released: null, standing: 'action_needed', documents: { total: 1, verified: 0, expiring: 1, expired: 0 } },
    { contractorId: 'c3', contractor: 'Annapoorna Canteen Services', workers: 1, statuses: st(['submitted', 'submitted', 'overdue', 'overdue', 'overdue']), held: true, released: null, standing: 'action_needed', documents: { total: 1, verified: 0, expiring: 0, expired: 0 } },
  ],
  alerts: [
    { key: 'a1', type: 'Short ESI challan', contractorId: 'c2', contractor: 'Vetri Security Agency', month: '2026-09', detail: 'Challan covers 1 workers; 2 were deployed', liability: 650, severity: 'High' },
    { key: 'a2', type: 'Wages not paid by the wage date', contractorId: 'c2', contractor: 'Vetri Security Agency', month: '2026-09', detail: 'No verified payment proof by 7 Oct 2026', liability: 32480, severity: 'High' },
  ],
};
const PROOF: ProofDetail = {
  id: 'esi-1',
  contractorId: 'c2',
  contractor: 'Vetri Security Agency',
  month: '2026-09',
  proofType: 'esi',
  status: 'submitted',
  reference: '26091544901',
  amount: '650.00',
  workersCovered: 1,
  paidOn: null,
  note: null,
  hasFile: true,
  submittedBy: 'Lakshmi Venkatesan',
  submittedOn: '2026-10-14',
  mine: false,
  checks: [
    { id: 'period', status: 'pass', label: 'For Sep 2026 wages' },
    { id: 'code', status: 'pass', label: "Employer code on the contractor's record (51000812300001001)", detail: 'Compare it with the code on the challan.' },
    { id: 'covered', status: 'fail', label: 'Workers covered ≥ workers deployed', detail: 'Covers 1; 2 were deployed in Sep 2026. Short by 1.' },
  ],
};
const compliance = { state: 'ready' as const, today: TODAY, months: MONTHS, month: '2026-09', onMonth: () => {}, view: VIEW, canSubmit: true, canVerify: true, onProof: async () => PROOF, onAddProof: ok, onDecideProof: ok, onRelease: ok, onResolve: ok, onDocuments: async () => [], onAddDocument: ok, onDecideDocument: ok };
export const Compliance: S = { name: 'CLB-03 · Vendor compliance, live', render: () => <VendorComplianceLiveScreen {...compliance} /> };
export const ComplianceVerify: S = { name: 'CLB-03 · Vendor compliance, live · verify (short challan)', render: () => <VendorComplianceLiveScreen {...compliance} defaultProof={PROOF} /> };
export const ComplianceReadOnly: S = { name: 'CLB-03 · Vendor compliance, live · plant HR (read only)', render: () => <VendorComplianceLiveScreen {...compliance} canSubmit={false} canVerify={false} /> };
export const ComplianceEmpty: S = { name: 'CLB-03 · Vendor compliance, live · no contractors', render: () => <VendorComplianceLiveScreen {...compliance} view={{ ...VIEW, matrix: [], alerts: [] }} /> };

const REG: RegistersView = {
  month: '2026-09',
  establishments: [{ id: 'hsr', name: 'Hosur plant' }, { id: 'blr', name: 'Bengaluru head office' }],
  chart: { months: MONTHS, sites: [{ siteId: 'hsr', site: 'Hosur plant', values: [2, 3, 4, 4, 4, 4] }, { siteId: 'blr', site: 'Bengaluru head office', values: [0, 0, 1, 1, 1, 2] }] },
  registers: [
    { id: 'r1', kind: 'contractors', name: 'Register of contractors', siteId: 'hsr', site: 'Hosur plant', contractorId: null, period: '2026-09', format: 'CLRA Central Rules 1971 · Form XII', status: 'ready', rows: 2, why: null },
    { id: 'r2', kind: 'workmen', name: 'Register of workmen, Sri Lakshmi Facility Services', siteId: 'hsr', site: 'Hosur plant', contractorId: 'c1', period: '2026-09', format: 'CLRA Central Rules 1971 · Form XIII', status: 'ready', rows: 2, why: null },
    { id: 'r3', kind: 'muster', name: 'Muster roll', siteId: 'hsr', site: 'Hosur plant', contractorId: null, period: '2026-09', format: 'CLRA Central Rules 1971 · Form XVI', status: 'no_data', rows: 0, why: 'Needs daily attendance of contract workers (gate or kiosk punches), which is not recorded yet.' },
    { id: 'r4', kind: 'wages', name: 'Register of wages', siteId: 'hsr', site: 'Hosur plant', contractorId: null, period: '2026-09', format: 'CLRA Central Rules 1971 · Form XVII', status: 'no_data', rows: 0, why: "Needs each worker's wage lines from the contractors, which are not uploaded yet." },
  ],
};
const registers = { state: 'ready' as const, months: MONTHS, month: '2026-09', onMonth: () => {}, view: REG, returns: [{ siteId: 'hsr', site: 'Hosur plant', year: 2026, contractors: 2, workers: 5, maxOnAnyDay: 4, deployedDays: 912, daysWorked: null, dueOn: '2027-02-15' }], year: 2026, onDownload: () => {}, onInspectionPack: () => {}, onReturnFile: () => {} };
export const Registers: S = { name: 'CLB-04 · Registers & returns, live', render: () => <RegistersLiveScreen {...registers} /> };
export const Returns: S = { name: 'CLB-04 · Registers & returns, live · annual return', render: () => <RegistersLiveScreen {...registers} defaultTab="returns" /> };

const REP: ReportsView = {
  month: '2026-10',
  months: MONTHS,
  headcount: [
    { contractorId: 'c1', contractor: 'Sri Lakshmi Facility Services', values: [1, 2, 2, 2, 2, 2] },
    { contractorId: 'c2', contractor: 'Vetri Security Agency', values: [1, 1, 2, 2, 2, 2] },
    { contractorId: 'c3', contractor: 'Annapoorna Canteen Services', values: [0, 0, 1, 1, 1, 2] },
  ],
  movements: MONTHS.map((m, i) => ({ month: m, deployed: [1, 1, 2, 0, 0, 1][i], released: [0, 0, 0, 0, 0, 1][i] })),
  licences: [
    { id: 'l1', licenceNo: 'TN/OSH/CL/2026/1180', contractor: 'Sri Lakshmi Facility Services', site: 'Hosur plant', maxWorkers: 30, active: 2, validTo: '2026-12-31' },
    { id: 'l2', licenceNo: 'TN/CLRA/2024/0442', contractor: 'Vetri Security Agency', site: 'Hosur plant', maxWorkers: 20, active: 3, validTo: '2026-11-20' },
  ],
  compliance: [
    { contractorId: 'c1', contractor: 'Sri Lakshmi Facility Services', verified: 5, submitted: 0, discrepancy: 0, missing: 0 },
    { contractorId: 'c2', contractor: 'Vetri Security Agency', verified: 1, submitted: 1, discrepancy: 1, missing: 2 },
  ],
};
const reports = { state: 'ready' as const, today: TODAY, months: MONTHS, month: '2026-10', onMonth: () => {}, scopeLabel: 'All entities', view: REP };
export const Reports: S = { name: 'Contract labour reports, live · headcount', render: () => <ContractReportsLiveScreen {...reports} /> };
export const ReportsLicences: S = { name: 'Contract labour reports, live · licence use', render: () => <ContractReportsLiveScreen {...reports} defaultTab="licences" /> };
export const ReportsCompliance: S = { name: 'Contract labour reports, live · compliance', render: () => <ContractReportsLiveScreen {...reports} defaultTab="compliance" /> };
