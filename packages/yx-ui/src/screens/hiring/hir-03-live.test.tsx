import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobsScreen, JobWorkspaceScreen, type CreateJobChoices, type LiveJobRow, type LiveJobs, type LiveJobWorkspace } from './hiring-plan';
import { JOBS, POSTINGS } from './hiring-data';

// HIR-03 / HIR-24 made live: the designed jobs list, create-job sheet, job workspace and pay range with sample data.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

const CHOICES: CreateJobChoices = {
  departments: [{ value: 'd1', label: 'Finance' }],
  locations: [],
  designations: [],
  managers: [{ value: 'u1', label: 'Divya Raghunathan' }],
  pipelines: [{ value: 'p1', label: 'Standard', isDefault: true }],
  planLines: [],
  employees: [{ value: 'e1', label: 'Rohit Bhat' }],
  customFields: [{ id: 'cf1', label: 'Cost centre', fieldType: 'text', options: null, required: true }],
  showRangeByDefault: false,
};
const ROWS: LiveJobRow[] = [
  { ...JOBS[0], id: 'j1', status: 'Open', careersUrl: 'https://x.test/careers/kaveri/jobs/qa' },
  { ...JOBS[1], id: 'j2', status: 'Draft', careersUrl: null },
  { ...JOBS[2], id: 'j3', status: 'Waiting for approval', careersUrl: null },
];
const jobs = (o: Partial<LiveJobs> = {}): LiveJobs => ({
  rows: ROWS,
  state: 'ready',
  onRetry: vi.fn(),
  canManage: true,
  onOpen: vi.fn(),
  create: { choices: CHOICES, onCreate: vi.fn(async () => undefined) },
  onCopyLink: vi.fn(),
  onStatus: vi.fn(),
  onSubmit: vi.fn(),
  onWithdraw: vi.fn(),
  onDelete: vi.fn(async () => undefined),
  ...o,
});

