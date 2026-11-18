import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { cardOf } from '../../lib/yx-pipeline';
import YxHiringPipelinePage from './(app)/hiring/jobs/[id]/pipeline/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// HIR-04 pipeline board page: the designed board on GET hiring/jobs/:id/board. A recruiter moves (with the card's status,
// so a repeat or a stale card is refused) and rejects with a reason; a refused move says why; a hiring manager and anyone
// acting for someone else read only; Bulk actions and Add candidate are sheets on the board (answer 261); a card opens the
// HIR-05 record; stage targets show (answer 263).

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const router = { push: jest.fn(), replace: jest.fn() };
const auth = (o: object = {}) => (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'recruiter', impersonating: false, actingSuperAdmin: false, isLoading: false, logout: jest.fn(), ...o });
const ue = userEvent.setup({ pointerEventsCheck: 0 });

const JOB = { id: 'j1', title: 'Plant Engineer', status: 'open', jobNumber: 7, createdAt: '2026-09-01T00:00:00.000Z', customFields: [], jobBoardIds: [] };
const row = { candidateId: 'c1', candidateEmail: 'priya@example.com', enteredVia: 'application', rejectedReason: null, examResults: [{ examId: 'x', examTitle: 'Aptitude', score: 78, passFail: 'pass' }], avgRating: null, feedbackCount: 0, fitScore: 81, fitStatus: 'done', fitStale: false, assignedUserId: null, assigneeName: null, referredByName: null, assignedGroupId: null, assignedGroupName: null, customFields: [], blueprintChecklist: {}, scorecards: null, nextInterviewAt: '2026-11-12T05:30:00.000Z', rejectionPendingUntil: null };
const BOARD = {
  pipeline: {
    id: 'p',
    name: 'Standard',
    stages: [
      { id: 's1', name: 'Applied', category: 'active', position: 0, statuses: [{ id: 'st1', name: 'Applied', position: 0 }], rules: [] },
      { id: 's2', name: 'Interview', category: 'active', position: 1, statuses: [{ id: 'st2', name: 'Interview', position: 0 }], rules: [] },
      { id: 's4', name: 'Rejected', category: 'rejected', position: 2, statuses: [{ id: 'st4', name: 'Rejected', position: 0 }], rules: [] },
      { id: 's5', name: 'Archived', category: 'archived', position: 3, statuses: [{ id: 'st5', name: 'Archived', position: 0 }], rules: [] },
    ],
  },
  columns: {
    s1: [{ ...row, entryId: 'e1', candidateName: 'Priya Raman', statusId: 'st1', stageId: 's1', category: 'active', stageEnteredAt: '2026-11-07T00:00:00.000Z' }],
    s2: [{ ...row, entryId: 'e2', candidateId: 'c2', candidateName: 'Arun Kumar', candidateEmail: 'arun@example.com', enteredVia: 'internal', examResults: [], fitScore: null, nextInterviewAt: null, statusId: 'st2', stageId: 's2', category: 'active', stageEnteredAt: '2026-11-09T00:00:00.000Z' }],
    s4: [],
  },
};

function serve(perms: string[], over: (path: string, init?: RequestInit) => unknown = () => undefined) {
  const posted: [string, unknown][] = [];
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') posted.push([path, init.body ? JSON.parse(String(init.body)) : undefined]);
    const o = await over(path, init);
    if (o !== undefined) return o;
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/jobs/j1') return JOB;
    if (path.startsWith('/jobs')) return [JOB, { ...JOB, id: 'j2', title: 'Accountant', jobNumber: 8 }];
    if (path === '/hiring/jobs/j1/board') return BOARD;
    if (path === '/hiring/jobs/j1/interview-settings') return { scorecardTemplateId: null, exams: [] };
    return [];
  });
  return posted;
}

beforeEach(() => {
  api.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue(router);
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/jobs/j1/pipeline');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
  auth();
});

