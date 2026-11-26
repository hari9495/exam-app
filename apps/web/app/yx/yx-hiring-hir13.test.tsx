import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { buildNav } from '../../lib/yx-nav';
import { internalJob } from '../../lib/yx-internal-jobs';
import YxInternalJobsPage from './(app)/hiring/internal-jobs/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useBranding', () => ({ useOrgBranding: () => ({ data: { name: 'Demo Foods' } }) }));

// HIR-13 Internal jobs: the designed screen with `live`, on the API (founder decision 6). Positive and negative.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const JOB = { id: 'j1', title: 'Senior QA Engineer', location: 'Chennai', department: 'Quality', employmentType: 'FULL_TIME', postedAt: '2026-11-02T05:00:00Z' };
const routes = (eligibility: Record<string, unknown>, post: () => Promise<unknown> = async () => ({ id: 'e1' })) =>
  api.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method === 'POST') return post();
    if (path === '/internal-applications/jobs') return [JOB];
    if (path === '/internal-applications/mine') return [{ entryId: 'e0', jobTitle: 'Plant Head', status: 'Interview', appliedAt: '2026-10-01T05:00:00Z' }];
    if (path === '/internal-applications/eligibility') return eligibility;
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/internal-jobs');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', organizationSlug: 'demo', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('HIR-13 Internal jobs page', () => {
  it('shows the openings and my applications; applying sends the note and shows a toast', async () => {
    routes({ eligible: true, managerName: 'Divya Menon', tellManager: 'on_apply' });
    wrap(<YxInternalJobsPage />);
    expect(await screen.findByText('Senior QA Engineer')).toBeInTheDocument();
    expect(screen.getByText(/Openings at Demo Foods/)).toBeInTheDocument();
    expect(screen.getByText('Quality · Chennai · Full time')).toBeInTheDocument();
    expect(screen.getByText('Plant Head')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Apply for Senior QA Engineer' }));
    expect(screen.getByText(/Your manager, Divya Menon, is told when you apply/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Why are you interested/ }), 'I want to grow test automation.');
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/internal-applications', { method: 'POST', body: JSON.stringify({ jobId: 'j1', note: 'I want to grow test automation.' }) }, 'tok'));
    expect((await screen.findAllByText('Applied for Senior QA Engineer')).length).toBeGreaterThan(0);
  });

  it('answer 2761: with the release setting on, the sheet says the manager is asked; off, only told', async () => {
    routes({ eligible: true, managerName: 'Divya Menon', tellManager: 'on_apply', managerRelease: true });
    const { unmount } = wrap(<YxInternalJobsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Apply for Senior QA Engineer' }));
    expect(screen.getByText(/Your manager, Divya Menon, is asked to release you when you apply\. An offer can be made only once they agree/)).toBeInTheDocument();
    unmount();
    routes({ eligible: true, managerName: 'Divya Menon', tellManager: 'on_apply', managerRelease: false });
    wrap(<YxInternalJobsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Apply for Senior QA Engineer' }));
    expect(screen.queryByText(/is asked to release you/)).toBeNull();
    expect(screen.getByText(/Your manager, Divya Menon, is told when you apply/)).toBeInTheDocument();
  });

  it('not eligible: the company rule shows and nothing is sent', async () => {
    routes({ eligible: false, reason: 'probation', title: 'You can apply once your probation is confirmed', detail: 'Your probation is due to end on 31 Mar 2027.', managerName: null, tellManager: 'at_offer' });
    wrap(<YxInternalJobsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Apply for Senior QA Engineer' }));
    expect(screen.getByText('Your probation is due to end on 31 Mar 2027.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Why are you interested/ }), 'x');
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(api.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('a refusal from the API stays in the sheet', async () => {
    routes({ eligible: true, managerName: null, tellManager: 'on_apply' }, async () => {
      throw new Error('You have already applied for this job.');
    });
    wrap(<YxInternalJobsPage />);
    await ue.click(await screen.findByRole('button', { name: 'Apply for Senior QA Engineer' }));
    await ue.type(screen.getByRole('textbox', { name: /Why are you interested/ }), 'x');
    await ue.click(screen.getByRole('button', { name: 'Send application' }));
    expect(await screen.findByText('You have already applied for this job.')).toBeInTheDocument();
  });

  it('a load failure shows the error state', async () => {
    api.mockRejectedValue(Object.assign(new Error('down'), { status: 500 }));
    wrap(<YxInternalJobsPage />);
    expect(await screen.findByText("Couldn't load internal jobs")).toBeInTheDocument();
  });

  it('menu: Internal jobs for people with an employee record only', () => {
    const base = { role: 'panel', support: false, employee: true, manager: false, history: false, clearance: false, tasks: false, firstDays: false, has: () => false };
    const links = (n: Parameters<typeof buildNav>[0]) => (buildNav(n).find((a) => a.id === 'hire')?.sections ?? []).flatMap((s) => s.items.map((i) => i.href));
    expect(links(base)).toContain('/yx/hiring/internal-jobs');
    expect(links({ ...base, employee: false, has: (k: string) => k === 'pipeline:manage' })).not.toContain('/yx/hiring/internal-jobs');
    expect(links({ ...base, support: true })).not.toContain('/yx/hiring/internal-jobs');
  });

  it('maps the API job to the designed card', () => {
    expect(internalJob({ ...JOB, employmentType: null, department: null })).toMatchObject({ title: 'Senior QA Engineer', department: '', type: '', status: 'Open', internal: true });
  });

  it('Hiring walk (answer 476): Candidates opened without a candidate key says no access, and asks for nothing else', async () => {
    const YxCandidatesPage = (await import('./(app)/hiring/candidates/page')).default;
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/rbac/me/permissions')) return ['results:view'];
      if (path.startsWith('/candidates')) throw Object.assign(new Error('Forbidden'), { status: 403 });
      return [];
    });
    wrap(<YxCandidatesPage />);
    expect(await screen.findByText("You don't have access to candidates")).toBeInTheDocument();
    const asked = api.mock.calls.map(([path]) => String(path));
    expect(asked.filter((x) => ['/candidate-email-templates', '/org-sender-addresses', '/hiring/pools'].includes(x))).toEqual([]);
  });

  it('answer 511: a plain employee sees Referrals and Internal jobs; Interviews only once on a panel', () => {
    const base = { role: 'panel', support: false, employee: true, manager: false, history: false, clearance: false, tasks: false, firstDays: false, has: () => false };
    const links = (n: Parameters<typeof buildNav>[0]) => (buildNav(n).find((a) => a.id === 'hire')?.sections ?? []).flatMap((s) => s.items.map((i) => i.href));
    expect(links(base)).toEqual(['/yx/hiring/referrals', '/yx/hiring/internal-jobs']);
    expect(links({ ...base, panellist: true })).toEqual(['/yx/hiring/interviews', '/yx/hiring/referrals', '/yx/hiring/internal-jobs']);
    expect(links({ ...base, panellist: true, support: true })).toEqual([]);
  });
});