describe('HIR-03 jobs list (live)', () => {
  it('lists, searches, opens a job and offers the actions its status allows', async () => {
    const live = jobs();
    render(<JobsScreen rows={[]} live={live} />);
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
    await ue.click(screen.getByText('Senior QA Engineer'));
    expect(live.onOpen).toHaveBeenCalledWith('j1');
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[0]);
    await ue.click(screen.getByRole('menuitem', { name: 'Copy careers link' }));
    expect(live.onCopyLink).toHaveBeenCalledWith(ROWS[0]);
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[0]);
    await ue.click(screen.getByRole('menuitem', { name: 'Close job' }));
    expect(live.onStatus).toHaveBeenCalledWith(ROWS[0], 'closed');
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[1]);
    await ue.click(screen.getByRole('menuitem', { name: 'Send for approval' }));
    expect(live.onSubmit).toHaveBeenCalledWith(ROWS[1]);
  });

  it('deletes only after confirming', async () => {
    const live = jobs();
    render(<JobsScreen rows={[]} live={live} />);
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[2]);
    await ue.click(screen.getByRole('menuitem', { name: 'Delete job' }));
    expect(live.onDelete).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete job' }));
    expect(live.onDelete).toHaveBeenCalledWith(ROWS[2]);
  });

  it('without the manage right: no Create job, no close or delete; the careers link still copies', async () => {
    render(<JobsScreen rows={[]} live={jobs({ canManage: false })} />);
    expect(screen.queryByRole('button', { name: 'Create job' })).not.toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[0]);
    expect(screen.queryByRole('menuitem', { name: 'Close job' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy careers link' })).toBeInTheDocument();
  });

  it('loading and error states come from the API', () => {
    const { rerender } = render(<JobsScreen rows={[]} live={jobs({ rows: [], state: 'error' })} />);
    expect(screen.getByRole('button', { name: /Try again|Retry/ })).toBeInTheDocument();
    rerender(<JobsScreen rows={[]} live={jobs({ rows: [] })} />);
    expect(screen.getByText('No jobs yet.')).toBeInTheDocument();
  });

  it('create job: pressed too early shows the errors and sends nothing; filled, it sends the job', async () => {
    const live = jobs();
    render(<JobsScreen rows={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(within(d).getByText('Enter the job title.')).toBeInTheDocument();
    expect(within(d).getByText('Enter the Cost centre.')).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: /Job title/ })).toHaveFocus();
    expect(live.create.onCreate).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Accountant');
    await ue.type(within(d).getByRole('textbox', { name: /^Location/ }), 'Madurai');
    await ue.type(within(d).getByRole('textbox', { name: /Cost centre/ }), 'CC-12');
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(live.create.onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Accountant', location: 'Madurai', pipelineId: 'p1', requisitionReason: 'new', customFields: { cf1: 'CC-12' } }));
    expect(vi.mocked(live.create.onCreate).mock.calls[0][0].showSalary).toBeUndefined();
  });

  it('create job: a replacement needs the person replaced; a server refusal shows in the sheet', async () => {
    const live = jobs({ create: { choices: { ...CHOICES, customFields: [] }, onCreate: vi.fn(async () => Promise.reject(new Error('Choose a department of this company.'))) } });
    render(<JobsScreen rows={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Clerk');
    await ue.click(within(d).getByRole('radio', { name: 'Replacement' }));
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(within(d).getByText('Choose who this hire replaces.')).toBeInTheDocument();
    expect(live.create.onCreate).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('radio', { name: 'New position' }));
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(await within(d).findByText('Choose a department of this company.')).toBeInTheDocument();
  });
});

describe('HIR-03 requisitions in the jobs list (moved from the AT2 stand-in)', () => {
  it('a pending one is withdrawn, and outside the plan needs a reason', async () => {
    const live = jobs({ create: { choices: { ...CHOICES, customFields: [] }, onCreate: vi.fn(async () => undefined) } });
    render(<JobsScreen rows={[]} live={live} />);
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[2]);
    await ue.click(screen.getByRole('menuitem', { name: 'Withdraw from approval' }));
    expect(live.onWithdraw).toHaveBeenCalledWith(ROWS[2]);
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Buyer');
    await ue.click(within(d).getByRole('checkbox', { name: /Outside the headcount plan/ }));
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(within(d).getByText('Enter a reason of at least 3 characters.')).toBeInTheDocument();
    expect(live.create.onCreate).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Why outside the plan/ }), 'New client');
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(live.create.onCreate).toHaveBeenCalledWith(expect.objectContaining({ requisitionReason: 'new', outsidePlan: true, outsidePlanReason: 'New client' }));
  });
});

const NY = { rangeRequired: true, historyBanned: true, source: 'New York pay transparency law' };
const NONE = { rangeRequired: false, historyBanned: false };
const ws = (o: Partial<LiveJobWorkspace> = {}): LiveJobWorkspace => ({
  state: 'ready',
  onRetry: vi.fn(),
  canManage: true,
  careersUrl: null,
  overview: [{ label: 'Pipeline', value: '6 Applied · 2 Interview' }],
  postings: [
    { ...POSTINGS[0], boardId: 'b1' },
    { ...POSTINGS[3], boardId: 'b4' },
  ],
  onPosting: vi.fn(async () => undefined),
  pay: { currency: 'USD', period: 'year', show: true, askHistory: false, companyShows: false, published: false, canManage: true, onSave: vi.fn(async () => undefined) },
  onOpenPipeline: vi.fn(),
  onViewCareers: vi.fn(),
  onStatus: vi.fn(async () => undefined),
  ...o,
});

