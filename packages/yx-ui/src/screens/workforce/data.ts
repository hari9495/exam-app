// Story and test data for the people-core screens (fictional Kaveri Foods, RULES.md data facts).
import type { BulkResult, ChangeBatch, DirectoryPage, OrgChartData, PersonRecord, ProbationRow, Ref, TeamMember } from './types';
import type { PersonOption } from '../history/types';

export const TODAY_ISO = '2026-09-29';
const ref = (id: string, name: string): Ref => ({ id, name });
const KF = ref('le-kf', 'Kaveri Foods Pvt Ltd');
const KFT = ref('le-kft', 'Kaveri Foods Pvt Ltd (Tamil Nadu)');
const BLR = ref('loc-blr', 'Bengaluru head office');
const HSR = ref('loc-hsr', 'Hosur plant');
const QA = ref('dep-qa', 'Quality');
const PPL = ref('dep-ppl', 'People');
const PROD = ref('dep-prod', 'Production');
const RAMESH = ref('p-ramesh', 'Ramesh Iyengar');
const DIVYA = ref('p-divya', 'Divya Raghunathan');
const LAKSHMI = ref('p-lakshmi', 'Lakshmi Venkatesan');
const ARJUN = ref('p-arjun', 'Arjun Kulkarni');

export const CHOICES = { legalEntities: [KF, KFT], departments: [PPL, PROD, QA], locations: [BLR, HSR] };

export const DIRECTORY: DirectoryPage = {
  total: 6,
  limit: 50,
  offset: 0,
  people: [
    { id: ARJUN.id, name: ARJUN.name!, workEmail: 'arjun.kulkarni@kaverifoods.test', designation: ref('des-qa', 'Quality Analyst'), department: QA, location: BLR, legalEntity: KF, manager: DIVYA },
    { id: DIVYA.id, name: DIVYA.name!, workEmail: 'divya.raghunathan@kaverifoods.test', designation: ref('des-sqa', 'Senior QA Engineer'), department: QA, location: BLR, legalEntity: KF, manager: RAMESH },
    { id: 'p-kavya', name: 'Kavya Reddy', workEmail: 'kavya.reddy@kaverifoods.test', designation: ref('des-sup', 'Production Supervisor'), department: PROD, location: HSR, legalEntity: KFT, manager: DIVYA },
    { id: 'p-kiran', name: 'Kiran Joshi', workEmail: 'kiran.joshi@kaverifoods.test', designation: ref('des-qa', 'Quality Analyst'), department: QA, location: BLR, legalEntity: KF, manager: DIVYA },
    { id: LAKSHMI.id, name: LAKSHMI.name!, workEmail: 'lakshmi.venkatesan@kaverifoods.test', designation: ref('des-hrbp', 'HR Business Partner'), department: PPL, location: BLR, legalEntity: KF, manager: RAMESH },
    { id: RAMESH.id, name: RAMESH.name!, workEmail: 'ramesh.iyengar@kaverifoods.test', designation: ref('des-md', 'Managing Director'), department: PPL, location: BLR, legalEntity: KF, manager: null },
  ],
};

export const DIRECTORY_HR: DirectoryPage = {
  ...DIRECTORY,
  people: DIRECTORY.people.map((p, i) => ({ ...p, employeeCode: ['KF-0142', 'KF-0001', 'KFT-0031', 'KF-0151', 'KF-0012', 'KF-0002'][i], joinedOn: ['2024-07-01', '2021-01-11', '2025-09-15', '2026-04-15', '2019-06-03', '2014-04-01'][i] })),
};

