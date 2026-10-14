import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobWorkspaceScreen, type JobWorkspaceScreenProps } from './job-workspace';
import { ApplicationPanel, type ApplicationPanelProps } from './application';
import { InterviewScreen, MyInterviewsScreen, ScorecardTemplatesScreen, type InterviewScreenProps, type MyInterviewsScreenProps, type ScorecardTemplatesScreenProps } from './interviews';

// Recruitment, wired (batch AT5; M10-BUILD-DESIGN §8, §9). In the affordance guard set ('screens-hiring-live').
// The lower-case exports are sample props shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/Live · Job workspace and interviews', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const res = async () => ({ succeeded: 1, skipped: [] });
const inHours = (h: number) => new Date(Date.parse('2026-10-14T10:00:00.000Z') + h * 3_600_000).toISOString();

export const workspace: JobWorkspaceScreenProps = {
  state: 'ready',
  job: { id: 'j1', title: 'Plant Engineer', status: 'open', summary: 'Production · Hosur · Full time · 2 openings', description: 'Runs the second shift line.', publicApplyEnabled: true, listOnCareers: true, applyUrl: 'https://hr.example.com/apply/abc', fitCriteria: 'Five years in a food plant.', fitRubric: [{ label: 'Plant experience', weight: 3 }], customFields: [{ label: 'Shift', value: 'Night' }], boardIds: [] },
  canManage: true,
  stages: [
    { id: 's1', name: 'Applied', category: 'active', statuses: [{ id: 'st1', name: 'Applied' }] },
    { id: 's2', name: 'Interview', category: 'active', statuses: [{ id: 'st2', name: 'Interview' }] },
    { id: 's3', name: 'Offer', category: 'offer', statuses: [{ id: 'st3', name: 'Offer' }] },
    { id: 's4', name: 'Rejected', category: 'rejected', statuses: [{ id: 'st4', name: 'Rejected' }] },
  ],
  rows: [
    { entryId: 'e1', candidateId: 'c1', name: 'Priya Raman', email: 'priya@example.com', stageId: 's2', statusId: 'st2', statusName: 'Interview', category: 'active', daysInStage: 3, testSummary: 'Plant aptitude 78% · passed', scorecards: { complete: true, submitted: 2, expected: 2, score: 3.1, passes: true }, nextInterviewAt: null, rejectionPendingUntil: null, assignee: 'Anil', fitScore: 81, internal: false },
    { entryId: 'e2', candidateId: 'c2', name: 'Arun Kumar', email: 'arun@example.com', stageId: 's1', statusId: 'st1', statusName: 'Applied', category: 'active', daysInStage: 9, testSummary: null, scorecards: null, nextInterviewAt: inHours(26), rejectionPendingUntil: null, assignee: null, fitScore: null, internal: false },
    { entryId: 'e3', candidateId: 'c3', name: 'Meena Iyer', email: 'meena@example.com', stageId: 's4', statusId: 'st4', statusName: 'Rejected', category: 'rejected', daysInStage: 0, testSummary: null, scorecards: null, nextInterviewAt: null, rejectionPendingUntil: inHours(23), assignee: null, fitScore: null, internal: false },
  ],
  settings: { scorecardTemplateId: 'tp1', exams: [{ examId: 'x1', title: 'Plant aptitude', sendOnStageId: 's2' }] },
  exams: [{ value: 'x1', label: 'Plant aptitude' }, { value: 'x2', label: 'Safety basics' }],
  scorecardTemplates: [{ value: 'tp1', label: 'Engineer round 1' }],
  jobBoards: [{ value: 'b1', label: 'Naukri' }],
  candidateChoices: [{ value: 'c9', label: 'Divya S · divya@example.com' }],
  templates: [{ value: 't1', label: 'Regret', subject: 'Your application', body: 'Thank you, {{candidateName}}.' }],
  senders: [],
  onBack: () => undefined,
  onOpenEntry: () => undefined,
  onMove: ok,
  onReject: ok,
  onUndo: ok,
  onBulkMove: res,
  onBulkTest: res,
  onBulkEmail: ok,
  onAdd: ok,
  onExport: ok,
  onLinkExam: ok,
  onUnlinkExam: ok,
  onSendOn: ok,
  onScorecard: ok,
  onUpdateJob: ok,
  onScreenAll: async () => ({ queued: 3 }),
  onCopy: ok,
};

