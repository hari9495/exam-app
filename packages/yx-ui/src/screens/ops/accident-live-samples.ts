// Sample records for the HLP-12 live accident screens (stories and tests). Shapes match the API (desk/accidents).
import type { MyCaseAsReporter, MyCaseRow } from './cases-live-types';
import type { AccidentDetail, AccidentFormData, AccidentManagerView, LiveAccidentWorkspace, LiveReportAccident } from './accident-live';

export const ACC_TODAY = '2026-11-04';

export const ACC_FORM: AccidentFormData = {
  locations: [
    { id: 'hsr', name: 'Hosur plant' },
    { id: 'maa', name: 'Chennai office' },
  ],
  me: { id: 'e-ravi', name: 'Ravi K.' },
  injuryTypes: ['Crush', 'Cut', 'Burn', 'Fall', 'Sprain or strain', 'Other'],
  ready: true,
  meEmployeeId: 'e-ravi',
};

export const ACC_DETAIL: AccidentDetail = {
  view: 'team',
  id: 'acc-1',
  number: 'ACC-0001',
  company: 'Kaveri Foods',
  injured: { kind: 'employee', name: 'Sathish Kumar', employeeId: 'e-sathish', contractor: null },
  occurredAt: '2026-11-01T05:00:00.000Z',
  occurredOn: '2026-11-01',
  location: 'Hosur plant',
  place: 'Packing line 2',
  description: 'His left hand was caught in the sealing machine guard while clearing a jam.',
  injuryType: 'Crush',
  bodyPart: 'Left hand',
  firstAid: true,
  witnesses: 'Ravi K.',
  reportedBy: 'Ravi K.',
  filedAt: '2026-11-01T05:20:00.000Z',
  esi: true,
  esiFrom: 'case',
  ipNumber: '3110012345',
  hospital: 'ESI dispensary, Hosur',
  handler: { id: 'u-hr', name: 'Anitha (HR)' },
  leave: { from: '2026-11-02', to: '2026-11-09', days: 8, inTime: { id: 'lr-1', status: 'pending' } },
  statements: [],
  photos: [{ id: 'f-photo', name: 'machine-guard.jpg', size: 120_000, scan: 'clean' }],
  clocks: [{ key: 'esic', label: 'ESIC accident report (employer’s report)', due: '2026-11-02', doneOn: null }],
  source: 'IN.ESI.ACCIDENT 1950-v1 (verify)',
  ec: null,
  esicFiled: null,
  contractorFiled: null,
  contractorNotFiled: false,
  ecOpen: false,
  medical: [{ id: 'm1', kind: 'diagnosis', note: 'Crush injury, fracture of the left index finger', file: { id: 'f-med', name: 'certificate.pdf', sha256: 'a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233445566778', scan: 'clean' }, by: 'Anitha (HR)', at: '2026-11-02T06:00:00.000Z' }],
  members: [
    { name: 'Prakash (Safety officer)', role: 'Safety team', access: 'Full case, medical details' },
    { name: 'Anitha (HR)', role: 'HR (files the reports)', access: 'Full case, medical details' },
    { name: 'The injured person’s manager', role: 'Manager', access: 'Leave dates only' },
  ],
  canAssign: true,
  closed: null,
  users: [
    { id: 'u-hr', name: 'Anitha (HR)' },
    { id: 'u-safety', name: 'Prakash (Safety officer)' },
  ],
};

export const ACC_ESI_UNKNOWN: AccidentDetail = { ...ACC_DETAIL, esi: null, esiFrom: null, ipNumber: null, clocks: [], source: null };
export const ACC_CONTRACT: AccidentDetail = {
  ...ACC_DETAIL,
  id: 'acc-5',
  number: 'ACC-0005',
  injured: { kind: 'contract', name: 'Murugan P.', employeeId: null, contractor: 'Sri Lakshmi Facility Services' },
  clocks: [{ key: 'esic', label: 'ESIC accident report (the contractor files)', due: '2026-11-02', doneOn: null }],
  contractorNotFiled: true,
  leave: { from: '2026-11-02', to: '2026-11-09', days: 8, inTime: null },
  members: ACC_DETAIL.members.slice(0, 2),
};
export const ACC_NON_ESI: AccidentDetail = {
  ...ACC_DETAIL,
  id: 'acc-3',
  number: 'ACC-0003',
  injured: { kind: 'employee', name: 'Naveen Hegde', employeeId: 'e-naveen', contractor: null },
  esi: false,
  clocks: [{ key: 'ec', label: 'Employee’s Compensation payment', due: '2026-11-03', doneOn: null }],
  source: 'IN.EC.CLAIM 2020-v1 (verify)',
  ec: { kind: 'permanent-partial', factor: 197.06, disablementPct: 20, days: null, monthlyWage: 42000, fellDueOn: '2026-10-04', wageUsed: 15000, amount: 354708, formula: '20 % of the permanent total amount (₹1773540)', deadline: '2026-11-03', interest: 3615, paid: null },
};
export const ACC_SUBMITTED: AccidentDetail = { ...ACC_DETAIL, clocks: [{ ...ACC_DETAIL.clocks[0], doneOn: '2026-11-02' }], esicFiled: { on: '2026-11-02', ack: 'ESIC/ACC/2026/0917743' } };
export const ACC_MANAGER: AccidentManagerView = { view: 'manager', id: 'acc-1', number: 'ACC-0001', injuredName: 'Sathish Kumar', leaveFrom: '2026-11-02', leaveTo: '2026-11-09', leaveStatus: 'approved' };

const ok = async () => undefined;
export const liveAccident = (over: Partial<LiveAccidentWorkspace> = {}): LiveAccidentWorkspace => ({
  state: 'ready',
  today: ACC_TODAY,
  detail: ACC_DETAIL,
  onBack: () => undefined,
  onFacts: ok,
  onStatement: ok,
  onFiled: ok,
  onEc: ok,
  onEcPaid: ok,
  onMedical: ok,
  onOpenFile: () => undefined,
  onEsicForm: async () => ({ title: 'ESIC accident report: details to enter on the ESIC portal', fields: [{ label: 'Insured person', value: 'Sathish Kumar' }, { label: 'Insurance number (IP)', value: '3110012345' }] }),
  onClose: ok,
  ...over,
});
export const liveReport = (over: Partial<LiveReportAccident> = {}): LiveReportAccident => ({
  state: 'ready',
  form: ACC_FORM,
  today: new Date(2026, 10, 4),
  onSend: async () => ({ id: 'acc-9', number: 'ACC-0009' }),
  onPhoto: ok,
  onSearchPeople: async (q) => [{ id: 'e-sathish', name: 'Sathish Kumar' }, { id: 'e-ravi', name: 'Ravi K.' }].filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
  onDone: () => undefined,
  ...over,
});

/** Founder answer 45: an accident in the reporter's My cases (status only). */
export const ACC_MY_ROW: MyCaseRow = { id: 'acc-1', ref: 'ACC-0001', kind: 'accident', role: 'reporter', stage: 'Received', status: 'open', next: null, unread: 0 };
export const ACC_MY_DETAIL: MyCaseAsReporter = { id: 'acc-1', ref: 'ACC-0001', kind: 'accident', role: 'reporter', stage: 'Received', status: 'open', openedOn: '2026-11-01', dates: [], datesSource: '', messages: [], outcome: null, appealUntil: null };
