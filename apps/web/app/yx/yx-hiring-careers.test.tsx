import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringCareersPage from './(app)/hiring/careers/page';
import YxHiringJobBoardsPage from './(app)/hiring/job-boards/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: 'http://api' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Careers site: the designed Surfaces/Careers page builder, live (founder decision 8), with every setting the
// old page had (company pages, versioned notices, banner, assistant, on/off).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const LAYOUT = { theme: 'classic', accent: null, sections: [{ id: 'hero', type: 'hero', title: 'Grow with us', text: 'We make food.' }, { id: 'jobs', type: 'jobs', title: 'Open jobs' }, { id: 'footer', type: 'footer', title: 'Contact', text: '' }] };
const ue = userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/careers');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', organizationSlug: 'kaveri', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

function mockApi(sent: { path: string; method?: string; body?: unknown }[], enabled = true) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method) sent.push({ path, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/organizations/careers') return { enabled, assistantEnabled: false, headline: 'Grow with us', intro: 'We make food.', bannerUrl: null, config: LAYOUT };
    if (path === '/hiring/careers-entities') return { entities: [{ id: 'e1', name: 'Kaveri Foods' }], pages: [{ legalEntityId: 'e1', slug: 'kaveri-foods', headline: null, intro: null, primaryColor: null }] };
    if (path === '/hiring/consent-notices') return init?.method ? {} : [{ id: 'n1', purpose: 'application', version: 1, text: 'We use your details for this job.', publishedAt: '2026-10-01T00:00:00.000Z' }];
    if (path === '/jobs') return [{ id: 'j1', title: 'QA Chemist', status: 'open', publicApplyEnabled: true, listOnCareers: true, slug: 'qa-chemist', department: 'Quality', location: 'Hosur', createdAt: '2026-10-01T00:00:00.000Z' }, { id: 'j2', title: 'Draft job', status: 'draft', publicApplyEnabled: false, listOnCareers: false, department: null, location: null, createdAt: '2026-10-01T00:00:00.000Z' }];
    throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
  });
}

describe('Hiring › Careers site (T9-09 / Surfaces Careers)', () => {
  it('edits the hero and publishes the layout; company pages and notices stay', async () => {
    const sent: { path: string; method?: string; body?: unknown }[] = [];
    mockApi(sent);
    wrap(<YxHiringCareersPage />);
    expect(await screen.findByRole('heading', { name: 'Careers page' })).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open the careers site' })).toHaveAttribute('href', 'http://localhost/yx/careers/kaveri');
    expect(screen.getByText('?company=kaveri-foods')).toBeInTheDocument();
    expect(await screen.findAllByText('QA Chemist')).not.toHaveLength(0);
    expect(screen.queryByText('Draft job')).not.toBeInTheDocument();
    // Editing makes it a draft until published again.
    const heading = screen.getByLabelText('Heading');
    await ue.clear(heading);
    await ue.type(heading, 'Cook with Kaveri');
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(sent.find((x) => x.path === '/organizations/careers')?.body).toMatchObject({ enabled: true, config: { theme: 'classic', sections: expect.arrayContaining([expect.objectContaining({ type: 'hero', title: 'Cook with Kaveri' })]) } }));
    expect((await screen.findAllByText('Careers page published')).length).toBeGreaterThan(0);
    // A new notice version.
    await ue.click(screen.getByRole('button', { name: /Publish a new version: applying for a job/ }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByLabelText(/Notice text/), ' We keep them for a year.');
    await ue.click(within(d).getByRole('button', { name: 'Publish version' }));
    await waitFor(() => expect(sent).toContainEqual({ path: '/hiring/consent-notices', method: 'POST', body: { purpose: 'application', text: 'We use your details for this job. We keep them for a year.' } }));
  });

  it('takes the page offline and switches the assistant', async () => {
    const sent: { path: string; method?: string; body?: unknown }[] = [];
    mockApi(sent);
    wrap(<YxHiringCareersPage />);
    await ue.click(await screen.findByRole('checkbox', { name: /Careers assistant/ }));
    await waitFor(() => expect(sent).toContainEqual({ path: '/organizations/careers', method: 'PUT', body: { enabled: true, assistantEnabled: true } }));
    await ue.click(screen.getByRole('button', { name: 'Take the page offline' }));
    await waitFor(() => expect(sent).toContainEqual({ path: '/organizations/careers', method: 'PUT', body: { enabled: false } }));
  });

  it('a person without the settings key is told so', async () => {
    api.mockImplementation(async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    wrap(<YxHiringCareersPage />);
    expect(await screen.findByText('You cannot change the careers site.')).toBeInTheDocument();
  });
});

describe('Hiring › Job boards (M10 AT3)', () => {
  it('lists boards (costs moved to Hiring › Recruiting costs, HIR-11)', async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/organizations/job-boards') return [{ id: 'b1', name: 'Naukri', provider: 'xml_feed', configured: true, publishedJobCount: 2, feedUrl: 'https://x/feed.xml' }];
      if (path === '/organizations/job-boards/providers') return [];
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxHiringJobBoardsPage />);
    expect(await screen.findByText('Naukri')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record a posting cost' })).not.toBeInTheDocument();
  });
});