export const panel: ApplicationPanelProps = {
  open: true,
  onClose: () => undefined,
  app: {
    entryId: 'e1', candidateId: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '+91 98450 12345', statusId: 'st2', stageName: 'Interview', category: 'active', rejectedReason: null, rejectionPendingUntil: null,
    resume: { title: 'Process Engineer', summary: 'Six years on dairy lines.', skills: ['HACCP', 'Lean'], hasFile: true, status: 'done' },
    fit: { status: 'done', score: 81, summary: 'Strong plant background.', stale: false },
    tests: [{ examId: 'x1', title: 'Plant aptitude', score: 78, passFail: 'pass', status: 'completed' }],
    customFields: [{ label: 'Notice period', value: '30 days' }],
    checklist: [{ id: 'k1', label: 'References checked', done: false }],
    assignee: 'u1',
    interviews: [{ id: 'iv1', status: 'confirmed', when: inHours(26), panel: ['Anil', 'Kavya'], location: 'Video call', meetingUrl: 'https://meet.example.com/abc', scorecards: { complete: false, submitted: 1, expected: 2, score: null, passes: null } }],
    emails: [{ id: 'm1', subject: 'Interview invitation', status: 'sent', at: inHours(-20) }],
    sms: [],
    whatsapp: [{ id: 'w1', body: 'See you tomorrow at 10.', status: 'failed', at: inHours(-2) }],
    smsOptedOut: false,
    whatsappOptedOut: false,
    notes: [{ id: 'n1', author: 'Anil', note: 'Good energy on the phone.', rating: 4, at: inHours(-48) }],
    offers: [],
  },
  canManage: true,
  statuses: [{ value: 'st1', label: 'Applied' }, { value: 'st2', label: 'Interview' }, { value: 'st3', label: 'Offer' }],
  people: [{ value: 'u1', label: 'Anil' }, { value: 'u2', label: 'Kavya' }],
  scorecardTemplates: [{ value: 'tp1', label: 'Engineer round 1' }],
  defaultScorecardId: 'tp1',
  templates: workspace.templates,
  senders: [],
  smsTemplates: [],
  whatsappTemplates: [],
  offerTemplates: [{ value: 'o1', label: 'Standard offer', subject: 'Your offer', body: 'We are pleased to offer you…' }],
  surveys: [{ value: 'sv1', label: 'Candidate experience' }],
  offerApproval: true,
  onOpenProfile: () => undefined,
  onStatus: ok,
  onReject: ok,
  onUndo: ok,
  onAssign: ok,
  onChecklist: ok,
  onScoreFit: ok,
  onResume: ok,
  onSchedule: ok,
  onOpenInterview: () => undefined,
  onCancelInterview: ok,
  onResendInterview: ok,
  onEmail: ok,
  onSms: ok,
  onWhatsapp: ok,
  onResend: ok,
  onNote: ok,
  onSurvey: ok,
  onOffer: ok,
  onOfferAction: ok,
};

export const interview: InterviewScreenProps = {
  state: 'ready',
  view: {
    interview: { id: 'iv1', status: 'confirmed', location: 'Video call', timeZone: 'Asia/Kolkata', meetingUrl: 'https://meet.example.com/abc', slots: [{ startsAt: inHours(-2), endsAt: inHours(-1), confirmed: true }], jobId: 'j1', jobTitle: 'Plant Engineer', candidateId: 'c1', candidateName: 'Priya Raman' },
    panel: [{ userId: 'u1', name: 'Anil', submitted: true }, { userId: 'u2', name: 'Kavya', submitted: false }],
    resume: { title: 'Process Engineer', summary: 'Six years on dairy lines.', skills: 'HACCP, Lean', hasFile: true },
    template: { id: 'tp1', name: 'Engineer round 1', scaleMax: 4, passBar: 2.5, items: [{ id: 'a', label: 'Plant safety', guidance: 'Names the hazards', weight: 2 }, { id: 'b', label: 'Communication', guidance: null, weight: 1 }] },
    viewer: { isPanelist: true, isOverseer: false },
    scorecards: [{ id: 'sc2', panelistUserId: 'u2', panelistName: 'Kavya', mine: true, status: 'draft', recommendation: null, summary: null, weightedScore: null, passes: null, submittedAt: null, ratings: [{ itemId: 'a', rating: 3, notes: null }] }],
    result: null,
    earlier: [],
  },
  onBack: () => undefined,
  onResume: ok,
  onSave: ok,
  onSubmit: ok,
};

export const mine: MyInterviewsScreenProps = {
  state: 'ready',
  rows: [
    { id: 'iv1', candidateName: 'Priya Raman', jobTitle: 'Plant Engineer', when: inHours(-2), status: 'confirmed', scorecard: 'draft' },
    { id: 'iv2', candidateName: 'Arun Kumar', jobTitle: 'Plant Engineer', when: inHours(26), status: 'proposed', scorecard: 'not_started' },
    { id: 'iv3', candidateName: 'Divya S', jobTitle: 'Cashier', when: inHours(-72), status: 'confirmed', scorecard: 'submitted' },
  ],
  onOpen: () => undefined,
};

export const templates: ScorecardTemplatesScreenProps = {
  state: 'ready',
  templates: [{ id: 'tp1', name: 'Engineer round 1', scaleMax: 4, passBar: 2.5, inUse: true, items: [{ id: 'a', label: 'Plant safety', guidance: null, weight: 2, competencyId: null }] }],
  competencies: [{ value: 'cp1', label: 'Problem solving' }],
  canManage: true,
  onSave: ok,
  onArchive: ok,
};

export const Workspace: S = { render: () => <JobWorkspaceScreen {...workspace} /> };
export const Application: S = { render: () => <ApplicationPanel {...panel} /> };
export const Interview: S = { render: () => <InterviewScreen {...interview} /> };
export const InterviewSubmitted: S = { render: () => <InterviewScreen {...interview} view={{ ...interview.view!, scorecards: [{ ...interview.view!.scorecards[0], status: 'submitted', recommendation: 'yes', weightedScore: 3, passes: true, ratings: [{ itemId: 'a', rating: 3, notes: null }, { itemId: 'b', rating: 3, notes: null }] }, { id: 'sc1', panelistUserId: 'u1', panelistName: 'Anil', mine: false, status: 'submitted', recommendation: 'strong_yes', summary: 'Best this month', weightedScore: 3.67, passes: true, submittedAt: inHours(-1), ratings: [] }], result: { complete: true, submitted: 2, expected: 2, score: 3.33, passes: true } }} /> };
export const MyInterviews: S = { render: () => <MyInterviewsScreen {...mine} /> };
export const Scorecards: S = { render: () => <ScorecardTemplatesScreen {...templates} /> };
