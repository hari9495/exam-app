// Sample rule store data for the C-1 states of YX-01 to YX-03 (stories and tests).
import type { LiveGoldenRun, LiveImpact, LiveRuleDetail, LiveRuleRow } from './console-rules-live';

export const STAFF = { anand: 'u-anand', farah: 'u-farah' };

const PT_VALUES = { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs: [{ from: '0', to: '29999.99', amount: '0' }, { from: '30000', to: null, amount: '200' }] };
const PT_OLD = { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs: [{ from: '0', to: '24999.99', amount: '0' }, { from: '25000', to: null, amount: '200' }] };
const GOLDEN = [
  { name: 'Gross 24,000 in April: 0', fn: 'pt', input: { ptWage: '24000', month: 4 }, expected: { amount: '0' } },
  { name: 'Gross 30,000 in April: 200', fn: 'pt', input: { ptWage: '30000', month: 4 }, expected: { amount: '200' } },
  { name: 'Gross 30,000 in February: 300', fn: 'pt', input: { ptWage: '30000', month: 2 }, expected: { amount: '300' } },
];

export const LIVE_ROWS: LiveRuleRow[] = [
  { id: 'r1', statute: 'IN.PT', jurisdiction: 'IN-KA', version: 'v2027-04', kind: 'pt', validFrom: '2027-04-01', validTo: null, state: 'in review', lawVersion: 'OLD-ACT', transitional: false, draftedBy: STAFF.anand, draftedByName: 'Anand Iyer', reviewedByName: null, sentForReviewAt: '2026-11-11T09:30:00.000Z', changeNote: 'Karnataka raised the PT threshold to ₹30,000.', golden: 3 },
  { id: 'r2', statute: 'IN.PT', jurisdiction: 'IN-KA', version: 'v2026-04', kind: 'pt', validFrom: '2026-04-01', validTo: null, state: 'published', lawVersion: 'OLD-ACT', transitional: false, draftedBy: STAFF.farah, draftedByName: 'Farah Siddiqui', reviewedByName: 'Anand Iyer', sentForReviewAt: '2026-03-02T09:30:00.000Z', changeNote: null, golden: 2 },
  { id: 'r3', statute: 'IN.PF', jurisdiction: 'IN', version: 'v2026-10', kind: 'pf', validFrom: '2026-10-01', validTo: null, state: 'changes requested', lawVersion: 'CODE', transitional: true, draftedBy: STAFF.anand, draftedByName: 'Anand Iyer', reviewedByName: null, sentForReviewAt: '2026-11-10T11:00:00.000Z', changeNote: 'Code on Social Security rates.', golden: 2 },
];

export const LIVE_DETAIL: LiveRuleDetail = {
  ...LIVE_ROWS[0]!,
  values: PT_VALUES,
  source: 'Karnataka Gazette notification FD 12 PTX 2026, 12 Sep 2026 (gazette.karnataka.example/2026/fd12).',
  verify: true,
  review: null,
  previous: { version: 'v2026-04', validFrom: '2026-04-01', values: PT_OLD },
  golden: GOLDEN,
};

/** Sent back with a note (answer 1042), seen by its drafter. */
export const LIVE_CHANGES: LiveRuleDetail = {
  ...LIVE_DETAIL,
  state: 'changes requested',
  review: { note: 'Add the February case: Karnataka collects ₹300 in February so the year totals ₹2,500.', by: 'Farah Siddiqui', at: '2026-11-11T10:05:00.000Z' },
};

/** A kind the slab grid does not draw: the values as data. */
export const LIVE_PF: LiveRuleDetail = {
  ...LIVE_ROWS[2]!,
  state: 'draft',
  values: { kind: 'pf', employeeRate: '0.12', employerRate: '0.12', epsRate: '0.0833', edliRate: '0.005', adminRate: '0.005', wageCeiling: '15000' },
  source: 'Code on Social Security 2020, s.16 and the EPF scheme; notification G.S.R. 0000(E).',
  verify: true,
  review: null,
  previous: null,
  golden: [{ name: '15,000 basic: 1,800', fn: 'pf', input: { pfWage: '15000' }, expected: { employee: '1800' } }],
};

export const LIVE_RUN: LiveGoldenRun = {
  ranAt: '2026-11-12T04:01:00.000Z',
  problems: [],
  passed: 2,
  total: 3,
  cases: [
    { id: 'c1', name: GOLDEN[0]!.name, input: GOLDEN[0]!.input, expected: GOLDEN[0]!.expected, actual: { amount: '0' }, pass: true },
    { id: 'c2', name: GOLDEN[1]!.name, input: GOLDEN[1]!.input, expected: GOLDEN[1]!.expected, actual: { amount: '200' }, pass: true },
    { id: 'c3', name: GOLDEN[2]!.name, input: GOLDEN[2]!.input, expected: GOLDEN[2]!.expected, actual: { amount: '200' }, pass: false },
  ],
};

export const LIVE_IMPACT: LiveImpact = {
  countable: true,
  companies: 1_184,
  employees: 2_14_630,
  bySize: [
    { size: 'Under 50', companies: 702, employees: 14_210 },
    { size: '50–200', companies: 311, employees: 33_980 },
    { size: '200–1,000', companies: 142, employees: 61_440 },
    { size: '1,000+', companies: 29, employees: 1_05_000 },
  ],
  pastDated: false,
  validFrom: '2027-04-01',
};
