import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import ConsoleStaffPage from './(console)/staff/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(() => '/staff/staff'), useParams: jest.fn(), useSearchParams: jest.fn(() => new URLSearchParams('')) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), STAFF_SIGN_IN: '/staff/sign-in' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Staff roles (answers 1058, 1086): Console › Staff and roles wired to /platform/staff.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const ROLES = [
  { role: 'rules_editor', label: 'Rules editor', keys: ['platform.statutory.manage'] },
  { role: 'security_lead', label: 'Security lead', keys: ['platform.staff.manage'] },
];
const STAFF = [
  { id: 's1', name: 'Anand Iyer', email: 'anand@yukthix.test', active: true, me: true, roles: ['security_lead'], lastLead: false },
  { id: 's2', name: 'Farah Siddiqui', email: 'farah@yukthix.test', active: true, me: false, roles: ['rules_editor'], lastLead: false },
];

beforeEach(() => {
  api.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'super_admin', actingSuperAdmin: false, isLoading: false });
});

const route = (table: Record<string, unknown>) =>
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    calls.push(`${key}${init?.body ? ` ${init.body}` : ''}`);
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const v = table[key];
    if (v instanceof Error) throw v;
    return v;
  });

describe('Console › Staff and roles', () => {
  it('lists who holds what and saves another member of staff\'s roles with a reason', async () => {
    route({ 'GET /platform/staff': { roles: ROLES, staff: STAFF }, 'PUT /platform/staff/s2/roles': { id: 's2', roles: ['rules_editor', 'security_lead'] } });
    wrap(<ConsoleStaffPage />);
    await ue.click(await screen.findByRole('button', { name: /More actions for Farah Siddiqui/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Change roles' }));
    const drawer = await screen.findByRole('dialog');
    await ue.click(within(drawer).getByRole('checkbox', { name: /Security lead/ }));
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Second lead for holidays');
    await ue.click(within(drawer).getByRole('button', { name: 'Save roles' }));
    await waitFor(() => expect(calls).toContain('PUT /platform/staff/s2/roles {"roles":["rules_editor","security_lead"],"reason":"Second lead for holidays"}'));
  });

  it('negative: someone who is not a Security lead sees no access', async () => {
    route({ 'GET /platform/staff': Object.assign(new Error('Missing required permission(s): platform.staff.manage'), { status: 403 }) });
    wrap(<ConsoleStaffPage />);
    expect(await screen.findByText(/a YukthiX console owner/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });

  it('answer 1164: adds a member of staff by invitation and deactivates another, each with a reason', async () => {
    route({
      'GET /platform/staff': { roles: ROLES, staff: STAFF },
      'POST /platform/staff': { id: 's3', email: 'priya@yukthix.test', roles: [] },
      'POST /platform/staff/s2/deactivate': { id: 's2', active: false },
    });
    wrap(<ConsoleStaffPage />);
    await ue.click(await screen.findByRole('button', { name: 'Add staff' }));
    const drawer = await screen.findByRole('dialog');
    await ue.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Priya Nair');
    await ue.type(within(drawer).getByRole('textbox', { name: /Work email/ }), 'priya@yukthix.test');
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Joins support');
    await ue.click(within(drawer).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(calls).toContain('POST /platform/staff {"email":"priya@yukthix.test","name":"Priya Nair","reason":"Joins support"}'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await ue.click(screen.getByRole('button', { name: /More actions for Farah Siddiqui/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    const confirm = await screen.findByRole('dialog');
    await ue.type(within(confirm).getByRole('textbox'), 'Left YukthiX');
    await ue.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(calls).toContain('POST /platform/staff/s2/deactivate {"reason":"Left YukthiX"}'));
  });
});
