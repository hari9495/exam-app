import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxHiringCareersPage from './(app)/hiring/careers/page';
import YxHiringJobBoardsPage from './(app)/hiring/job-boards/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Hiring › Careers site and Job boards on the API (M10 batch AT3).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/hiring/careers');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', organizationSlug: 'kaveri', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Hiring › Careers site (M10 AT3)', () => {
  it('shows the public page, company pages and notices, and publishes a new notice version', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/organizations/careers') return { enabled: true, assistantEnabled: false, headline: 'Grow with us', intro: null, bannerUrl: null };
      if (path === '/hiring/careers-entities') return { entities: [{ id: 'e1', name: 'Kaveri Foods' }], pages: [{ legalEntityId: 'e1', slug: 'kaveri-foods', headline: null, intro: null, primaryColor: null }] };
      if (path === '/hiring/consent-notices' && !init?.method) return [{ id: 'n1', purpose: 'application', version: 1, text: 'We use your details for this job.', publishedAt: '2026-10-01T00:00:00.000Z' }];
      if (path === '/hiring/consent-notices' && init?.method === 'POST') return (posted.push(JSON.parse(String(init.body))), {});
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxHiringCareersPage />);
    expect(await screen.findByRole('link', { name: 'Open the careers site' })).toHaveAttribute('href', 'http://localhost/careers/kaveri');
    expect(screen.getByText('?company=kaveri-foods')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Publish a new version: applying for a job/ }));
    const d = screen.getByRole('dialog');
    await userEvent.type(within(d).getByLabelText(/Notice text/), ' We keep them for a year.');
    await userEvent.click(within(d).getByRole('button', { name: 'Publish version' }));
    await waitFor(() => expect(posted).toEqual([{ purpose: 'application', text: 'We use your details for this job. We keep them for a year.' }]));
  });
});

describe('Hiring › Job boards (M10 AT3)', () => {
  it('lists boards with their costs and records a posting cost', async () => {
    const posted: unknown[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/organizations/job-boards') return [{ id: 'b1', name: 'Naukri', provider: 'xml_feed', configured: true, publishedJobCount: 2, feedUrl: 'https://x/feed.xml' }];
      if (path === '/organizations/job-boards/providers') return [];
      if (path.startsWith('/jobs')) return [{ id: 'j1', title: 'Senior Accountant' }];
      if (path === '/hiring/costs' && !init?.method) return [{ id: 'c1', source: 'Naukri', jobId: 'j1', amount: '4500.00', currency: 'INR', createdAt: '2026-10-11T00:00:00.000Z' }];
      if (path === '/hiring/costs' && init?.method === 'POST') return (posted.push(JSON.parse(String(init.body))), {});
      throw new Error(`unexpected ${init?.method ?? 'GET'} ${path}`);
    });
    wrap(<YxHiringJobBoardsPage />);
    expect(await screen.findByText('INR 4,500')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Record a posting cost' }));
    const d = screen.getByRole('dialog');
    await userEvent.type(within(d).getByLabelText(/Amount/), '1200');
    await userEvent.click(within(d).getByRole('button', { name: 'Record cost' }));
    await waitFor(() => expect(posted).toEqual([{ jobBoardId: 'b1', jobId: null, amount: 1200, currency: 'INR', note: null }]));
  });
});
