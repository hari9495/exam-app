import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AddCandidateSheet, BulkActionsSheet } from './pipeline-sheets';
import { ApplicationDrawer } from './candidate-application';
import { JobSettingsPanel, StageTargetsSheet, type LiveJobSettings } from './job-settings';
import { PipelineBoardScreen, type LivePipelineBoard } from './hiring-pipeline';
import { sampleBulk } from './hir-04-pipeline.stories';
import { sampleApplication } from './hir-05-candidate.stories';

// HIR-04 follow-ups (founder answers 261 and 263): the Bulk actions and Add candidate sheets, the job settings on the
// HIR-03 workspace with stage targets, the application on the HIR-05 record, and targets on the live board.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const lastDialog = () => screen.getAllByRole('dialog').at(-1)!;

describe('HIR-04 Bulk actions sheet', () => {
  it('lists the job with scorecard results and undoes a waiting rejection with a toast', async () => {
    const onUndo = vi.fn(async () => undefined);
    show(<BulkActionsSheet {...sampleBulk} onUndo={onUndo} />);
    expect(screen.getByText('Passes the bar (4.2)')).toBeInTheDocument();
    expect(screen.getByText('Scorecards 1 of 2')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Undo rejection of Arjun Kulkarni' }));
    expect(onUndo).toHaveBeenCalledWith('e3');
    expect((await screen.findAllByText('Arjun Kulkarni is back where they were')).length).toBeGreaterThan(0);
  });

  it('reject asks for a reason and the message (24 hours by default) before it sends anything', async () => {
    const onReject = vi.fn(async () => undefined);
    show(<BulkActionsSheet {...sampleBulk} onReject={onReject} />);
    await ue.click(screen.getByRole('checkbox', { name: /Vikram Reddy/ }));
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    const d = lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Reject' }));
    expect(within(d).getByText('Enter a reason.')).toBeInTheDocument();
    expect(onReject).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Reason/), 'Needs night-shift experience');
    await ue.click(within(d).getByRole('combobox', { name: 'Template' }));
    await ue.click(screen.getByRole('option', { name: 'Regret' }));
    await ue.click(within(d).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onReject).toHaveBeenCalledWith(['e2'], { reason: 'Needs night-shift experience', delayHours: 24, message: { templateId: 't1', subject: 'Your application', body: 'Thank you, {{candidateName}}.' } }));
  });

  it('send a test to the ticked candidates; export CSV', async () => {
    const onTest = vi.fn(async () => ({ succeeded: 2, skipped: [] }));
    const onExport = vi.fn(async () => undefined);
    show(<BulkActionsSheet {...sampleBulk} onTest={onTest} onExport={onExport} defaultSelected={['e1', 'e2']} />);
    await ue.click(screen.getByRole('button', { name: 'Send a test' }));
    await ue.click(within(lastDialog()).getByRole('combobox', { name: 'Test' }));
    await ue.click(screen.getByRole('option', { name: 'QA aptitude' }));
    await ue.click(within(lastDialog()).getByRole('button', { name: 'Send test' }));
    await waitFor(() => expect(onTest).toHaveBeenCalledWith(['e1', 'e2'], 'x1'));
    await ue.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExport).toHaveBeenCalled();
  });
});

describe('HIR-04 Add candidate sheet', () => {
  it('pressed too early it asks for the candidate; a new one needs a valid email', async () => {
    const onAdd = vi.fn(async () => undefined);
    show(<AddCandidateSheet open onOpenChange={() => {}} job="Plant Engineer" candidates={[{ value: 'c9', label: 'Divya S · divya@example.com' }]} onAdd={onAdd} />);
    const add = screen.getByRole('button', { name: 'Add to job' });
    expect(add).toBeEnabled();
    await ue.click(add);
    expect(await screen.findByText('Choose the candidate.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'New candidate' }));
    await ue.type(screen.getByLabelText(/^Name/), 'Divya S');
    await ue.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await ue.click(add);
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    await ue.clear(screen.getByLabelText(/^Email/));
    await ue.type(screen.getByLabelText(/^Email/), 'divya@example.com');
    await ue.click(add);
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ newCandidate: { name: 'Divya S', email: 'divya@example.com' } }));
  });
});

