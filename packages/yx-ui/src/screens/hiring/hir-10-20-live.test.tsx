import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BgvTrackerScreen, TalentCrmScreen, type LiveBgv, type LiveBgvJoiner, type LiveTalentCrm } from './hiring-offers';
import { ScorecardScreen, type LiveScorecard } from './hiring-pipeline';
import { sampleInterview, sampleLive } from './hir-07-scorecard.stories';
import type { InterviewView } from './live/types';

// HIR-10 BGV tracker (manual), HIR-20 Talent CRM and the HIR-07 scorecard comments (answer 322): the designed screens
// with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const lastDialog = async () => (await screen.findAllByRole('dialog')).at(-1)!;
const toasted = async (t: string | RegExp) => expect((await screen.findAllByText(t)).length).toBeGreaterThan(0);

const JOINERS: LiveBgvJoiner[] = [
  {
    id: 'p1', journeyId: 'j1', name: 'Joseph George', designation: 'Senior QA Engineer', joiningOn: '2026-11-20', status: 'invited', consent: 'given', consentAt: '2026-11-02T05:00:00.000Z',
    checks: [
      { id: 'k1', checkType: 'employment', status: 'discrepancy', gate: 'before_joining', note: 'Dates differ by 4 months', addedAt: '2026-11-03T05:00:00.000Z', addedBy: 'Neha Joshi', checkedBy: 'Neha Joshi', checkedById: 'u1', checkedOn: '2026-11-05', evidence: { documentId: 'd1', version: 1, fileName: 'letter.pdf', scan: 'clean' }, decision: null, version: 2 },
      { id: 'k2', checkType: 'education', status: 'clear', gate: 'none', note: null, addedAt: '2026-11-03T05:00:00.000Z', addedBy: 'Neha Joshi', checkedBy: 'Neha Joshi', checkedById: 'u1', checkedOn: '2026-11-04', evidence: { documentId: 'd1', version: 2, fileName: 'degree.pdf', scan: 'pending' }, decision: null, version: 2 },
    ],
  },
  { id: 'p2', journeyId: 'j2', name: 'Aditi Rao', designation: null, joiningOn: '2026-12-01', status: 'invited', consent: 'pending', consentAt: null, checks: [] },
];

const bgv = (over: Partial<LiveBgv> = {}): LiveBgv => ({
  state: 'ready',
  onRetry: vi.fn(),
  joiners: JOINERS,
  viewerId: 'u2',
  deciderOtherPerson: true,
  today: '2026-11-12',
  onAskConsent: vi.fn(async () => ({})),
  onAddCheck: vi.fn(async () => ({})),
  onRecord: vi.fn(async () => ({})),
  onDecide: vi.fn(async () => ({})),
  onOpenReport: vi.fn(),
  onOpenJoiner: vi.fn(),
  ...over,
});

