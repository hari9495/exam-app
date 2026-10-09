import type { AsOfView, ChangeOptions, ChangeRecord, HistoryView, Impact, PersonOption } from './types';

// Sample data for stories and tests, in the story world (review/RULES.md "Data facts"): today is 29 Sep 2026.
export const TODAY_ISO = '2026-09-29';
const KF = 'le-kfpl';

export const PEOPLE: PersonOption[] = [
  { id: 'p-divya', name: 'Divya Raghunathan', employeeCode: 'KF-0001', legalEntityId: KF, designation: 'Senior QA Engineer', department: 'Quality', location: 'Bengaluru head office' },
  { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntityId: KF, designation: 'Quality Analyst', department: 'Quality', location: 'Bengaluru head office' },
  { id: 'p-meera', name: 'Meera Iyer', employeeCode: 'KF-0118', legalEntityId: KF, designation: 'Lab Analyst', department: 'Quality', location: 'Bengaluru head office' },
];

const header = { id: 'p-arjun', name: 'Arjun Kulkarni', employeeCode: 'KF-0142', legalEntity: { id: KF, name: 'Kaveri Foods Pvt Ltd' }, joinedOn: '2024-07-01', exitedOn: null };
const facts = {
  location: { id: 'loc-blr', name: 'Bengaluru head office', state: 'IN-KA', timezone: 'Asia/Kolkata' },
  department: { id: 'd-qa', name: 'Quality', code: 'QA' },
  designation: { id: 'des-qa', name: 'Quality Analyst', code: 'QA-ANALYST' },
  grade: { id: 'g-g2', name: 'G2 · Executive', code: 'G2' },
  skillClass: 'skilled',
  employmentType: { id: 'et-perm', name: 'Permanent', code: 'PERM' },
  manager: { id: 'p-divya', name: 'Divya Raghunathan' },
  costCentres: [{ id: 'cc-eng', name: 'Engineering Bengaluru', code: 'CC-BLR-ENG', percent: '100.00' }],
};

export const AS_OF: AsOfView = {
  employee: header,
  asOf: TODAY_ISO,
  assignment: { ...facts, validFrom: '2024-07-01', validTo: '2026-10-31' },
  status: { status: 'confirmed', validFrom: '2024-07-01', validTo: null },
  payAccess: true,
  compensation: null,
};
export const AS_OF_PAY: AsOfView = { ...AS_OF, compensation: { currency: 'INR', annualCtc: '583200.00', validFrom: '2026-04-01', validTo: '2026-10-31' } };
export const AS_OF_FUTURE: AsOfView = {
  ...AS_OF,
  asOf: '2026-11-01',
  assignment: { ...facts, designation: { id: 'des-sr', name: 'Senior QA Engineer', code: 'SR-QA-ENG' }, grade: { id: 'g-g3', name: 'G3 · Senior executive', code: 'G3' }, validFrom: '2026-11-01', validTo: null },
};

const change = (over: Partial<ChangeRecord> & Pick<ChangeRecord, 'id' | 'changeType' | 'effectiveDate' | 'status' | 'reason'>): ChangeRecord => ({
  employeeId: 'p-arjun',
  employeeName: 'Arjun Kulkarni',
  overrideReason: null,
  retro: false,
  requestedAt: '2026-09-20T10:00:00.000Z',
  decidedAt: null,
  decisionNote: null,
  touchesPay: false,
  payload: {},
  impact: null,
  ...over,
});