export const PERSON: PersonRecord = {
  id: 'person-arjun',
  givenName: 'Arjun',
  familyName: 'Kulkarni',
  preferredName: null,
  primaryEmail: 'arjun.kulkarni@kaverifoods.test',
  primaryPhone: '+919845012345',
  status: 'active',
  loginLinked: true,
  roles: [
    { id: 'r1', roleType: 'candidate', startOn: '2024-05-02', endOn: '2024-06-20', label: null },
    { id: 'r2', roleType: 'employee', startOn: '2024-07-01', endOn: null, label: 'KF-0142 · Kaveri Foods Pvt Ltd' },
    { id: 'r3', roleType: 'login', startOn: '2024-07-01', endOn: null, label: 'arjun.kulkarni@kaverifoods.test' },
  ],
};

const node = (id: string, name: string, designation: string, department: Ref, managerId: string | null, directReports: number, dotted: string[] = [], location = BLR) => ({
  id,
  name,
  designation: ref(`des-${id}`, designation),
  department,
  location,
  legalEntity: location === HSR ? KFT : KF,
  managerId,
  dottedLineManagerIds: dotted,
  directReports,
});
export const ORG_CHART: OrgChartData = {
  asOf: TODAY_ISO,
  truncated: false,
  nodes: [
    node(RAMESH.id, RAMESH.name!, 'Managing Director', PPL, null, 2),
    node(LAKSHMI.id, LAKSHMI.name!, 'HR Business Partner', PPL, RAMESH.id, 0),
    node(DIVYA.id, DIVYA.name!, 'Senior QA Engineer', QA, RAMESH.id, 3),
    node(ARJUN.id, ARJUN.name!, 'Quality Analyst', QA, DIVYA.id, 1, [LAKSHMI.id]),
    node('p-meera', 'Meera Iyer', 'Lab Analyst', QA, ARJUN.id, 0),
    node('p-kiran', 'Kiran Joshi', 'Quality Analyst', QA, DIVYA.id, 0),
    node('p-kavya', 'Kavya Reddy', 'Production Supervisor', PROD, DIVYA.id, 0, [], HSR),
  ],
};

export const TEAM: TeamMember[] = [
  { id: ARJUN.id, name: ARJUN.name!, employeeCode: 'KF-0142', relation: 'direct', designation: ref('des-qa', 'Quality Analyst'), department: QA, location: BLR, manager: DIVYA, joinedOn: '2024-07-01', status: 'confirmed', probationEndsOn: null },
  { id: 'p-kiran', name: 'Kiran Joshi', employeeCode: 'KF-0151', relation: 'direct', designation: ref('des-qa', 'Quality Analyst'), department: QA, location: BLR, manager: DIVYA, joinedOn: '2026-04-15', status: 'probation', probationEndsOn: '2026-10-14' },
  { id: 'p-kavya', name: 'Kavya Reddy', employeeCode: 'KFT-0031', relation: 'direct', designation: ref('des-sup', 'Production Supervisor'), department: PROD, location: HSR, manager: DIVYA, joinedOn: '2025-09-15', status: 'confirmed', probationEndsOn: null },
  { id: 'p-meera', name: 'Meera Iyer', employeeCode: 'KF-0118', relation: 'indirect', designation: ref('des-lab', 'Lab Analyst'), department: QA, location: BLR, manager: ARJUN, joinedOn: '2026-04-01', status: 'confirmed', probationEndsOn: null },
  { id: 'p-imran', name: 'Imran Qureshi', employeeCode: 'KF-0167', relation: 'dotted', designation: ref('des-qa', 'Quality Analyst'), department: QA, location: BLR, manager: LAKSHMI, joinedOn: '2025-02-03', status: 'confirmed', probationEndsOn: null },
];