describe('HIR-10 BGV tracker (live, manual checks)', () => {
  it('lists joiners with each check; checks not added say so; no partner parts', async () => {
    show(<BgvTrackerScreen live={bgv()} />);
    expect(screen.getByText('No BGV partner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start BGV' })).not.toBeInTheDocument();
    const row = screen.getByText('Joseph George').closest('tr')!;
    expect(within(row).getAllByText('Discrepancy').length).toBeGreaterThan(0);
    expect(within(row).getAllByText('Not added').length).toBe(3);
    expect(within(row).getByText('Manual · 2 checks')).toBeInTheDocument();
  });

  it('asks a joiner for consent from the row (toast)', async () => {
    const live = bgv();
    show(<BgvTrackerScreen live={live} />);
    await ue.click(within(screen.getByText('Aditi Rao').closest('tr')!).getByRole('button', { name: 'Resend consent link' }));
    expect(live.onAskConsent).toHaveBeenCalledWith(JOINERS[1]);
    await toasted('Consent asked of Aditi Rao');
  });

  it('shows who checked and when, the evidence by its virus-scan state, and the discrepancy for a person', async () => {
    const live = bgv();
    show(<BgvTrackerScreen live={live} />);
    await ue.click(screen.getByText('Joseph George'));
    const d = await lastDialog();
    expect(within(d).getByText(/Checked by Neha Joshi on 5 Nov 2026/)).toBeInTheDocument();
    expect(within(d).getByText('Discrepancy to review · Employment')).toBeInTheDocument();
    expect(within(d).getByText('Report being virus-checked')).toBeInTheDocument();
    const reports = within(d).getAllByRole('button', { name: 'View report' });
    expect(reports).toHaveLength(1);
    await ue.click(reports[0]);
    expect(live.onOpenReport).toHaveBeenCalledWith(JOINERS[0].checks[0]);
  });

  it('decides a discrepancy: pressed too early it names the gap; then records it (toast)', async () => {
    const live = bgv();
    show(<BgvTrackerScreen live={live} />);
    await ue.click(screen.getByText('Joseph George'));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Decide' }));
    const d = await lastDialog();
    const confirm = within(d).getByRole('button', { name: 'Record decision' });
    expect(confirm).toBeEnabled();
    await ue.click(confirm);
    expect(within(d).getByText('Choose proceed or do not proceed.')).toBeInTheDocument();
    expect(live.onDecide).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('radio', { name: 'Proceed' }));
    await ue.click(confirm);
    expect(within(d).getByText('Give the reason for the decision.')).toBeInTheDocument();
    await ue.type(within(d).getByLabelText(/^Reason/), 'Career break, proof seen');
    await ue.click(confirm);
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith(JOINERS[0], JOINERS[0].checks[0], { decision: 'proceed', note: 'Career break, proof seen' }));
    await toasted('Joseph George: proceed recorded');
  });

  it('whoever recorded the discrepancy is told someone else decides (no Decide button)', async () => {
    show(<BgvTrackerScreen live={bgv({ viewerId: 'u1' })} />);
    await ue.click(screen.getByText('Joseph George'));
    const d = await lastDialog();
    expect(within(d).queryByRole('button', { name: 'Decide' })).not.toBeInTheDocument();
    expect(within(d).getByText(/another person with the background-check key decides it/)).toBeInTheDocument();
  });

  it('records a result: the result is required and the day cannot be in the future; saves with the day', async () => {
    const live = bgv();
    show(<BgvTrackerScreen live={live} />);
    await ue.click(screen.getByText('Joseph George'));
    await ue.click(within(await lastDialog()).getAllByRole('button', { name: 'Record result' })[1]);
    const d = await lastDialog();
    await ue.click(within(d).getByRole('radio', { name: 'Discrepancy' }));
    await ue.click(within(d).getByRole('button', { name: 'Save result' }));
    expect(within(d).getByText('Say what differs, for the person who decides.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('radio', { name: 'Clear' }));
    await ue.click(within(d).getByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(live.onRecord).toHaveBeenCalledWith(JOINERS[0], JOINERS[0].checks[1], { status: 'clear', note: '', checkedOn: '2026-11-12', file: null }));
    await toasted('Education result saved for Joseph George');
  });

  it('adds a check: what to check is required', async () => {
    const live = bgv();
    show(<BgvTrackerScreen live={live} />);
    await ue.click(screen.getByText('Joseph George'));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Add manual check' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Add check' }));
    expect(within(d).getByText('Choose what to check.')).toBeInTheDocument();
    expect(live.onAddCheck).not.toHaveBeenCalled();
  });

  it('without the key it says who grants it; an error offers retry', async () => {
    const { unmount } = show(<BgvTrackerScreen live={bgv({ state: 'denied' })} />);
    expect(screen.getByText(/HR \(the background-check key\)/)).toBeInTheDocument();
    unmount();
    const live = bgv({ state: 'error', joiners: [] });
    show(<BgvTrackerScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
  });
});

const crm = (over: Partial<LiveTalentCrm> = {}): LiveTalentCrm => ({
  state: 'ready',
  onRetry: vi.fn(),
  pools: [
    { id: 'l1', name: 'QA silver medallists', kind: 'pool', description: 'Strong finalists', members: 3, consented: 3, ownerName: 'Neha Joshi', updatedAt: '2026-11-01T05:00:00.000Z' },
    { id: 'l2', name: 'Plant supervisors', kind: 'hotlist', description: null, members: 2, consented: 1, ownerName: null, updatedAt: '2026-11-03T05:00:00.000Z' },
  ],
  canManage: true,
  selectedId: null,
  onSelect: vi.fn(),
  members: { state: 'ready', rows: [] },
  onCreate: vi.fn(async () => ({})),
  onArchive: vi.fn(async () => ({})),
  onRemove: vi.fn(async () => ({})),
  onOpenCandidate: vi.fn(),
  postings: { state: 'ready', jobs: [{ jobId: 'job1', title: 'Senior QA Engineer', status: 'open', postings: [{ boardId: 'b1', board: 'Naukri', status: 'not posted' }] }] },
  canPost: true,
  onPosting: vi.fn(async () => ({})),
  ...over,
});

