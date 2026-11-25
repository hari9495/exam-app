import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CandidateRecordScreen, InterviewCalendarScreen, ScorecardScreen, myInterviewItems, type LiveCandidateRecord, type LiveInterviewCalendar, type LiveScorecard } from './hiring-pipeline';
import { istWall, istWhen } from './hiring-logic';
import { sampleInterview, sampleLive } from './hir-07-scorecard.stories';
import type { CandidateProfileView, InterviewView, MyInterviewRow } from './live/types';

// HIR-06 interview calendar and HIR-07 scorecard: the designed screens with `live`, positive and negative; and the
// HIR-05 record's Schedule interview / Move to next stage (answer 274).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const lastDialog = async () => (await screen.findAllByRole('dialog')).at(-1)!;
const toasted = async (t: string | RegExp) => expect((await screen.findAllByText(t)).length).toBeGreaterThan(0);

const MINE: MyInterviewRow[] = [
  { id: 'iv3', candidateName: 'Joseph George', jobTitle: 'Senior QA Engineer', when: '2026-09-22T05:30:00.000Z', status: 'confirmed', scorecard: 'submitted' },
  { id: 'iv2', candidateName: 'Vikram Reddy', jobTitle: 'Senior QA Engineer', when: '2026-09-21T09:00:00.000Z', status: 'confirmed', scorecard: 'draft', overdue: true },
  { id: 'iv1', candidateName: 'Ananya Iyer', jobTitle: 'Senior QA Engineer', when: '2026-09-29T05:30:00.000Z', status: 'confirmed', scorecard: 'not_started' },
  { id: 'iv4', candidateName: 'Divya S', jobTitle: 'Cashier', when: null, status: 'cancelled', scorecard: 'not_started' },
];

const calendar = (over: Partial<LiveInterviewCalendar> = {}): LiveInterviewCalendar => ({
  state: 'ready',
  onRetry: vi.fn(),
  persona: 'interviewer',
  now: new Date('2026-09-29T03:00:00.000Z'),
  events: [{ id: 'iv1', candidateId: 'c1', candidateName: 'Ananya Iyer', jobTitle: 'Senior QA Engineer', startsAt: '2026-09-29T05:30:00.000Z', endsAt: '2026-09-29T06:30:00.000Z', confirmed: true, status: 'confirmed', mine: true }],
  mine: MINE,
  onDate: vi.fn(),
  onOpen: vi.fn(),
  ...over,
});

describe('India time', () => {
  it('shows an instant in IST whatever the browser zone: 05:30 UTC is 11:00 am IST', () => {
    expect(istWhen('2026-09-29T05:30:00.000Z')).toBe('29 Sep 2026, 11:00 am IST');
    expect(istWhen('2026-09-29T18:45:00.000Z')).toBe('30 Sep 2026, 12:15 am IST');
    const d = istWall('2026-12-31T20:00:00.000Z');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2027, 0, 1, 1, 30]);
  });
});

