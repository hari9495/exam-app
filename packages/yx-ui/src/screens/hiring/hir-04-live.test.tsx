import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { PipelineBoardScreen, type LivePipelineBoard } from './hiring-pipeline';

// HIR-04 pipeline board, live (sample data): a recruiter moves cards by the keyboard "Move to" menu, rejecting asks for a
// reason first, a refused move puts the card back and says why; a hiring manager (or anyone acting for someone else)
// reads the board without move controls (decision 11).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const live = (o: Partial<LivePipelineBoard> = {}): LivePipelineBoard => ({
  state: 'ready',
  onRetry: vi.fn(),
  job: 'Plant Engineer',
  jobId: 'j1',
  jobs: [{ value: 'j1', label: 'Plant Engineer · JOB-0007' }, { value: 'j2', label: 'Accountant · JOB-0008' }],
  onJob: vi.fn(),
  canMove: true,
  stages: [
    { id: 's1', title: 'Applied', rejected: false },
    { id: 's2', title: 'Interview', rejected: false },
    { id: 's3', title: 'Hired', rejected: false, collapsed: true },
    { id: 's4', title: 'Rejected', rejected: true },
  ],
  cards: [
    { id: 'e1', stageId: 's1', name: 'Priya Raman', line: 'priya@example.com · Careers site', scores: [{ label: 'Test', value: '78', tone: 'success' }], next: 'Interview 12 Nov 2026, 11:00 am', flags: [], daysInStage: 2 },
    { id: 'e2', stageId: 's2', name: 'Arun Kumar', line: 'arun@example.com · Referral', scores: [], next: 'nothing scheduled', flags: ['Internal applicant'], daysInStage: 0 },
  ],
  onMove: vi.fn(async () => undefined),
  onReject: vi.fn(async () => ({ description: 'The candidate is not emailed.', undo: vi.fn(async () => undefined) })),
  onOpen: vi.fn(),
  onBulk: vi.fn(),
  onAdd: vi.fn(),
  ...o,
});
const show = (l: LivePipelineBoard) => render(<ToastProvider><PipelineBoardScreen live={l} /></ToastProvider>);
const column = (title: string) => screen.getByRole('region', { name: title });

describe('HIR-04 live board', () => {
  it('shows the stages as columns with the cards, their scores and next step', () => {
    show(live());
    expect(screen.getByText(/Plant Engineer · 2 candidates/)).toBeInTheDocument();
    expect(within(column('Applied')).getByText('Priya Raman')).toBeInTheDocument();
    expect(within(column('Applied')).getByText('Next: Interview 12 Nov 2026, 11:00 am')).toBeInTheDocument();
    expect(within(column('Interview')).getByText('Internal applicant')).toBeInTheDocument();
  });

  it('keyboard: the Move to menu moves a card, with a 5-second toast', async () => {
    const l = live();
    show(l);
    screen.getByRole('button', { name: 'Move Priya Raman' }).focus();
    await ue.keyboard('{Enter}');
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    await waitFor(() => expect(l.onMove).toHaveBeenCalledWith('e1', 's2'));
    expect((await screen.findAllByText('Priya Raman moved to Interview'))[0]).toBeInTheDocument();
    expect(within(column('Interview')).getByText('Priya Raman')).toBeInTheDocument();
  });

  it('rejecting asks for a reason (error and focus when it is empty), then toasts with Undo', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Move Arun Kumar' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Rejected' }));
    await ue.click(await screen.findByRole('button', { name: 'Move to Rejected' }));
    expect(screen.getByText('Enter a reason. It is saved on the record.')).toBeInTheDocument();
    expect(l.onReject).not.toHaveBeenCalled();
    const reason = screen.getByRole('textbox', { name: /Reason/ });
    expect(reason).toHaveFocus();
    await ue.type(reason, 'Needs night-shift experience');
    await ue.click(screen.getByRole('button', { name: 'Move to Rejected' }));
    await waitFor(() => expect(l.onReject).toHaveBeenCalledWith('e2', 'Needs night-shift experience'));
    expect((await screen.findAllByText('Arun Kumar rejected'))[0]).toBeInTheDocument();
    expect(screen.getAllByText('The candidate is not emailed.')[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument();
  });

  it('a refused move (someone moved them first) puts the card back and says why', async () => {
    const l = live({ onMove: vi.fn(async () => Promise.reject(new Error('This card was out of date: someone else moved this candidate first.'))) });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Move Priya Raman' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    expect((await screen.findAllByText('Could not move Priya Raman'))[0]).toBeInTheDocument();
    expect(screen.getAllByText(/someone else moved this candidate first/)[0]).toBeInTheDocument();
    await waitFor(() => expect(within(column('Applied')).getByText('Priya Raman')).toBeInTheDocument());
  });

  it('header actions: Bulk actions, Add candidate, another job, open a card', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Bulk actions' }));
    expect(l.onBulk).toHaveBeenCalled();
    await ue.click(screen.getAllByRole('button', { name: 'Add candidate' })[0]);
    expect(l.onAdd).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Priya Raman' }));
    expect(l.onOpen).toHaveBeenCalledWith('e1');
    await ue.click(screen.getByRole('combobox', { name: 'Job' }));
    await ue.click(screen.getByRole('option', { name: 'Accountant · JOB-0008' }));
    expect(l.onJob).toHaveBeenCalledWith('j2');
  });

  it('a hiring manager reads the board: no move menu, no drag, Share feedback instead of the recruiter actions', async () => {
    const l = live({ canMove: false, readOnlyNote: 'Read-only: moving candidates needs the job-manage key.' });
    show(l);
    expect(screen.getByText(/Read-only: moving candidates needs the job-manage key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Priya Raman' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Priya Raman' })).toHaveAttribute('draggable', 'false');
    expect(screen.queryByRole('button', { name: 'Bulk actions' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Share feedback' }));
    expect((await screen.findAllByText('Open a candidate to share feedback'))[0]).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Priya Raman' }));
    expect(l.onOpen).toHaveBeenCalledWith('e1');
  });

  it('states: loading, error with Try again, and empty', async () => {
    const { rerender } = show(live({ state: 'loading' }));
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    const l = live({ state: 'error' });
    rerender(<ToastProvider><PipelineBoardScreen live={l} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(l.onRetry).toHaveBeenCalled();
    rerender(<ToastProvider><PipelineBoardScreen live={live({ cards: [] })} /></ToastProvider>);
    expect(screen.getByText('No candidates in this pipeline yet.')).toBeInTheDocument();
  });
});