const settings = (over: Partial<LiveJobSettings> = {}): LiveJobSettings => ({
  canManage: true,
  canConfigure: true,
  job: { status: 'open', publicApplyEnabled: true, listOnCareers: false, applyUrl: 'https://hr.example.com/apply/abc', boardIds: [], fitCriteria: null, fitRubric: [] },
  settings: { scorecardTemplateId: null, exams: [{ examId: 'x1', title: 'Plant aptitude', sendOnStageId: null }] },
  pipelineName: 'Standard',
  stages: [{ id: 's1', name: 'Applied', daysTarget: null, limit: null }, { id: 's2', name: 'Interview', daysTarget: 7, limit: 6 }],
  sendStages: [{ value: 's1', label: 'Applied' }, { value: 's2', label: 'Interview' }],
  exams: [{ value: 'x1', label: 'Plant aptitude' }, { value: 'x2', label: 'Safety basics' }],
  scorecardTemplates: [{ value: 'tp1', label: 'Engineer round 1' }],
  jobBoards: [{ value: 'b1', label: 'Naukri' }],
  onLinkExam: vi.fn(async () => undefined),
  onUnlinkExam: vi.fn(async () => undefined),
  onSendOn: vi.fn(async () => undefined),
  onScorecard: vi.fn(async () => undefined),
  onUpdateJob: vi.fn(async () => undefined),
  onCopy: vi.fn(async () => undefined),
  onOpenSettings: vi.fn(),
  ...over,
});

