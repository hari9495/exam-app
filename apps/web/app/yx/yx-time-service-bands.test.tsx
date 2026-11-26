import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxTimeSetupPage from './(app)/time/setup/page';

jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/yx/time/setup', useSearchParams: () => new URLSearchParams() }));

// Answer 2755: Time › Set-up › a new policy: service bands on a line are sent with the dated version; out-of-order
// bands are refused on the page and nothing is sent.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const SETUP = {
  today: '2026-11-26',
  types: [{ id: 'el', code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, colour: 'blue', active: true, rules: { halfDays: true } }],
  policies: [], calendars: [], locations: [], entities: [], statutory: [], starters: [],
};
const sent: { path: string; body: unknown }[] = [];

beforeEach(() => {
  api.mockReset();
  sent.length = 0;
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'org_admin', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/time/setup') return SETUP;
    if (path === '/time/setup/block-dates') return { blocks: [] };
    if (init?.method === 'POST') {
      sent.push({ path, body: JSON.parse(String(init.body)) });
      return path === '/time/setup/policies' ? { id: 'pol-new' } : {};
    }
    throw new Error(`unexpected ${path}`);
  });
});

const fillPolicy = async () => {
  await ue.click((await screen.findAllByRole('button', { name: 'New policy' }))[0]!);
  const drawer = await screen.findByRole('dialog');
  await ue.type(within(drawer).getByLabelText(/^Policy name/), 'Staff');
  await ue.click(within(drawer).getAllByRole('button', { name: 'Edit' })[0]!);
  const days = within(drawer).getByLabelText(/Earned leave: days a year/);
  await ue.clear(days);
  await ue.type(days, '15');
  await ue.click(within(drawer).getByRole('button', { name: 'Add service band' }));
  return drawer;
};

describe('/yx/time/setup service bands (answer 2755)', () => {
  it('a band is sent with the version and the change is toasted', async () => {
    wrap(<YxTimeSetupPage />);
    const drawer = await fillPolicy();
    await ue.click(within(drawer).getByRole('button', { name: /^Save from/ }));
    await waitFor(() => expect(sent.map((s) => s.path)).toEqual(['/time/setup/policies', '/time/setup/policies/pol-new/versions']));
    expect(sent[1]!.body).toEqual(expect.objectContaining({ lines: [expect.objectContaining({ leaveTypeId: 'el', annualDays: 15, bands: [{ fromYears: 2, annualDays: 18 }] })] }));
    expect((await screen.findAllByText('Policy change saved')).length).toBeGreaterThan(0);
  });

  it('negative: a band that starts before the one above it is refused and nothing is sent', async () => {
    wrap(<YxTimeSetupPage />);
    const drawer = await fillPolicy();
    await ue.click(within(drawer).getByRole('button', { name: 'Add service band' }));
    const second = within(drawer).getByLabelText(/^Band 2: after years/);
    await ue.clear(second);
    await ue.type(second, '1');
    await ue.click(within(drawer).getByRole('button', { name: /^Save from/ }));
    expect((await within(drawer).findAllByText(/Each band starts after more years than the one before/)).length).toBeGreaterThan(0);
    expect(sent.filter((s) => s.path.endsWith('/versions'))).toEqual([]);
  });
});