export const CHANGES: ChangeRecord[] = [
  change({ id: 'c-join', changeType: 'join', effectiveDate: '2024-07-01', status: 'effective', reason: 'Joined Kaveri Foods', retro: false, touchesPay: true }),
  change({ id: 'c-inc', changeType: 'salary_revision', effectiveDate: '2026-04-01', status: 'effective', reason: 'Annual increment 2026', touchesPay: true }),
  change({ id: 'c-promo', changeType: 'promotion', effectiveDate: '2026-11-01', status: 'scheduled', reason: 'Promotion after the 2026 review', touchesPay: true }),
  change({ id: 'c-rahul', employeeId: 'p-rahul', employeeName: 'Rahul Sharma', changeType: 'salary_revision', effectiveDate: '2026-12-01', status: 'pending', reason: 'Market correction', touchesPay: true }),
  change({ id: 'c-kavya', employeeId: 'p-kavya', employeeName: 'Kavya Reddy', changeType: 'manager_change', effectiveDate: '2026-10-05', status: 'pending', reason: 'Plant reporting moves to People' }),
  change({ id: 'c-meera', employeeId: 'p-meera', employeeName: 'Meera Iyer', changeType: 'correction', effectiveDate: '2026-04-01', status: 'effective', reason: 'Joining record had the wrong designation', retro: true }),
];

export const HISTORY: HistoryView = {
  employee: header,
  payAccess: true,
  changes: CHANGES.filter((c) => c.employeeId === 'p-arjun'),
  assignment: [
    { id: 'a1', validFrom: '2024-07-01', validTo: '2026-10-31', changeId: 'c-join', recordedAt: '2026-09-28T10:00:00.000Z', supersededAt: null, supersededBy: null, ...facts },
    { id: 'a0', validFrom: '2024-07-01', validTo: null, changeId: 'c-join', recordedAt: '2024-06-20T10:00:00.000Z', supersededAt: '2026-09-28T10:00:00.000Z', supersededBy: { changeId: 'c-fix', type: 'correction', reason: 'Joining record had the wrong grade' }, ...facts, grade: { id: 'g-g1', name: 'G1 · Associate', code: 'G1' } },
  ],
  status: [],
  compensation: [
    { id: 'p1', validFrom: '2024-07-01', validTo: '2026-03-31', changeId: 'c-join', recordedAt: '2024-06-20T10:00:00.000Z', supersededAt: null, supersededBy: null, currency: 'INR', annualCtc: '540000.00' },
    { id: 'p2', validFrom: '2026-04-01', validTo: '2026-10-31', changeId: 'c-inc', recordedAt: '2026-03-20T10:00:00.000Z', supersededAt: null, supersededBy: null, currency: 'INR', annualCtc: '583200.00' },
  ],
};

export const IMPACT: Impact = {
  effectiveDate: '2026-11-01',
  facts: [
    { fact: 'Designation', from: 'Quality Analyst', to: 'Senior QA Engineer' },
    { fact: 'Grade', from: 'G2 · Executive', to: 'G3 · Senior executive' },
  ],
  pay: [{ fact: 'Annual CTC', from: 'INR 583200.00', to: 'INR 780000.00' }],
  rebased: [{ changeId: 'c-dec', changeType: 'salary_revision', effectiveDate: '2026-12-01', facts: [], pay: [{ fact: 'Annual CTC', from: 'INR 618192.00', to: 'INR 826800.00' }] }],
  retro: null,
};

const choice = (value: string, label: string, entities: string[] = []) => ({ value, label, entities });
export const OPTIONS: ChangeOptions = {
  people: PEOPLE,
  locations: [choice('loc-blr', 'Bengaluru head office', [KF]), choice('loc-hsr', 'Hosur plant', ['le-tn'])],
  departments: [choice('d-qa', 'Quality'), choice('d-prod', 'Production', ['le-tn'])],
  designations: [choice('des-qa', 'Quality Analyst'), choice('des-sr', 'Senior QA Engineer')],
  grades: [choice('g-g2', 'G2 · Executive'), choice('g-g3', 'G3 · Senior executive')],
  employmentTypes: [choice('et-perm', 'Permanent')],
  costCentres: [choice('cc-eng', 'CC-BLR-ENG · Engineering Bengaluru', [KF]), choice('cc-plt', 'CC-HSR-PRD · Hosur production', ['le-tn'])],
  canPay: true,
  retroLimit: '2026-04-01',
  today: TODAY_ISO,
};
