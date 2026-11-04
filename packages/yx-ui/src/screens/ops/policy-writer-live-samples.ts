// HLP-14 sample records (the shapes GET desk/policy-writer and GET desk/policy-writer/drafts/:id send), for tests and stories.
import type { LivePolicyWriter, WriterDraft, WriterHome } from './policy-writer-live';

export const WRITER_HOME: WriterHome = {
  ai: 'on',
  latest: null,
  options: {
    types: [
      { value: 'leave', label: 'Leave' },
      { value: 'work_from_home', label: 'Work from home' },
      { value: 'notice', label: 'Notice and probation' },
    ],
    industries: [
      { value: 'fmcg', label: 'Food and consumer goods' },
      { value: 'it_services', label: 'IT services' },
    ],
    states: [
      { value: 'IN-KA', label: 'Karnataka' },
      { value: 'IN-TN', label: 'Tamil Nadu' },
      { value: 'IN-MH', label: 'Maharashtra' },
    ],
    patterns: [
      { value: 'office', label: 'Office hours only' },
      { value: 'shift', label: 'Office and plant shifts, including nights' },
    ],
    values: {
      leave: [
        {
          key: 'earned',
          label: 'Earned leave days a year',
          min: 0,
          max: 60,
          default: 15,
        },
        {
          key: 'sick',
          label: 'Sick leave days a year',
          min: 0,
          max: 30,
          default: 12,
        },
        {
          key: 'casual',
          label: 'Casual leave days a year',
          min: 0,
          max: 30,
          default: 12,
        },
        {
          key: 'carry',
          label: 'Earned leave days that carry forward',
          min: 0,
          max: 300,
          default: 45,
        },
      ],
      work_from_home: [
        {
          key: 'wfhDays',
          label: 'Work-from-home days a week',
          min: 0,
          max: 5,
          default: 2,
        },
      ],
      notice: [
        {
          key: 'noticeDays',
          label: 'Notice period (days)',
          min: 0,
          max: 180,
          default: 60,
        },
        {
          key: 'probationMonths',
          label: 'Probation (months)',
          min: 0,
          max: 12,
          default: 6,
        },
      ],
    },
    notesMax: 500,
  },
};

export const WRITER_DRAFT: WriterDraft = {
  id: 'd1',
  status: 'draft',
  version: 3,
  mode: 'ai',
  type: 'leave',
  typeLabel: 'Leave',
  answers: {
    industry: 'Food and consumer goods',
    states: ['Karnataka', 'Tamil Nadu'],
    headcount: 248,
    workPattern: 'Office and plant shifts, including nights',
  },
  values: { earned: 15, sick: 12, casual: 12, carry: 45 },
  clauses: [
    {
      id: 'p1',
      title: 'Purpose',
      text: 'This policy explains the leave employees get.',
      source: 'ai',
      editable: true,
    },
    {
      id: 'v-earned',
      title: 'Earned leave',
      text: 'Employees earn 15 days of earned leave a year.',
      source: 'company',
      editable: false,
      finding: 'f-IN-KA-earned',
    },
    {
      id: 'law-IN-KA',
      title: 'The law in Karnataka',
      text: 'The Karnataka rules set at least 18 days of earned leave a year.',
      source: 'law',
      ref: 'IN.SE KA 1961-v1',
      editable: false,
    },
    {
      id: 'p2',
      title: 'How to apply',
      text: 'Apply in YukthiX before you take leave.',
      source: 'ai',
      editable: true,
    },
  ],
  findings: [
    {
      id: 'f-IN-KA-earned',
      state: 'Karnataka',
      text: 'Earned leave: 15 days a year is below the Karnataka minimum of 18.',
      status: 'open',
      fix: { key: 'earned', value: 18 },
    },
    {
      id: 'f-IN-TN-earned',
      state: 'Tamil Nadu',
      text: 'Earned leave: 15 days a year meets the Tamil Nadu minimum of 12.',
      status: 'resolved',
    },
  ],
  openFindings: 1,
  createdBy: 'Lakshmi Iyer',
  createdAt: '2026-11-04T05:30:00.000Z',
  approvedBy: null,
  approvedAt: null,
  approvedByMe: false,
  target: {
    title: 'Leave policy',
    policyId: null,
    code: null,
    number: 1,
    blockedBy: null,
  },
};

export const WRITER_RESOLVED: WriterDraft = {
  ...WRITER_DRAFT,
  values: { ...WRITER_DRAFT.values, earned: 18 },
  clauses: WRITER_DRAFT.clauses.map((c) =>
    c.id === 'v-earned'
      ? {
          ...c,
          text: 'Employees earn 18 days of earned leave a year.',
          finding: undefined,
        }
      : c,
  ),
  findings: WRITER_DRAFT.findings.map((f) => ({
    ...f,
    status: 'resolved' as const,
    fix: undefined,
  })),
  openFindings: 0,
};

export const liveWriter = (over: Partial<LivePolicyWriter> = {}): LivePolicyWriter => ({
  state: 'ready',
  home: WRITER_HOME,
  draftId: null,
  draft: null,
  onOpenDraft: () => undefined,
  onGenerate: async () => ({ id: 'd1' }),
  onSave: async () => ({ version: 4 }),
  onApprove: async () => ({
    policyId: 'pol1',
    code: 'POL-01',
    title: 'Leave policy',
    number: 1,
  }),
  onOpenPolicy: () => undefined,
  ...over,
});