describe('HIR-06 interview calendar (live)', () => {
  it('orders the interviewer’s scorecards: overdue first, then to fill, then the rest', () => {
    expect(myInterviewItems(MINE).map((i) => [i.candidate, i.scorecard])).toEqual([
      ['Vikram Reddy', 'overdue'],
      ['Ananya Iyer', 'due'],
      ['Joseph George', 'submitted'],
      ['Divya S', 'cancelled'],
    ]);
  });

  it('an interviewer sees their scorecards with badges and opens one to fill', async () => {
    const live = calendar();
    show(<InterviewCalendarScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'My interviews' })).toBeInTheDocument();
    expect(screen.getByText('Scorecard overdue')).toBeInTheDocument();
    expect(screen.getByText('Scorecard submitted')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText(/29 Sep 2026, 11:00 am IST/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Fill scorecard for Ananya Iyer' }));
    expect(live.onOpen).toHaveBeenCalledWith('iv1');
    await ue.click(screen.getByRole('button', { name: 'Open the interview with Joseph George' }));
    expect(live.onOpen).toHaveBeenCalledWith('iv3');
  });

  it('empty: an interviewer with nothing assigned', () => {
    show(<InterviewCalendarScreen live={calendar({ mine: [], events: [] })} />);
    expect(screen.getByText('No interviews assigned to you.')).toBeInTheDocument();
  });

  it('a recruiter sees the company week; no Find a slot (no calendar free/busy yet); no Scorecards card unless on a panel', () => {
    show(<InterviewCalendarScreen live={calendar({ persona: 'recruiter', mine: [] })} />);
    expect(screen.getByRole('heading', { name: 'Interviews' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find a slot' })).not.toBeInTheDocument();
    expect(screen.queryByText('Scorecards')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Ananya Iyer · Senior QA Engineer/).length).toBeGreaterThan(0);
  });

  it('loading, error with retry, and no access', async () => {
    const { unmount } = show(<InterviewCalendarScreen live={calendar({ state: 'loading' })} />);
    expect(screen.getByLabelText('Loading interviews')).toBeInTheDocument();
    unmount();
    const live = calendar({ state: 'error' });
    const r2 = show(<InterviewCalendarScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(live.onRetry).toHaveBeenCalled();
    r2.unmount();
    show(<InterviewCalendarScreen live={calendar({ state: 'denied' })} />);
    expect(screen.getAllByText(/interviews/i).length).toBeGreaterThan(0);
  });
});

const panelist = (over: Partial<InterviewView> = {}): InterviewView => ({
  ...sampleInterview,
  viewer: { isPanelist: true, isOverseer: false },
  scorecards: [{ id: 'sc2', panelistUserId: 'u2', panelistName: 'Kavya Rao', mine: true, status: 'draft', recommendation: null, summary: null, weightedScore: null, passes: null, submittedAt: null, ratings: [{ itemId: 'a', rating: 4, notes: 'Good' }] }],
  result: null,
  ...over,
});
const scorecard = (over: Partial<LiveScorecard> = {}): LiveScorecard => ({ ...sampleLive, onSave: vi.fn(async () => ({})), onSubmit: vi.fn(async () => ({})), onResendInterview: vi.fn(async () => ({})), onCancelInterview: vi.fn(async () => ({})), view: panelist(), canManage: false, ...over });

describe('HIR-07 scorecard (live)', () => {
  it('a panellist’s draft loads; Submit pressed too early says what is missing, focuses it and sends nothing', async () => {
    const live = scorecard();
    show(<ScorecardScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Scorecard · Ananya Iyer' })).toBeInTheDocument();
    expect(screen.getByText(/29 Sep 2026, 11:00 am IST/)).toBeInTheDocument();
    expect(screen.getByText(/appear here after you submit yours/)).toBeInTheDocument();
    expect(screen.queryByText(/Anil Kumar's scorecard/)).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit scorecard' });
    expect(submit).toBeEnabled();
    await ue.click(submit);
    expect(screen.getByText('Rate Communication.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.closest('#sc-skill-1')).not.toBeNull());
    expect(live.onSubmit).not.toHaveBeenCalled();
  });

  it('saves a draft (toast), then submits after the confirm with the template’s item ids', async () => {
    const live = scorecard();
    show(<ScorecardScreen live={live} />);
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Communication rating' })).getByRole('radio', { name: '3' }));
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    await toasted('Draft saved');
    expect(live.onSave).toHaveBeenCalledWith({ ratings: [{ itemId: 'a', rating: 4, notes: 'Good' }, { itemId: 'b', rating: 3, notes: null }], recommendation: null, summary: null });
    await ue.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    expect(screen.getByText('Choose your recommendation.')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Recommendation' })).getByRole('radio', { name: 'Yes' }));
    await ue.click(screen.getByRole('button', { name: 'Submit scorecard' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Submit scorecard' }));
    await toasted('Scorecard submitted');
    expect(live.onSubmit).toHaveBeenCalledWith({ ratings: [{ itemId: 'a', rating: 4, notes: 'Good' }, { itemId: 'b', rating: 3, notes: null }], recommendation: 'yes', summary: null });
  });

  it('a refused save stays on the form', async () => {
    const live = scorecard({ onSave: vi.fn(async () => { throw new Error('Not available while acting for someone else'); }) });
    show(<ScorecardScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Not available while acting for someone else')).toBeInTheDocument();
  });

  it('once submitted it is read-only: no Save or Submit, colleagues’ submitted scorecards show', () => {
    const view = panelist({ scorecards: [{ ...panelist().scorecards[0], status: 'submitted', recommendation: 'yes', ratings: [{ itemId: 'a', rating: 4, notes: null }, { itemId: 'b', rating: 3, notes: null }], weightedScore: 3.67, passes: true }, sampleInterview.scorecards[0]] });
    show(<ScorecardScreen live={scorecard({ view })} />);
    expect(screen.getByText('Scorecard submitted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit scorecard' })).not.toBeInTheDocument();
    // Answer 322: comments are built now; the own submitted scorecard offers Add comment.
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeInTheDocument();
    expect(screen.getByText("Anil Kumar's scorecard")).toBeInTheDocument();
  });

  it('a recruiter or hiring manager reads submitted scorecards (never drafts), resends and cancels with a confirm', async () => {
    const live = scorecard({ view: sampleInterview, canManage: true });
    show(<ScorecardScreen live={live} />);
    expect(screen.getByText("Anil Kumar's scorecard")).toBeInTheDocument();
    expect(screen.getByText('Scorecards 1 of 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit scorecard' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send to candidate again' }));
    await toasted('Sent to the candidate again');
    await ue.click(screen.getByRole('button', { name: 'Cancel interview' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Cancel interview' }));
    await toasted('Interview cancelled');
    expect(live.onCancelInterview).toHaveBeenCalled();
  });

  it('a hiring manager without the pipeline key gets no resend or cancel', () => {
    show(<ScorecardScreen live={scorecard({ view: sampleInterview, canManage: false })} />);
    expect(screen.queryByRole('button', { name: 'Cancel interview' })).not.toBeInTheDocument();
  });

  it('no template: tells the panellist to ask the recruiter; denied and not found states', () => {
    const r = show(<ScorecardScreen live={scorecard({ view: panelist({ template: null }) })} />);
    expect(screen.getByText('No scorecard for this interview')).toBeInTheDocument();
    r.unmount();
    const r2 = show(<ScorecardScreen live={scorecard({ state: 'denied', view: null })} />);
    expect(screen.getAllByText(/this interview/).length).toBeGreaterThan(0);
    r2.unmount();
    show(<ScorecardScreen live={scorecard({ state: 'not-found', view: null })} />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });
});

const PROFILE: CandidateProfileView = {
  candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '+91 98450 12345', phoneE164: '+919845012345', status: 'active', globalStage: 'engaged', createdAt: '2026-09-01T00:00:00.000Z', erasedAt: null, emailOptedOut: false },
  legalHold: null,
  retention: { months: 12, lastActivityAt: '2026-10-01T00:00:00.000Z', until: '2027-10-01T00:00:00.000Z', noticeAt: null },
  exEmployee: null,
  resume: null,
  applications: [{ id: 'a1', jobId: 'j1', jobTitle: 'Senior Accountant', jobStatus: 'open', stage: 'Screening', status: null, appliedAt: '2026-09-01T00:00:00.000Z', closed: false, closedReason: null, source: 'careers' }],
  assessments: [],
  interviews: [{ id: 'v1', status: 'confirmed', createdAt: '2026-09-10T00:00:00.000Z', entryId: 'a1', jobTitle: 'Senior Accountant', when: '2026-09-29T05:30:00.000Z' }],
  messages: { emails: [], sms: 0, whatsapp: 0 },
  consents: [],
  lists: [],
  merges: [],
};
const ok = vi.fn(async () => undefined);
const record = (over: Partial<LiveCandidateRecord> = {}): LiveCandidateRecord => ({
  state: 'ready', onRetry: vi.fn(), profile: PROFILE, can: { manage: true, dataRights: false, resume: true }, now: new Date('2026-11-09T06:00:00Z'), duplicates: [], pools: [], templates: [], senders: [], mergeOptions: [], onMergeSearch: vi.fn(),
  loadOther: vi.fn(), onBack: vi.fn(), onOpenJob: vi.fn(), onResume: ok, onEmail: ok, onAddToPool: vi.fn(), onMerge: ok, onHold: ok, onWithdrawPool: ok, onExport: ok, onErase: ok, onClearRehire: ok,
  onOpenInterview: vi.fn(),
  pipeline: { jobTitle: 'Senior Accountant', next: { name: 'Interview' }, onMove: vi.fn(async () => undefined), schedule: { people: [{ value: 'u1', label: 'Anil' }], scorecardTemplates: [{ value: 'tp1', label: 'Engineer round 1' }], defaultScorecardId: 'tp1', onSchedule: vi.fn(async () => ({})) } },
  ...over,
});

describe('HIR-05 record: Schedule interview and Move to next stage (answer 274)', () => {
  it('moves the open application to the next stage with a toast', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Move to next stage' }));
    await toasted('Moved to Interview');
    expect(live.pipeline!.onMove).toHaveBeenCalled();
  });

  it('a refused move says why in a toast', async () => {
    const live = record({ pipeline: { ...record().pipeline!, onMove: vi.fn(async () => { throw new Error('Candidates cannot be moved while acting for someone else.'); }) } });
    show(<CandidateRecordScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Move to next stage' }));
    await toasted('Not moved');
  });

  it('schedules in India time; pressed too early it names the gap and schedules nothing', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Schedule interview' }));
    const d = await lastDialog();
    expect(within(d).getByText('Schedule an interview · Senior Accountant')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Candidate books' }));
    await ue.type(within(d).getByLabelText(/^Where/), 'Video call');
    await ue.click(within(d).getByRole('button', { name: 'Schedule' }));
    expect(within(d).getByText('Choose the first bookable date.')).toBeInTheDocument();
    expect(live.pipeline!.schedule.onSchedule).not.toHaveBeenCalled();
    expect(within(d).getByLabelText(/time zone/i)).toHaveValue('Asia/Kolkata');
  });

  it('without the pipeline key (or while acting): no Schedule or Move; Open in pipeline instead', () => {
    show(<CandidateRecordScreen live={record({ pipeline: null })} />);
    expect(screen.queryByRole('button', { name: 'Schedule interview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in pipeline' })).toBeInTheDocument();
  });

  it('the Scores tab lists interviews in IST and opens the scorecard page', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: /Scores/ }));
    expect(screen.getByText('29 Sep 2026, 11:00 am IST')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open scorecards' }));
    expect(live.onOpenInterview).toHaveBeenCalledWith('v1');
  });
});
