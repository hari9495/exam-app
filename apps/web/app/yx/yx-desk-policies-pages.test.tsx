import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxPoliciesPage from './(app)/desk/policies/page';
import YxPolicyAdminPage from './(app)/desk/policy-admin/page';
import { WAITING, adminPolicy } from '../../../../packages/yx-ui/src/screens/ops/helpdesk-policy-live-samples';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Policies (HLP-10) and Policy admin (HLP-11): the designed screens with `live` and the real API calls.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const replace = jest.fn();
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const ROW = { id: 'p1', code: 'POL-01', title: 'Code of conduct', category: 'Conduct', method: 'click', version: 'v2', versionId: 'v2id', effectiveOn: '2026-11-01', changeSummary: 'Gifts rule.', status: 'pending', dueOn: '2026-11-15', acknowledgedOn: null, acknowledgedVersion: null };
const ONE = { ...ROW, owner: 'Lakshmi', bodyHtml: '<p>Be honest at work.</p>', files: [], acknowledged: null, typedName: false, myName: 'Divya Raghunathan' };
const forbidden = Object.assign(new Error('Not available while acting for someone else'), { status: 403 });

beforeEach(() => {
  api.mockReset();
  replace.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Policies (HLP-10 live)', () => {
  it('lists my policies and opens one in the address', async () => {
    route({ 'GET /desk/my/policies': { policies: [ROW], typedName: false, managerAfterDays: 7 } });
    wrap(<YxPoliciesPage />);
    await userEvent.click(await screen.findByRole('link', { name: 'Code of conduct' }));
    expect(replace).toHaveBeenCalledWith('/yx/desk/policies?policy=p1');
  });

  it('acknowledges the exact version it shows (toast)', async () => {
    const sent: unknown[] = [];
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('policy=p1'));
    route({ 'GET /desk/my/policies': { policies: [ROW], typedName: false, managerAfterDays: 7 }, 'GET /desk/my/policies/p1': ONE, 'POST /desk/my/policies/p1/acknowledge': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), { version: 'v2' }) });
    wrap(<YxPoliciesPage />);
    expect(await screen.findByText('Be honest at work.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Code of conduct acknowledged')).toBeInTheDocument();
    expect(sent).toEqual([{ versionId: 'v2id', read: true }]);
  });

  it('a 403 (acting for someone else) shows the no-access state', async () => {
    route({ 'GET /desk/my/policies': forbidden });
    wrap(<YxPoliciesPage />);
    expect(await screen.findByText(/closed while you act for someone else/)).toBeInTheDocument();
  });
});

describe('Helpdesk › Policy admin (HLP-11 live)', () => {
  it('lists the policies; New policy posts and opens the new one', async () => {
    const posted: unknown[] = [];
    route({
      'GET /rbac/me/permissions': ['policy.manage', 'policy.publish'],
      'GET /desk/policies': [{ id: 'p1', code: 'POL-01', title: 'Code of conduct', category: 'Conduct', method: 'click', owner: null, version: 'v1', effectiveOn: '2026-11-01', open: null, audience: 10, acknowledged: 4, overdue: 0, dueOn: '2026-11-15' }],
      'GET /desk/policies/options': { legalEntities: [], locations: [], departments: [], grades: [], owners: [] },
      'POST /desk/policies': (_p: string, init: RequestInit) => (posted.push(JSON.parse(String(init.body))), { id: 'p2', code: 'POL-02' }),
    });
    wrap(<YxPolicyAdminPage />);
    expect(await screen.findByText('4 of 10 (40%)')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'New policy' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Title/ }), 'POSH policy');
    await userEvent.type(screen.getByRole('textbox', { name: /Kind of policy/ }), 'Conduct');
    await userEvent.click(screen.getByRole('button', { name: 'Make the policy' }));
    expect(await screen.findByText('POL-02 made')).toBeInTheDocument();
    expect(posted).toEqual([{ title: 'POSH policy', category: 'Conduct', method: 'click' }]);
    expect(replace).toHaveBeenCalledWith('/yx/desk/policy-admin?policy=p2');
  });

  it('without the keys the API says 403 and the page shows no access', async () => {
    route({ 'GET /rbac/me/permissions': [], 'GET /desk/policies': forbidden });
    wrap(<YxPolicyAdminPage />);
    expect(await screen.findByText(/write, publish and track company policies/)).toBeInTheDocument();
  });

  it('HLP-14: a version with a counsel note is published only with the tick, which is sent', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('policy=p1'));
    const sent: unknown[] = [];
    const one = adminPolicy({ open: { ...WAITING, counselNote: 'Law check covers general labour law only; IT services rules are not checked yet; review with counsel' } });
    route({
      'GET /rbac/me/permissions': ['policy.publish'],
      'GET /desk/policies': [{ id: 'p1', code: 'POL-01', title: one.title, category: 'Conduct', method: 'click', owner: null, version: 'v4', effectiveOn: '2026-11-01', open: { number: 5, status: 'waiting' }, audience: 10, acknowledged: 4, overdue: 0, dueOn: '2026-11-15' }],
      'GET /desk/policies/p1': one,
      'GET /desk/policies/p1/pending': [],
      'POST /desk/policies/p1/publish': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), { notified: 3 }),
    });
    wrap(<YxPolicyAdminPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Publish version' }));
    const publish = async () => {
      const b = await screen.findAllByRole('button', { name: 'Publish version' });
      await userEvent.click(b[b.length - 1]);
    };
    await publish();
    expect(await screen.findByText('Tick that you have read the counsel note.')).toBeInTheDocument();
    expect(sent).toEqual([]);
    await userEvent.click(screen.getByRole('checkbox', { name: /I have read this note/ }));
    await publish();
    expect(await screen.findByText(`${one.title} v5 published`)).toBeInTheDocument();
    expect(sent).toEqual([{ version: 4, counselSeen: true }]);
  });
});
