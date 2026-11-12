import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxProjectSettingsPage from './(app)/settings/projects/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Settings S-2 follow-up (answers 1323, 1409): 3.11's "Pre-fill from work tools" lives on the one 3.11 page,
// /yx/settings/projects, as the company setting timesheet.tool_suggestions (off by default), saved through /org/settings.
const api = apiFetch as jest.Mock;
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const calls: [string, unknown][] = [];
const PROJECTS = { canEdit: true, values: { 'projects.enabled': 'on', 'projects.booking.allocated_only': 'on', 'projects.burn.warn_pct': '80', 'projects.burn.over_pct': '100' }, defaults: { 'projects.enabled': 'off', 'projects.booking.allocated_only': 'on', 'projects.burn.warn_pct': '80', 'projects.burn.over_pct': '100' }, choices: { 'projects.burn.warn_pct': ['70', '80', '90'], 'projects.burn.over_pct': ['100', '110'] }, lastChange: null };
const routes = (perms: string[], overrides: object[] = []) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return (calls.push([`PUT ${path}`, JSON.parse(String(init.body))]), {});
    if (path.startsWith('/rbac/me/permissions')) return perms;
    if (path === '/projects/settings') return PROJECTS;
    if (path === '/org/settings') return { registry: { 'timesheet.tool_suggestions': { default: 'off' } }, limits: {}, overrides };
    throw new Error(`unexpected ${path}`);
  });
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <YxProjectSettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
});

describe('Settings 3.11: pre-fill from work tools on the Projects settings page', () => {
  it('is off by default (Starter default) and HR saves it on through /org/settings', async () => {
    routes(['org.settings.manage']);
    show();
    const box = await screen.findByRole('checkbox', { name: /Timesheet pre-fill/ });
    expect(box).not.toBeChecked();
    await ue.click(box);
    await ue.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!);
    await waitFor(() => expect(calls).toContainEqual(['PUT /org/settings', { key: 'timesheet.tool_suggestions', value: 'on', scopeType: 'tenant' }]));
    expect(calls.some(([c]) => c === 'PUT /projects/settings')).toBe(false);
  });

  it('negative: someone who cannot read the company settings never sees it; the Projects fields still show', async () => {
    routes([]);
    show();
    expect(await screen.findByText(/Switch Projects on/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Timesheet pre-fill/ })).toBeNull();
    expect(calls).toEqual([]);
  });
});
