import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { InternalJobsScreen, JobWorkspaceScreen, type InternalApplication, type LiveInternalJobs, type LiveJobWorkspace } from './hiring-plan';
import { JOBS, POSTINGS } from './hiring-data';

// HIR-13 internal jobs, the designed screen with `live`, and the job workspace's "Referrals & internal" tab (answer 226):
// positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const OPEN = JOBS.filter((j) => j.internal && j.status === 'Open');
const APPS: InternalApplication[] = [
  { id: 'a1', job: 'Quality Manager, Hosur', applied: new Date(2026, 9, 14), status: 'Assessment' },
  { id: 'a2', job: 'Plant Head', applied: new Date(2026, 8, 1), status: 'Selected' },
];
const live = (over: Partial<LiveInternalJobs> = {}): LiveInternalJobs => ({
  state: 'ready',
  onRetry: vi.fn(),
  companyName: 'Demo Foods',
  eligibility: { eligible: true },
  manager: { name: 'Divya Menon', when: 'on_apply' },
  onApply: vi.fn().mockResolvedValue(undefined),
  ...over,
});

describe('HIR-13 Internal jobs (live)', () => {
  it('lists the openings and my applications with the company name and design statuses', () => {
    show(<InternalJobsScreen jobs={OPEN} applications={APPS} live={live()} />);
    expect(screen.getByText(/Openings at Demo Foods you can apply for/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Internal openings' })).getAllByRole('listitem')).toHaveLength(OPEN.length);
    expect(screen.getByText('Assessment')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('Send application pressed too early says what is missing, focuses it and sends nothing (never disabled)', async () => {
    const l = live();
    show(<InternalJobsScreen jobs={OPEN} applications={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: `Apply for ${OPEN[0]!.title}` }));
    const send = screen.getByRole('button', { name: 'Send application' });
    expect(send).toBeEnabled();
    expect(screen.getByText(/Your manager, Divya Menon, is told when you apply/)).toBeInTheDocument();
    await ue.click(send);
    expect(await screen.findByText('Say why you are interested in this job.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Why are you interested/ })).toHaveFocus();
    expect(l.onApply).not.toHaveBeenCalled();
  });

  it('sends the note, then a toast and the sheet closes', async () => {
    const l = live();
    show(<InternalJobsScreen jobs={OPEN} applications={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: `Apply for ${OPEN[0]!.title}` }));
    await ue.type(screen.getByRole('textbox', { name: /Why are you interested/ }), '  I led the QA automation on Line 3. ');
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(l.onApply).toHaveBeenCalledWith({ jobId: OPEN[0]!.id, note: 'I led the QA automation on Line 3.', resumeBase64: null });
    expect((await screen.findAllByText(`Applied for ${OPEN[0]!.title}`)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Send application' })).not.toBeInTheDocument();
  });

  it('a refusal (already applied, no longer open) stays in the sheet with the reason', async () => {
    const l = live({ onApply: vi.fn().mockRejectedValue(new Error('You have already applied for this job.')) });
    show(<InternalJobsScreen jobs={OPEN} applications={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: `Apply for ${OPEN[0]!.title}` }));
    await ue.type(screen.getByRole('textbox', { name: /Why are you interested/ }), 'Growth');
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('You have already applied for this job.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send application' })).toBeInTheDocument();
  });

  it('not yet eligible: the company rule and the day it opens show; pressing Send says why and sends nothing', async () => {
    const l = live({ eligibility: { eligible: false, title: 'You can apply after 12 months in your current role', detail: 'You started your current role on 1 Jun 2026. Internal applications open for you on 1 Jun 2027 (company rule).' }, manager: { name: null, when: 'at_offer' } });
    show(<InternalJobsScreen jobs={OPEN} applications={[]} live={l} />);
    await ue.click(screen.getByRole('button', { name: `Apply for ${OPEN[0]!.title}` }));
    expect(screen.getByText(/open for you on 1 Jun 2027/)).toBeInTheDocument();
    expect(screen.getByText(/Your manager is told when you reach the offer stage/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Why are you interested/ }), 'Growth');
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(l.onApply).not.toHaveBeenCalled();
    expect(screen.getAllByText('You can apply after 12 months in your current role').length).toBe(2);
  });

  it('empty, loading and error states', async () => {
    const { rerender } = show(<InternalJobsScreen jobs={[]} applications={[]} live={live()} />);
    expect(screen.getByText('No internal openings right now.')).toBeInTheDocument();
    expect(screen.getByText("You haven't applied to any internal job yet.")).toBeInTheDocument();
    rerender(<ToastProvider><InternalJobsScreen jobs={[]} applications={[]} live={live({ state: 'loading' })} /></ToastProvider>);
    expect(screen.getByLabelText('Loading internal jobs')).toBeInTheDocument();
    const onRetry = vi.fn();
    rerender(<ToastProvider><InternalJobsScreen jobs={[]} applications={[]} live={live({ state: 'error', onRetry })} /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

const NONE = { rangeRequired: false, historyBanned: false };
const ws = (o: Partial<LiveJobWorkspace> = {}): LiveJobWorkspace => ({
  state: 'ready',
  onRetry: vi.fn(),
  canManage: true,
  careersUrl: null,
  overview: [],
  postings: [{ ...POSTINGS[0]!, boardId: 'b1' }],
  onPosting: vi.fn(async () => undefined),
  pay: { currency: 'INR', period: 'year', show: false, askHistory: false, companyShows: false, published: false, canManage: true, onSave: vi.fn(async () => undefined) },
  onOpenPipeline: vi.fn(),
  onViewCareers: vi.fn(),
  onStatus: vi.fn(async () => undefined),
  recruiter: { id: 'u1', choices: [{ value: 'u1', label: 'Neha Joshi' }], onChange: vi.fn(async () => undefined) },
  ...o,
});

describe('Answer 226: the job workspace "Referrals & internal" tab (live)', () => {
  it('shows both switches with their values; each change goes straight to the job', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<JobWorkspaceScreen job={{ ...JOBS[0]!, status: 'Open' }} postings={[]} law={NONE} range={{ min: null, max: null }} activity={[]} defaultTab="sharing" live={ws({ sharing: { internal: true, referrals: false, referralNote: 'Referral bonus ₹10,000 after the hire completes 60 days.', onChange } })} />);
    const internal = screen.getByRole('switch', { name: /Show on internal jobs/ });
    const referrals = screen.getByRole('switch', { name: /Open for referrals/ });
    expect(internal).toBeChecked();
    expect(referrals).not.toBeChecked();
    expect(screen.getByText('Referral bonus ₹10,000 after the hire completes 60 days.')).toBeInTheDocument();
    await ue.click(internal);
    expect(onChange).toHaveBeenLastCalledWith({ internalOpen: false });
    await ue.click(referrals);
    expect(onChange).toHaveBeenLastCalledWith({ referralOpen: true });
  });

  it('without the job key the switches are read-only', () => {
    const onChange = vi.fn();
    render(<JobWorkspaceScreen job={{ ...JOBS[0]!, status: 'Open' }} postings={[]} law={NONE} range={{ min: null, max: null }} activity={[]} defaultTab="sharing" live={ws({ canManage: false, sharing: { internal: true, referrals: true, referralNote: 'x', onChange } })} />);
    expect(screen.getByRole('switch', { name: /Show on internal jobs/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Open for referrals/ })).toBeDisabled();
  });
});
