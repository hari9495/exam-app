// Sample records in the server's shapes for the HLP-10 / HLP-11 live stories and tests (Kaveri Foods demo people).
import type { LivePolicyAdmin, LivePolicyLibrary } from './helpdesk-policy-live';
import type { MyPolicy, MyPolicyRow, PendingPerson, PolicyAdmin, PolicyRowAdmin, PolicyVersionView } from '../desk/policy-types';

const noop = async () => undefined;

export const MY_POLICY_ROWS: MyPolicyRow[] = [
  { id: 'p1', code: 'POL-01', title: 'Code of conduct', category: 'Conduct', method: 'otp', version: 'v4', versionId: 'v-p1-4', effectiveOn: '2026-10-15', changeSummary: 'Adds social-media conduct and a gifts limit.', status: 'pending', dueOn: '2026-10-29', acknowledgedOn: null, acknowledgedVersion: 'v3' },
  { id: 'p2', code: 'POL-02', title: 'Prevention of sexual harassment (POSH)', category: 'Conduct', method: 'click', version: 'v3', versionId: 'v-p2-3', effectiveOn: '2026-09-01', changeSummary: 'New Internal Committee members; complaint route in the app.', status: 'overdue', dueOn: '2026-09-15', acknowledgedOn: null, acknowledgedVersion: null },
  { id: 'p3', code: 'POL-03', title: 'Leave policy 2026', category: 'Time off', method: 'click', version: 'v2', versionId: 'v-p3-2', effectiveOn: '2026-01-01', changeSummary: 'Earned leave carry-forward limit raised.', status: 'acknowledged', dueOn: null, acknowledgedOn: '2026-01-06', acknowledgedVersion: 'v2' },
  { id: 'p4', code: 'POL-04', title: 'Travel and expenses', category: 'Money', method: 'click', version: 'v5', versionId: 'v-p4-5', effectiveOn: '2026-10-20', changeSummary: 'Hotel caps by city tier.', status: 'pending', dueOn: '2026-11-03', acknowledgedOn: null, acknowledgedVersion: null },
];

const body = '<h3>1. Purpose</h3><p>This policy sets out how everyone at Kaveri Foods Pvt Ltd is expected to behave at work, with customers and with suppliers.</p><h3>2. Who it applies to</h3><p>All employees, trainees and contract workers at every Kaveri Foods location.</p><h3>3. Raising a concern</h3><p>Raise concerns through Helpdesk. You will get a reply within the time the company has set.</p>';

export function myPolicy(id = 'p4', over: Partial<MyPolicy> = {}): MyPolicy {
  const r = MY_POLICY_ROWS.find((x) => x.id === id)!;
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    category: r.category,
    method: r.method,
    owner: 'Lakshmi Venkatesan',
    version: r.version,
    versionId: r.versionId,
    effectiveOn: r.effectiveOn,
    changeSummary: r.changeSummary,
    bodyHtml: body,
    files: [{ id: 'f1', name: 'Gifts register.pdf', size: 182_000, type: 'application/pdf', scan: 'clean' }],
    status: r.status,
    dueOn: r.dueOn,
    acknowledged: r.status === 'acknowledged' ? { version: r.acknowledgedVersion, at: '2026-01-06T05:12:00Z', method: r.method, typedName: null } : null,
    typedName: false,
    myName: 'Divya Raghunathan',
    ...over,
  };
}

export function liveLibrary(over: Partial<LivePolicyLibrary> = {}): LivePolicyLibrary {
  return {
    state: 'ready',
    policies: MY_POLICY_ROWS,
    managerAfterDays: 7,
    openId: null,
    onOpen: () => undefined,
    policy: null,
    onAcknowledge: noop,
    onSendCode: async () => ({ to: 'di•••@kaverifoods.in', minutes: 5 }),
    onOpenFile: () => undefined,
    ...over,
  };
}

export const ADMIN_ROWS: PolicyRowAdmin[] = [
  { id: 'p1', code: 'POL-01', title: 'Code of conduct', category: 'Conduct', method: 'otp', owner: 'Lakshmi Venkatesan', version: 'v4', effectiveOn: '2026-10-15', open: { number: 5, status: 'waiting' }, audience: 248, acknowledged: 171, overdue: 22, dueOn: '2026-10-29' },
  { id: 'p2', code: 'POL-02', title: 'Prevention of sexual harassment (POSH)', category: 'Conduct', method: 'click', owner: 'Lakshmi Venkatesan', version: 'v3', effectiveOn: '2026-09-01', open: null, audience: 248, acknowledged: 219, overdue: 29, dueOn: '2026-09-15' },
  { id: 'p3', code: 'POL-03', title: 'Leave policy 2026', category: 'Time off', method: 'click', owner: 'Lakshmi Venkatesan', version: 'v2', effectiveOn: '2026-01-01', open: null, audience: 248, acknowledged: 248, overdue: 0, dueOn: '2026-01-15' },
  { id: 'p5', code: 'POL-05', title: 'Information security', category: 'IT', method: 'click', owner: 'Joseph Mathew', version: null, effectiveOn: null, open: { number: 1, status: 'draft' }, audience: 0, acknowledged: 0, overdue: 0, dueOn: null },
];