describe('HIR-03 job settings (answer 261) and stage targets (answer 263)', () => {
  it('a linked test is sent when entering a stage; Link test pressed too early asks for the test', async () => {
    const live = settings();
    show(<JobSettingsPanel live={live} />);
    await ue.click(screen.getByRole('combobox', { name: 'Send Plant aptitude when entering' }));
    await ue.click(screen.getByRole('option', { name: 'Applied' }));
    await waitFor(() => expect(live.onSendOn).toHaveBeenCalledWith('x1', 's1'));
    await ue.click(screen.getByRole('button', { name: 'Link test' }));
    expect(await screen.findByText('Choose the test to link.')).toBeInTheDocument();
    expect(live.onLinkExam).not.toHaveBeenCalled();
  });

  it('stage targets are read-only on the job (answer 302): Change in Settings opens Settings › Hiring', async () => {
    const live = settings();
    show(<JobSettingsPanel live={live} />);
    expect(screen.getByText('7 days target · limit 6')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save stage targets' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change in Settings' }));
    expect(live.onOpenSettings).toHaveBeenCalled();
  });

  it('stage targets sheet (Settings › Hiring): out of range is refused and focused; a change saves only the changed stage, empty clears it', async () => {
    const onSave = vi.fn(async () => undefined);
    const stages = [{ id: 's1', name: 'Applied', daysTarget: null, limit: null }, { id: 's2', name: 'Interview', daysTarget: 7, limit: 6 }];
    show(<StageTargetsSheet open onOpenChange={() => undefined} pipelineName="Standard" stages={stages} canEdit onSave={onSave} />);
    const days = screen.getByLabelText(/^Applied: days target/);
    await ue.type(days, '0');
    await ue.click(screen.getByRole('button', { name: 'Save stage targets' }));
    expect((await screen.findAllByText(/1 to 365 days|between 1 and 365/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.activeElement?.id).toBe('st-days-0'));
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(days);
    await ue.clear(screen.getByLabelText(/^Interview: limit/));
    await ue.click(screen.getByRole('button', { name: 'Save stage targets' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ stageId: 's2', daysTarget: 7, limit: null }]));
  });

  it('stage targets sheet without the pipelines key shows the values as text', () => {
    show(<StageTargetsSheet open onOpenChange={() => undefined} pipelineName="Standard" stages={[{ id: 's2', name: 'Interview', daysTarget: 7, limit: 6 }]} canEdit={false} />);
    expect(screen.getByText('7 days target · limit 6')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save stage targets' })).not.toBeInTheDocument();
  });

  it('without the keys the values are text, nothing can be changed', () => {
    show(<JobSettingsPanel live={settings({ canManage: false, canConfigure: false })} />);
    expect(screen.getByText('7 days target · limit 6')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change in Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link test' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('fit rubric weights are per cent and must add up to 100 before saving', async () => {
    const live = settings({ job: { ...settings().job, fitRubric: [{ label: 'Plant experience', weight: 60 }, { label: 'Safety', weight: 30 }] } });
    show(<JobSettingsPanel live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Save fit criteria' }));
    expect(await screen.findByText(/must add up to 100 per cent \(now 90\)/)).toBeInTheDocument();
    expect(live.onUpdateJob).not.toHaveBeenCalled();
    const w = screen.getByLabelText(/^Weight 2/);
    await ue.clear(w);
    await ue.type(w, '40');
    await ue.click(screen.getByRole('button', { name: 'Save fit criteria' }));
    await waitFor(() => expect(live.onUpdateJob).toHaveBeenCalledWith({ fitCriteria: null, fitRubric: [{ label: 'Plant experience', weight: 60 }, { label: 'Safety', weight: 40 }] }));
  });

  it('turning on public applying for a job that is not open says why and saves nothing', async () => {
    const live = settings({ job: { ...settings().job, status: 'on_hold', publicApplyEnabled: false } });
    show(<JobSettingsPanel live={live} />);
    await ue.click(screen.getByRole('switch', { name: /Take applications through a public link/ }));
    expect((await screen.findAllByText(/Only an open job takes applications/)).length).toBeGreaterThan(0);
    expect(live.onUpdateJob).not.toHaveBeenCalled();
  });
});

describe('HIR-05 application on the record (answer 261)', () => {
  it('HIR-09: the offers tab opens the offer builder and each offer’s record; one open offer at a time', async () => {
    const onNewOffer = vi.fn();
    const onOpenOffer = vi.fn();
    show(<ApplicationDrawer {...sampleApplication} onNewOffer={onNewOffer} onOpenOffer={onOpenOffer} app={{ ...sampleApplication.app!, offers: [] }} />);
    await ue.click(screen.getByRole('tab', { name: /Offers/ }));
    await ue.click(screen.getByRole('button', { name: 'Create an offer' }));
    expect(onNewOffer).toHaveBeenCalled();
    cleanup();
    const open = { ...sampleApplication.app!, offers: [{ id: 'o1', status: 'sent', compensation: null, startDate: '2026-12-01', expiresAt: '2026-11-15' }] };
    show(<ApplicationDrawer {...sampleApplication} onNewOffer={onNewOffer} onOpenOffer={onOpenOffer} app={open} />);
    await ue.click(screen.getByRole('tab', { name: /Offers/ }));
    // Pay hidden (no offer-pay key): the card still opens the offer.
    expect(screen.queryByRole('button', { name: 'Create an offer' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open offer' }));
    expect(onOpenOffer).toHaveBeenCalledWith('o1');
  });

  it('read-only: no SMS when the person opted out, the owner and checklist as text', async () => {
    show(<ApplicationDrawer {...sampleApplication} canManage={false} app={{ ...sampleApplication.app!, smsOptedOut: true }} />);
    expect(screen.queryByRole('combobox', { name: 'Owner' })).not.toBeInTheDocument();
    expect(screen.getByText('Anil')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'References checked' })).not.toBeInTheDocument();
  });
});

const board = (over: Partial<LivePipelineBoard> = {}): LivePipelineBoard => ({
  state: 'ready',
  onRetry: vi.fn(),
  job: 'Plant Engineer',
  jobId: 'j1',
  jobs: [{ value: 'j1', label: 'Plant Engineer' }],
  onJob: vi.fn(),
  canMove: true,
  stages: [
    { id: 's1', title: 'Applied', rejected: false, daysTarget: 2, limit: null },
    { id: 's2', title: 'Panel', rejected: false, daysTarget: null, limit: 1 },
  ],
  cards: [
    { id: 'e1', stageId: 's1', name: 'Priya Raman', line: 'priya@example.com', scores: [], next: '', flags: [], daysInStage: 5 },
    { id: 'e2', stageId: 's2', name: 'Arun Kumar', line: 'arun@example.com', scores: [], next: '', flags: [], daysInStage: 1 },
    { id: 'e3', stageId: 's2', name: 'Meena Iyer', line: 'meena@example.com', scores: [], next: '', flags: [], daysInStage: 1 },
  ],
  onMove: vi.fn(async () => undefined),
  onReject: vi.fn(async () => ({ description: '', undo: null })),
  onOpen: vi.fn(),
  bulk: { ...sampleBulk },
  add: { candidates: [], onAdd: vi.fn(async () => undefined) },
  ...over,
});

describe('HIR-04 live board: targets and sheets', () => {
  it('a card over its days target and a stage over its limit are flagged; no target, no flag', () => {
    show(<PipelineBoardScreen live={board()} />);
    expect(screen.getByText(/over 2 days target/)).toBeInTheDocument();
    expect(screen.getByText('2 of 1')).toBeInTheDocument();
    expect(screen.getAllByText(/over .* target/)).toHaveLength(1);
  });

  it('Bulk actions and Add candidate open their sheets on the board', async () => {
    const live = board();
    show(<PipelineBoardScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Bulk actions' }));
    expect(await screen.findByRole('dialog', { name: 'Bulk actions' })).toBeInTheDocument();
    await ue.click(within(screen.getByRole('dialog', { name: 'Bulk actions' })).getAllByRole('button', { name: 'Close' }).at(-1)!);
    await ue.click(screen.getAllByRole('button', { name: 'Add candidate' })[0]!);
    expect(await screen.findByRole('dialog', { name: 'Add candidate' })).toBeInTheDocument();
  });
});