describe('HIR-04 pipeline board page', () => {
  it('cards: test, advisory AI fit, next interview in India time, source; archived stage hidden', () => {
    const c = cardOf({ ...BOARD.columns.s1[0], scorecards: null } as never, Date.parse('2026-11-09T06:00:00.000Z'));
    expect(c).toMatchObject({ id: 'e1', stageId: 's1', line: 'priya@example.com · Applied online', next: 'interview 12 Nov 2026, 11:00 am', daysInStage: 2 });
    expect(c.scores.map((s) => s.label)).toEqual(['Test', 'AI fit (advisory)']);
  });

  it('a recruiter moves a card by the Move to menu: the card status goes along; toast', async () => {
    const posted = serve(['pipeline:manage', 'results:view'], (path) => (path === '/hiring/entries/e1/move' ? {} : undefined));
    wrap(<YxHiringPipelinePage />);
    expect(await screen.findByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByText(/Plant Engineer · 2 candidates/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Archived' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Move Priya Raman' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    await waitFor(() => expect(posted).toContainEqual(['/hiring/entries/e1/move', { statusId: 'st2', fromStatusId: 'st1' }]));
    expect((await screen.findAllByText('Priya Raman moved to Interview'))[0]).toBeInTheDocument();
  });

  it('answer 2434: a move whose stage asks before sending offers the email; Send posts it as written, then the SMS is offered', async () => {
    const moved = { entry: {}, pendingMessage: { templateId: 't1', subject: 'Interview', body: 'Hi {{candidateName}}' }, pendingSmsMessage: { templateId: null, body: 'Hi' } };
    const posted = serve(['pipeline:manage', 'results:view'], (path) => (path === '/hiring/entries/e1/move' ? moved : path.startsWith('/pipeline/entries/') || path.startsWith('/hiring/entries/e1/stage-message') ? {} : undefined));
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Move Priya Raman' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    let d = await screen.findByRole('dialog', { name: 'Send the Email message to Priya Raman?' });
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(posted).toContainEqual(['/pipeline/entries/e1/messages', { templateId: 't1', subject: 'Interview', body: 'Hi {{candidateName}}' }]));
    d = await screen.findByRole('dialog', { name: 'Send the SMS message to Priya Raman?' });
    await ue.click(within(d).getByRole('button', { name: "Don't send" }));
    await waitFor(() => expect(posted).toContainEqual(['/hiring/entries/e1/stage-message/skip', { channel: 'sms', templateId: null }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('answer 2434 negative: a move with nothing to ask shows no question', async () => {
    serve(['pipeline:manage', 'results:view'], (path) => (path === '/hiring/entries/e1/move' ? { entry: {} } : undefined));
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Move Priya Raman' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    expect((await screen.findAllByText('Priya Raman moved to Interview'))[0]).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rejecting needs a reason; the API answer decides the toast (not emailed, undo)', async () => {
    const posted = serve(['pipeline:manage', 'results:view'], (path) => (path === '/hiring/entries/e2/reject' ? { rejected: true, messageSentAt: null, undoUntil: '2026-11-10T06:00:00.000Z', emailing: false } : undefined));
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Move Arun Kumar' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Rejected' }));
    await ue.click(await screen.findByRole('button', { name: 'Move to Rejected' }));
    expect(screen.getByText('Enter a reason. It is saved on the record.')).toBeInTheDocument();
    expect(posted.filter(([p]) => p.includes('/reject'))).toEqual([]);
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Needs night-shift experience');
    await ue.click(screen.getByRole('button', { name: 'Move to Rejected' }));
    await waitFor(() => expect(posted).toContainEqual(['/hiring/entries/e2/reject', { reason: 'Needs night-shift experience', fromStatusId: 'st2' }]));
    expect((await screen.findAllByText(/You can undo until 10 Nov 2026, 11:30 am. The candidate is not emailed./))[0]).toBeInTheDocument();
  });

  it('answer 272: a not-eligible ex-employee refused past the first stage shows the reason; the card stays', async () => {
    const msg = 'This candidate worked here before and is marked not eligible for rehire, so they stay in the first stage (company setting). Ask HR to review the flag on the candidate record; once cleared, move them on.';
    serve(['pipeline:manage', 'results:view'], (path) => (path === '/hiring/entries/e1/move' ? Promise.reject(Object.assign(new Error(msg), { status: 409 })) : undefined));
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Move Priya Raman' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    expect((await screen.findAllByText(msg)).length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Applied' })).getByText('Priya Raman')).toBeInTheDocument();
  });

  it('a refused move (stale card, 409) shows why and reloads the board', async () => {
    let boards = 0;
    serve(['pipeline:manage', 'results:view'], (path) => {
      if (path === '/hiring/jobs/j1/board') boards++;
      if (path === '/hiring/entries/e1/move') return Promise.reject(Object.assign(new Error('This card was out of date: someone else moved this candidate first.'), { status: 409 }));
      return undefined;
    });
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Move Priya Raman' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    expect((await screen.findAllByText('Could not move Priya Raman'))[0]).toBeInTheDocument();
    await waitFor(() => expect(boards).toBeGreaterThan(1));
  });

  it('Bulk actions opens the sheet: tick, move needs a stage, then moves through the bulk route', async () => {
    const posted = serve(['pipeline:manage', 'results:view'], (path) => (path === '/hiring/entries/bulk' ? { succeeded: 1, skipped: [] } : undefined));
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Bulk actions' }));
    const sheet = await screen.findByRole('dialog', { name: 'Bulk actions' });
    await ue.click(within(sheet).getByRole('checkbox', { name: /Arun Kumar/ }));
    await ue.click(within(sheet).getByRole('button', { name: 'Move' }));
    const d = screen.getAllByRole('dialog').at(-1)!;
    await ue.click(within(d).getByRole('button', { name: 'Move' }));
    expect(await within(d).findByText('Choose the move to.')).toBeInTheDocument();
    expect(posted.filter(([p]) => p === '/hiring/entries/bulk')).toEqual([]);
    await ue.click(within(d).getByRole('combobox', { name: 'Move to' }));
    await ue.click(await screen.findByRole('option', { name: 'Applied' }));
    await ue.click(within(d).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(posted).toContainEqual(['/hiring/entries/bulk', { entryIds: ['e2'], action: 'move', statusId: 'st1' }]));
    expect(router.push).not.toHaveBeenCalledWith(expect.stringContaining('/pipeline/list'));
  });

  it('Add candidate opens the sheet: pressed too early it asks; a new candidate is added to the job', async () => {
    const posted = serve(['pipeline:manage', 'results:view'], (path) => (path === '/jobs/j1/entries' ? {} : undefined));
    wrap(<YxHiringPipelinePage />);
    await ue.click((await screen.findAllByRole('button', { name: 'Add candidate' }))[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'Add candidate' });
    await ue.click(within(sheet).getByRole('button', { name: 'Add to job' }));
    expect(await within(sheet).findByText('Choose the candidate.')).toBeInTheDocument();
    await ue.click(within(sheet).getByRole('radio', { name: 'New candidate' }));
    await ue.type(within(sheet).getByLabelText(/^Name/), 'Divya S');
    await ue.type(within(sheet).getByLabelText(/^Email/), 'divya@example.com');
    await ue.click(within(sheet).getByRole('button', { name: 'Add to job' }));
    await waitFor(() => expect(posted).toContainEqual(['/jobs/j1/entries', { newCandidate: { name: 'Divya S', email: 'divya@example.com' } }]));
  });

  it('a card opens the HIR-05 record with the application; ?entry= links go there too; the job picker opens another job', async () => {
    serve(['pipeline:manage', 'results:view']);
    wrap(<YxHiringPipelinePage />);
    await ue.click(await screen.findByRole('button', { name: 'Priya Raman' }));
    expect(router.push).toHaveBeenCalledWith('/yx/hiring/candidates/c1?entry=e1');
    await ue.click(screen.getByRole('combobox', { name: 'Job' }));
    await ue.click(await screen.findByRole('option', { name: 'Accountant · JOB-0008' }));
    expect(router.push).toHaveBeenCalledWith('/yx/hiring/jobs/j2/pipeline');
  });

  it('an old ?entry= link opens the candidate record', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('entry=e2'));
    serve(['results:view']);
    wrap(<YxHiringPipelinePage />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/yx/hiring/candidates/c2?entry=e2'));
  });

  it('stage targets: a card over the days target and a column over its limit are flagged (answer 263)', async () => {
    serve(['pipeline:manage', 'results:view'], (path) =>
      path === '/hiring/jobs/j1/board'
        ? {
            pipeline: { ...BOARD.pipeline, stages: BOARD.pipeline.stages.map((s) => (s.id === 's1' ? { ...s, daysTarget: 1, stageLimit: null } : s.id === 's2' ? { ...s, daysTarget: null, stageLimit: 1 } : s)) },
            columns: { ...BOARD.columns, s2: [...BOARD.columns.s2, { ...BOARD.columns.s2[0]!, entryId: 'e3', candidateId: 'c3', candidateName: 'Meena Iyer' }] },
          }
        : undefined,
    );
    wrap(<YxHiringPipelinePage />);
    expect(await screen.findByText(/over 1 day target/)).toBeInTheDocument();
    expect(screen.getByText('2 of 1')).toBeInTheDocument();
  });

  it('a hiring manager (results:view only) reads the board with no move controls', async () => {
    serve(['results:view']);
    wrap(<YxHiringPipelinePage />);
    expect(await screen.findByText(/Read-only: moving candidates needs the job-manage key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Priya Raman' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share feedback' })).toBeInTheDocument();
  });

  it('acting for someone else: read-only even with the key', async () => {
    auth({ impersonating: true });
    serve(['pipeline:manage', 'results:view']);
    wrap(<YxHiringPipelinePage />);
    expect(await screen.findByText(/Read-only while acting for someone else/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Priya Raman' })).not.toBeInTheDocument();
  });

  it('the board fails to load: error with Retry, nothing moved', async () => {
    serve(['pipeline:manage'], (path) => (path === '/hiring/jobs/j1/board' ? Promise.reject(Object.assign(new Error('Server error'), { status: 500 })) : undefined));
    wrap(<YxHiringPipelinePage />);
    expect(await screen.findByText("Couldn't load the pipeline")).toBeInTheDocument();
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