describe('HIR-20 Talent CRM (live)', () => {
  it('lists pools with consent counts; only built tabs show', () => {
    show(<TalentCrmScreen live={crm()} />);
    const row = screen.getByText('Plant supervisors').closest('tr')!;
    expect(within(row).getByText('Hotlist')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /With talent-pool consent/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Campaigns/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Sourced/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New sequence' })).not.toBeInTheDocument();
  });

  it('new pool: the name is required (field error, focus); then creates a hotlist (toast)', async () => {
    const live = crm();
    show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'New pool' }));
    const d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Create' }));
    expect(within(d).getByText('Enter the name.')).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByLabelText(/^Name/)).toHaveFocus());
    await ue.click(within(d).getByRole('radio', { name: 'Hotlist' }));
    await ue.type(within(d).getByLabelText(/^Name/), 'Drivers');
    await ue.click(within(d).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(live.onCreate).toHaveBeenCalledWith({ name: 'Drivers', kind: 'hotlist', description: null }));
    await toasted('Drivers created');
  });

  it('a viewer without the manage key cannot create, delete or remove', async () => {
    show(<TalentCrmScreen live={crm({ canManage: false, selectedId: 'l1', members: { state: 'ready', rows: [{ candidateId: 'c1', addedAt: '2026-11-02T05:00:00.000Z', consent: 'given', candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', globalStage: 'available' } }] } })} />);
    expect(screen.queryByRole('button', { name: 'New pool' })).not.toBeInTheDocument();
    const d = await lastDialog();
    expect(within(d).getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('opens a pool: members with their consent; open the candidate; remove after a confirm (toast)', async () => {
    const live = crm({ selectedId: 'l2', members: { state: 'ready', rows: [{ candidateId: 'c1', addedAt: '2026-11-02T05:00:00.000Z', consent: 'given', candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', globalStage: 'available' } }, { candidateId: 'c2', addedAt: '2026-11-02T05:00:00.000Z', consent: 'none', candidate: { id: 'c2', name: 'Manoj Patil', email: 'manoj@example.com', globalStage: 'rejected' } }] } });
    show(<TalentCrmScreen live={live} />);
    const d = await lastDialog();
    expect(within(within(d).getByText('Manoj Patil').closest('tr')!).getByText('Not given')).toBeInTheDocument();
    await ue.click(within(within(d).getByText('Priya Raman').closest('tr')!).getByRole('button', { name: 'Open' }));
    expect(live.onOpenCandidate).toHaveBeenCalledWith('c1');
    await ue.click(within(within(d).getByText('Manoj Patil').closest('tr')!).getByRole('button', { name: 'Remove' }));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Remove from list' }));
    await waitFor(() => expect(live.onRemove).toHaveBeenCalledWith(live.pools[1], 'c2'));
    await toasted('Manoj Patil removed from Plant supervisors');
  });

  it('postings: posts a job to a board (toast); without the pipeline key there are no buttons', async () => {
    const live = crm({ defaultTab: 'postings' });
    const { unmount } = show(<TalentCrmScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Post' }));
    expect(live.onPosting).toHaveBeenCalledWith(live.postings.jobs[0], live.postings.jobs[0].postings[0], 'post');
    await toasted('Senior QA Engineer posted to Naukri');
    unmount();
    show(<TalentCrmScreen live={crm({ defaultTab: 'postings', canPost: false })} />);
    expect(screen.getByText('Naukri')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
  });
});

describe('HIR-07 scorecard comments (answer 322)', () => {
  const mineSubmitted: InterviewView = {
    ...sampleInterview,
    viewer: { isPanelist: true, isOverseer: false },
    scorecards: [{ ...sampleInterview.scorecards[0], panelistUserId: 'me', mine: true, comments: [] }],
  };
  const live = (view: InterviewView, over: Partial<LiveScorecard> = {}): LiveScorecard => ({ ...sampleLive, view, onComment: vi.fn(async () => ({ id: 'new' })), ...over });

  it('an overseer reads comments under a colleague’s submitted scorecard and adds one (toast); nothing is editable', async () => {
    const l = live(sampleInterview);
    show(<ScorecardScreen live={l} />);
    expect(screen.getByText('I forgot to add: she also named the boundary cases for the refund flow.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: 'Comment' }), 'Noted for the debrief.');
    await ue.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(l.onComment).toHaveBeenCalledWith('sc1', 'Noted for the debrief.'));
    await toasted('Comment added');
  });

  it('the author adds a comment to their own submitted scorecard from the banner; a refusal shows and keeps the text', async () => {
    const l = live(mineSubmitted, { onComment: vi.fn(async () => Promise.reject(new Error('Not allowed while acting for someone else. Sign in as yourself.'))) });
    show(<ScorecardScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Add comment' }));
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await waitFor(() => expect(box).toHaveFocus());
    await ue.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a comment before you post it.');
    await ue.type(box, 'Also strong on SQL.');
    await ue.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(await screen.findByText(/while acting for someone else/)).toBeInTheDocument();
    expect(box).toHaveValue('Also strong on SQL.');
  });

  it('a draft has no comment area', () => {
    const draft: InterviewView = { ...mineSubmitted, scorecards: [{ ...mineSubmitted.scorecards[0], status: 'draft', submittedAt: null }] };
    show(<ScorecardScreen live={live(draft)} />);
    expect(screen.queryByRole('textbox', { name: 'Comment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument();
  });
});