const probation = (over: Partial<ProbationRow>): ProbationRow => ({
  employeeId: 'p-kiran',
  name: 'Kiran Joshi',
  employeeCode: 'KF-0151',
  startOn: '2026-04-15',
  originalEndOn: '2026-10-14',
  plannedEndOn: '2026-10-14',
  extendedMonths: 0,
  reviewDueOn: '2026-09-29',
  escalatedOn: null,
  confirmedFrom: null,
  pendingConfirmationId: null,
  stage: 'review_due',
  maxTotalMonths: 12,
  ...over,
});
export const PROBATIONS: ProbationRow[] = [
  probation({}),
  probation({ employeeId: 'p-ravi', name: 'Ravi Kumar', employeeCode: 'KF-0160', startOn: '2026-03-02', originalEndOn: '2026-09-01', plannedEndOn: '2026-09-01', reviewDueOn: '2026-08-17', escalatedOn: '2026-09-01', stage: 'overdue' }),
  probation({ employeeId: 'p-neha', name: 'Neha Sharma', employeeCode: 'KF-0158', startOn: '2026-02-02', originalEndOn: '2026-08-01', plannedEndOn: '2026-11-01', extendedMonths: 3, reviewDueOn: '2026-10-17', stage: 'extended' }),
  probation({ employeeId: 'p-sana', name: 'Sana Khan', employeeCode: 'KF-0155', startOn: '2026-03-16', originalEndOn: '2026-09-15', plannedEndOn: '2026-09-15', reviewDueOn: '2026-08-31', pendingConfirmationId: 'ch-9', stage: 'awaiting_approval' }),
  probation({ employeeId: 'p-meera', name: 'Meera Iyer', employeeCode: 'KF-0118', startOn: '2026-04-01', originalEndOn: '2026-09-30', plannedEndOn: '2026-09-30', reviewDueOn: '2026-09-15', confirmedFrom: '2026-10-01', stage: 'confirmed' }),
];

export const PEOPLE: PersonOption[] = TEAM.map((m) => ({ id: m.id, name: m.name, employeeCode: m.employeeCode, legalEntityId: m.location?.id === HSR.id ? KFT.id : KF.id, designation: m.designation?.name ?? null, department: m.department?.name ?? null, location: m.location?.name ?? null }));

export const BULK_RESULT: BulkResult = {
  batch: null,
  errors: 1,
  rows: [
    {
      line: 2,
      employeeId: ARJUN.id,
      employeeCode: 'KF-0142',
      name: ARJUN.name,
      changeType: 'transfer',
      effectiveDate: '2026-11-01',
      ok: true,
      error: null,
      impact: { effectiveDate: '2026-11-01', facts: [{ fact: 'Location', from: 'Bengaluru head office', to: 'Hosur plant' }], pay: [], rebased: [], retro: null },
    },
    { line: 3, employeeId: null, employeeCode: 'KF-0999', name: null, changeType: 'transfer', effectiveDate: '2026-11-01', ok: false, error: 'No current employee with the code KF-0999.', impact: null },
  ],
};

export const BATCHES: ChangeBatch[] = [
  { id: 'b-1', status: 'pending', source: 'csv', fileName: 'q3-reorg.csv', reason: 'Quality team moves to Hosur', rowCount: 2, requestedBy: 'u-lakshmi', requestedAt: '2026-09-28T10:12:00Z', decidedAt: null, decisionNote: null, touchesPay: false },
  { id: 'b-2', status: 'approved', source: 'reassign', fileName: null, reason: 'Divya moves to projects', rowCount: 3, requestedBy: 'u-lakshmi', requestedAt: '2026-09-20T09:00:00Z', decidedAt: '2026-09-21T09:00:00Z', decisionNote: null, touchesPay: false },
];
export const BATCH_DETAIL: ChangeBatch = {
  ...BATCHES[0],
  changes: [
    {
      id: 'c-1',
      employeeId: ARJUN.id,
      employeeName: ARJUN.name,
      changeType: 'transfer',
      effectiveDate: '2026-11-01',
      status: 'pending',
      reason: 'Quality team moves to Hosur',
      overrideReason: null,
      retro: false,
      requestedAt: '2026-09-28T10:12:00Z',
      decidedAt: null,
      decisionNote: null,
      touchesPay: false,
      batchId: 'b-1',
      payload: {},
      impact: null,
    },
  ],
};