const ver = (n: number, over: Partial<PolicyVersionView> = {}): PolicyVersionView => ({ id: `v-p1-${n}`, number: n, label: `v${n}`, status: 'published', changeSummary: null, reack: true, effectiveOn: null, writtenBy: 'Lakshmi Venkatesan', writtenByMe: false, publishedBy: 'Rekha Iyengar', needsSecondPerson: true, sentBackNote: null, acknowledged: 0, version: 2, ...over });

export function adminPolicy(over: Partial<PolicyAdmin> = {}): PolicyAdmin {
  return {
    id: 'p1',
    code: 'POL-01',
    title: 'Code of conduct',
    category: 'Conduct',
    method: 'otp',
    ownerUserId: 'u-lakshmi',
    owner: 'Lakshmi Venkatesan',
    legalEntityIds: ['le1'],
    locationIds: [],
    departmentIds: [],
    gradeIds: [],
    version: 3,
    current: { ...ver(4, { effectiveOn: '2026-10-15', changeSummary: 'Adds social-media conduct and a gifts limit.', acknowledged: 171 }), bodyHtml: body, files: [] },
    open: null,
    versions: [
      ver(4, { effectiveOn: '2026-10-15', changeSummary: 'Adds social-media conduct and a gifts limit.', acknowledged: 171 }),
      ver(3, { effectiveOn: '2026-04-01', changeSummary: 'Speak-up route in the app.', reack: false, acknowledged: 12 }),
      ver(2, { effectiveOn: '2025-10-01', changeSummary: 'New Internal Committee members.', acknowledged: 230 }),
      ver(1, { effectiveOn: '2025-04-01', acknowledged: 241 }),
    ],
    ackVersion: 'v4',
    audience: 248,
    acknowledged: 171,
    overdue: 22,
    dueOn: '2026-10-29',
    byDept: [
      { departmentId: 'd-eng', dept: 'Engineering', audience: 58, acknowledged: 44 },
      { departmentId: 'd-fin', dept: 'Finance', audience: 18, acknowledged: 17 },
      { departmentId: 'd-ops', dept: 'Operations', audience: 92, acknowledged: 51 },
      { departmentId: 'd-ppl', dept: 'People', audience: 9, acknowledged: 9 },
      { departmentId: 'd-qa', dept: 'Quality', audience: 30, acknowledged: 25 },
      { departmentId: 'd-sal', dept: 'Sales', audience: 41, acknowledged: 25 },
    ],
    settings: { dueDays: 14, everyDays: 3, managerAfterDays: 7, reackDefault: true, typedName: false, secondPerson: true },
    ...over,
  };
}

export const WAITING = { ...ver(5, { status: 'waiting', changeSummary: 'Adds rules for accepting gifts from suppliers.', writtenBy: 'Lakshmi Venkatesan', publishedBy: null, effectiveOn: null, version: 4 }), bodyHtml: body, files: [] };

export const PENDING: PendingPerson[] = [
  { employeeId: 'e1', name: 'Ravi Shankar', code: 'KF-0142', departmentId: 'd-ops', dept: 'Operations', manager: 'Meena Iyer', dueOn: '2026-10-29', daysOverdue: 9, lastRemindedOn: '2026-11-01', managerTold: true },
  { employeeId: 'e2', name: 'Farhan Qureshi', code: 'KF-0188', departmentId: 'd-ops', dept: 'Operations', manager: 'Meena Iyer', dueOn: '2026-10-29', daysOverdue: 5, lastRemindedOn: '2026-11-01', managerTold: false },
  { employeeId: 'e3', name: 'Anita Desai', code: 'KF-0031', departmentId: 'd-fin', dept: 'Finance', manager: 'Suresh Pillai', dueOn: '2026-11-08', daysOverdue: 0, lastRemindedOn: null, managerTold: false },
];

export function liveAdmin(over: Partial<LivePolicyAdmin> = {}): LivePolicyAdmin {
  return {
    state: 'ready',
    canManage: true,
    canPublish: true,
    policies: ADMIN_ROWS,
    policyId: 'p1',
    onOpen: () => undefined,
    policy: adminPolicy(),
    pending: PENDING,
    deptFilter: null,
    onDeptFilter: () => undefined,
    options: {
      legalEntities: [{ id: 'le1', name: 'Kaveri Foods Pvt Ltd' }, { id: 'le2', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }],
      locations: [{ id: 'l1', name: 'Bengaluru' }, { id: 'l2', name: 'Hosur plant' }],
      departments: [{ id: 'd-eng', name: 'Engineering' }, { id: 'd-ops', name: 'Operations' }, { id: 'd-fin', name: 'Finance' }],
      grades: [{ id: 'g1', name: 'G1' }, { id: 'g2', name: 'G2' }],
      owners: [{ id: 'u-lakshmi', name: 'Lakshmi Venkatesan' }],
    },
    onCreate: async () => ({ id: 'p9', code: 'POL-09' }),
    onUpdate: noop,
    onSaveDraft: async () => ({ version: 2 }),
    onUpload: async () => ({ id: 'f9', name: 'annex.pdf', size: 1000, type: 'application/pdf', scan: 'pending' }),
    onRemoveFile: noop,
    onSubmit: noop,
    onPublish: async () => ({ notified: 248 }),
    onSendBack: noop,
    onRemind: async () => ({ sent: 2, skipped: 1 }),
    onExport: noop,
    onOpenFile: () => undefined,
    ...over,
  };
}
