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
  recruiter: { id: 'u1', choices: [{ value: 'u1', label: 'Neha Joshi' }, { value: 'u2', label: 'Imran Qureshi' }], onChange: vi.fn(async () => undefined) },
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

describe('HIR-03 founder answers 222, 223, 225 (live)', () => {
  it('shows the job number; puts an open job on hold, resumes or closes a held one', async () => {
    const held: LiveJobRow = { ...JOBS[3], id: 'j4', code: 'JOB-0004', status: 'On hold', careersUrl: null };
    const live = jobs({ rows: [{ ...ROWS[0], code: 'JOB-0001' }, held] });
    render(<JobsScreen rows={[]} live={live} />);
    expect(screen.getByText('JOB-0001')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[0]);
    await ue.click(screen.getByRole('menuitem', { name: 'Put on hold' }));
    expect(live.onStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'j1' }), 'on_hold');
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[1]);
    expect(screen.queryByRole('menuitem', { name: 'Put on hold' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('menuitem', { name: 'Resume job' }));
    expect(live.onStatus).toHaveBeenCalledWith(held, 'open');
    await ue.click(screen.getAllByRole('button', { name: /More actions/ })[1]);
    await ue.click(screen.getByRole('menuitem', { name: 'Close job' }));
    expect(live.onStatus).toHaveBeenCalledWith(held, 'closed');
  });

  it('exports the visible columns as CSV', async () => {
    const made: Blob[] = [];
    const create = vi.fn((b: Blob) => (made.push(b), 'blob:x'));
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    render(<JobsScreen rows={[]} live={jobs({ rows: [{ ...ROWS[0], code: 'JOB-0001' }] })} now={new Date(2026, 10, 9)} />);
    await ue.click(screen.getByRole('button', { name: 'Export' }));
    await ue.click(screen.getByRole('menuitem', { name: 'CSV (visible columns)' }));
    expect(create).toHaveBeenCalledTimes(1);
    const text = await made[0].text();
    expect(text).toContain('Job,Title,Type,Status');
    expect(text).toContain('JOB-0001,Senior QA Engineer');
  });

  it('workspace: put on hold, resume; change recruiter needs a different person', async () => {
    const live = ws();
    const { rerender } = render(<JobWorkspaceScreen job={{ ...JOBS[0], code: 'JOB-0001', status: 'Open' }} postings={[]} law={NONE} range={{ min: 1, max: 2 }} activity={[]} live={live} />);
    expect(screen.getByText(/JOB-0001/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /More actions|More/ }));
    await ue.click(screen.getByRole('menuitem', { name: 'Put on hold' }));
    expect(live.onStatus).toHaveBeenCalledWith('on_hold');
    rerender(<JobWorkspaceScreen job={{ ...JOBS[0], status: 'On hold' }} postings={[]} law={NONE} range={{ min: 1, max: 2 }} activity={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: /More actions|More/ }));
    await ue.click(screen.getByRole('menuitem', { name: 'Resume job' }));
    expect(live.onStatus).toHaveBeenCalledWith('open');
    await ue.click(screen.getByRole('button', { name: /More actions|More/ }));
    await ue.click(screen.getByRole('menuitem', { name: 'Change recruiter' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Change recruiter' }));
    expect(within(d).getByText('Choose someone other than the current recruiter.')).toBeInTheDocument();
    expect(live.recruiter.onChange).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: 'New recruiter' }));
    await ue.click(screen.getByRole('option', { name: 'Imran Qureshi' }));
    await ue.click(within(d).getByRole('button', { name: 'Change recruiter' }));
    expect(live.recruiter.onChange).toHaveBeenCalledWith('u2');
  });

  it('read-only: no job menu (no hold, no recruiter change)', () => {
    render(<JobWorkspaceScreen job={{ ...JOBS[0], status: 'Open' }} postings={[]} law={NONE} range={{ min: 1, max: 2 }} activity={[]} live={ws({ canManage: false })} />);
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});

describe('HIR-03 founder answers 241, 244 (live)', () => {
  it('Jobs export offers CSV only (241)', async () => {
    render(<JobsScreen rows={[]} live={jobs({ rows: [{ ...ROWS[0], code: 'JOB-0001' }] })} />);
    await ue.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByRole('menuitem', { name: 'CSV (visible columns)' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excel (visible columns)' })).not.toBeInTheDocument();
  });

  it('a typed place abroad is refused before sending; India typed is sent with its country (244)', async () => {
    const live = jobs({ create: { choices: { ...CHOICES, customFields: [] }, onCreate: vi.fn(async () => undefined) } });
    render(<JobsScreen rows={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Analyst');
    await ue.type(within(d).getByRole('textbox', { name: /^Location/ }), 'Boston');
    await ue.click(within(d).getByRole('combobox', { name: 'Country of the place' }));
    await ue.type(within(d).getByRole('combobox', { name: 'Country of the place' }), 'United States');
    await ue.click(await screen.findByRole('option', { name: 'United States' }));
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(within(d).getByText('This place is outside India. Add it in Settings › Locations first, then choose it.')).toBeInTheDocument();
    expect(live.create.onCreate).not.toHaveBeenCalled();
  });

  it('a typed place in India (the default country) is sent with its country (244)', async () => {
    const live = jobs({ create: { choices: { ...CHOICES, customFields: [] }, onCreate: vi.fn(async () => undefined) } });
    render(<JobsScreen rows={[]} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Create job' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Analyst');
    await ue.type(within(d).getByRole('textbox', { name: /^Location/ }), 'Madurai');
    await ue.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(live.create.onCreate).toHaveBeenCalledWith(expect.objectContaining({ location: 'Madurai', locationCountry: 'IN' }));
  });
});