describe('HIR-03 job workspace and HIR-24 pay range (live)', () => {
  it('shows the overview, opens the pipeline and acts on a board posting', async () => {
    const live = ws();
    render(<JobWorkspaceScreen job={{ ...JOBS[0], status: 'Open' }} postings={[]} law={NONE} range={{ min: null, max: null }} activity={[]} live={live} />);
    expect(screen.getByText('6 Applied · 2 Interview')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Referrals/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View careers page' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open pipeline' }));
    expect(live.onOpenPipeline).toHaveBeenCalled();
    await ue.click(screen.getByRole('tab', { name: /Job-board postings/ }));
    await ue.click(screen.getByRole('button', { name: 'Retry post' }));
    expect(live.onPosting).toHaveBeenCalledWith(live.postings[1], 'post');
    await ue.click(screen.getByRole('button', { name: 'Close' }));
    expect(live.onPosting).toHaveBeenCalledWith(live.postings[0], 'close');
  });

  it('read-only: no posting buttons, the pay range cannot be changed', async () => {
    render(<JobWorkspaceScreen job={{ ...JOBS[0], status: 'Open' }} postings={[]} law={NONE} range={{ min: 1, max: 2 }} activity={[]} live={ws({ canManage: false, pay: { ...ws().pay, canManage: false } })} />);
    await ue.click(screen.getByRole('tab', { name: /Job-board postings/ }));
    expect(screen.queryByRole('button', { name: 'Retry post' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Pay range' }));
    expect(screen.queryByRole('button', { name: /Publish job|Save pay range/ })).not.toBeInTheDocument();
  });

  it('where the law requires it: the range is always shown, the pay-history question is off, publishing waits for the range', async () => {
    const live = ws();
    render(<JobWorkspaceScreen job={{ ...JOBS[0], location: 'New York office', status: 'Open' }} postings={[]} law={NY} range={{ min: null, max: null }} activity={[]} defaultTab="pay" live={live} />);
    expect(screen.getByText(/New York office has a pay-transparency law/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Show pay range/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Ask applicants about their current or past pay/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Ask applicants/ })).not.toBeChecked();
    const publish = screen.getByRole('button', { name: 'Publish job' });
    expect(publish).toBeEnabled();
    await ue.click(publish);
    expect(screen.getByText(/The law for this location requires a pay range/)).toBeInTheDocument();
    expect(live.pay.onSave).not.toHaveBeenCalled();
    const [min, max] = screen.getAllByRole('textbox').slice(0, 2);
    expect(min).toHaveFocus();
    await ue.type(min, '95000');
    await ue.type(max, '120000');
    await ue.click(publish);
    expect(live.pay.onSave).toHaveBeenCalledWith(expect.objectContaining({ min: 95000, max: 120000, currency: 'USD', show: true, askHistory: false, publish: true }));
  });

  it('company setting (India): the range can be hidden; minimum above maximum is refused before sending', async () => {
    const live = ws({ pay: { ...ws().pay, currency: 'INR', published: true } });
    render(<JobWorkspaceScreen job={{ ...JOBS[0], status: 'Open' }} postings={[]} law={NONE} range={{ min: 20_00_000, max: 16_00_000 }} activity={[]} defaultTab="pay" live={live} />);
    expect(screen.getByText(/Company setting: hidden on new jobs/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Ask applicants/ })).toBeEnabled();
    await ue.click(screen.getByRole('button', { name: 'Save pay range' }));
    expect(screen.getByText('Minimum must be less than or equal to maximum.')).toBeInTheDocument();
    expect(live.pay.onSave).not.toHaveBeenCalled();
  });

  it('a save the server refuses keeps the message on the panel', async () => {
    const live = ws({ pay: { ...ws().pay, onSave: vi.fn(async () => Promise.reject(new Error('The New York pay transparency law requires the pay range on the job.'))) } });
    render(<JobWorkspaceScreen job={{ ...JOBS[0], status: 'Open' }} postings={[]} law={NONE} range={{ min: 1, max: 2 }} activity={[]} defaultTab="pay" live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Publish job' }));
    expect(await screen.findByText(/requires the pay range on the job/)).toBeInTheDocument();
  });

  it('loading and error', () => {
    const { rerender } = render(<JobWorkspaceScreen job={JOBS[0]} postings={[]} law={NONE} range={{ min: null, max: null }} activity={[]} live={ws({ state: 'loading' })} />);
    expect(screen.getByLabelText('Loading the job')).toBeInTheDocument();
    rerender(<JobWorkspaceScreen job={JOBS[0]} postings={[]} law={NONE} range={{ min: null, max: null }} activity={[]} live={ws({ state: 'error' })} />);
    expect(screen.getByText('This job could not be loaded.')).toBeInTheDocument();
  });
});
