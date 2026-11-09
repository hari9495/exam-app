import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringJobsPage from './(app)/hiring/jobs/page';
import YxHiringJobPage from './(app)/hiring/jobs/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Jobs and one job (HIR-03, HIR-24): the designed screens with live data on the jobs API.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();
const replace = jest.fn();

const COUNTS = { byStageId: { s1: 2 }, byCategory: { active: 2, offer: 1, hired: 0, rejected: 3, archived: 0 } };
const JOB = {
  id: 'j1', title: 'Senior accountant', status: 'open', createdAt: '2026-10-01T09:00:00Z', createdById: 'u1', closedAt: null, publishedAt: '2026-10-02T09:00:00Z', slug: 'senior-accountant-chennai',
  department: 'Finance', location: 'Chennai', employmentType: 'FULL_TIME', hiringManagerId: null, headcount: 1, publicApplyEnabled: true, listOnCareers: true, applyToken: 't', salaryMin: null, salaryMax: null,
  salaryCurrency: 'INR', salaryPeriod: 'year', showSalary: false, askPayHistory: false, pipelineId: 'p1', approval: null, stageCounts: COUNTS, jobBoardIds: ['b1'],
};
const job = (law: Record<string, unknown>) => ({ ...JOB, payLaw: { rangeRequired: false, historyBanned: false, name: null, place: 'Chennai', showByDefault: false, ...law }, postings: [{ boardId: 'b1', board: 'Naukri', status: 'live', error: null, postedAt: null }, { boardId: 'b2', board: 'Indeed', status: 'not posted', error: null, postedAt: null }] });

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/jobs');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'recruiter', organizationSlug: 'kaveri', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

const routes = (extra: (key: string, init?: RequestInit) => unknown, perms = ['pipeline:manage', 'results:view', 'org.structure.view']) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    const hit = extra(key, init);
    if (hit !== undefined) return hit;
    if (key === 'GET /rbac/me/permissions') return perms;
    if (key === 'GET /jobs') return [JOB];
    if (key === 'GET /jobs/pay-settings') return { showRange: false, askHistory: false };
    if (key === 'GET /pipelines') return [{ id: 'p1', name: 'Standard', isDefault: true, stages: [{ id: 's1', name: 'Interview' }] }];
    if (key === 'GET /users/teammates') return [{ id: 'u1', name: 'Neha Joshi', email: 'neha@x.test' }];
    if (key.startsWith('GET /org/masters') || key === 'GET /org/locations' || key.startsWith('GET /custom-fields') || key === 'GET /hiring/plan-lines' || key === 'GET /hiring/scorecard-templates') return key === 'GET /org/masters/departments' ? [{ id: 'd1', name: 'Finance', archivedAt: null }] : [];
    if (key === 'GET /hiring/jobs/j1/interview-settings') return { scorecardTemplateId: null, exams: [] };
    throw new Error(`unexpected ${key}`);
  });

describe('Hiring › Jobs (HIR-03 list, live)', () => {
  it('lists jobs with counts and recruiter, opens the workspace and creates a job linked to a department', async () => {
    const posted: unknown[] = [];
    routes((key, init) => (key === 'POST /jobs' ? (posted.push(JSON.parse(String(init!.body))), { id: 'j2', status: 'open' }) : undefined));
    wrap(<YxHiringJobsPage />);
    expect(await screen.findByText('Senior accountant')).toBeInTheDocument();
    expect(await screen.findByText('Neha Joshi')).toBeInTheDocument();
    expect(screen.getByText('Full time')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Senior accountant'));
    expect(push).toHaveBeenCalledWith('/yx/hiring/jobs/j1');
    await userEvent.click(screen.getByRole('button', { name: 'Create job' }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: 'Create job' }));
    expect(within(d).getByText('Enter the job title.')).toBeInTheDocument();
    await userEvent.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Accountant');
    await userEvent.click(within(d).getByRole('combobox', { name: 'Department' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Finance' }));
    await userEvent.click(within(d).getByRole('button', { name: 'Create job' }));
    await waitFor(() => expect(posted).toEqual([expect.objectContaining({ title: 'Accountant', departmentId: 'd1', pipelineId: 'p1' })]));
    expect((await screen.findAllByText('Job Accountant created')).length).toBeGreaterThan(0);
  });

  it('read-only (results:view only): no Create job', async () => {
    routes(() => undefined, ['results:view']);
    wrap(<YxHiringJobsPage />);
    expect(await screen.findByText('Senior accountant')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create job' })).not.toBeInTheDocument();
  });
});

describe('Hiring › one job (HIR-03 workspace, HIR-24 pay range, live)', () => {
  it('shows the overview and stages, posts to a board and opens the pipeline', async () => {
    const patches: unknown[] = [];
    routes((key, init) => (key === 'GET /jobs/j1' ? job({}) : key === 'PATCH /jobs/j1' ? (patches.push(JSON.parse(String(init!.body))), {}) : undefined));
    wrap(<YxHiringJobPage />);
    expect(await screen.findByText('2 Interview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View careers page' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Job-board postings/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(patches).toEqual([{ jobBoardIds: ['b1', 'b2'] }]));
    expect((await screen.findAllByText('Posted to Indeed')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Open pipeline' }));
    expect(push).toHaveBeenCalledWith('/yx/hiring/jobs/j1/pipeline');
  });

  it('where the law requires the range: saving without it is stopped; a server refusal shows on the panel', async () => {
    let patched = 0;
    routes((key) => {
      if (key === 'GET /jobs/j1') return job({ rangeRequired: true, historyBanned: true, name: 'New York pay transparency law', place: 'New York office' });
      if (key === 'PATCH /jobs/j1') {
        patched++;
        throw new Error('The New York pay transparency law requires a pay range before the job is published. Add a minimum and a maximum.');
      }
      return undefined;
    });
    wrap(<YxHiringJobPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Pay range' }));
    expect(screen.getByRole('switch', { name: /Ask applicants/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save pay range' }));
    expect(screen.getByText(/The law for this location requires a pay range/)).toBeInTheDocument();
    expect(patched).toBe(0);
  });

  it('an older application link goes to the pipeline page', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('entry=e1'));
    routes((key) => (key === 'GET /jobs/j1' ? job({}) : undefined));
    wrap(<YxHiringJobPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/yx/hiring/jobs/j1/pipeline?entry=e1'));
  });
});
