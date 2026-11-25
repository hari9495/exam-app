import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import ConsoleRuleSetsPage from './(console)/rules/page';
import ConsoleRuleSetPage from './(console)/rules/[id]/page';
import ConsolePublishPage from './(console)/rules/publish/page';
import { publishable, reviewQueue } from '../../lib/yx-console-rules';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(() => '/staff/rules'), useParams: jest.fn(), useSearchParams: jest.fn(() => new URLSearchParams('')) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), STAFF_SIGN_IN: '/staff/sign-in' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Console C-1 (answers 1041 to 1044): Rule sets, one version and Publish, wired to /platform/statutory/rule-sets.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const api = apiFetch as jest.Mock;
const calls: string[] = [];
const push = jest.fn();
const replace = jest.fn();
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    calls.push(`${key}${init?.body ? ` ${init.body}` : ''}`);
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const v = table[key];
    if (v instanceof Error) throw v;
    return v;
  });
}
const ME = { id: 'u-farah', email: 'farah@yukthix.test', name: 'Farah Siddiqui' };
const ROW = { id: 'r1', statute: 'IN.PT', jurisdiction: 'IN-KA', version: 'v2027-04', kind: 'pt', validFrom: '2027-04-01', validTo: null, state: 'in review', lawVersion: 'OLD-ACT', transitional: false, draftedBy: 'u-anand', draftedByName: 'Anand Iyer', reviewedByName: null, sentForReviewAt: '2026-11-11T09:30:00.000Z', changeNote: null, golden: 1 };
const DETAIL = { ...ROW, values: { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs: [{ from: '0', to: '29999.99', amount: '0' }, { from: '30000', to: null, amount: '200' }] }, source: 'Karnataka Gazette notification FD 12 PTX 2026 (stored copy).', verify: true, review: null, previous: null, golden: [{ name: 'a', fn: 'pt', input: {}, expected: {} }] };

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  replace.mockReset();
  calls.length = 0;
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'super_admin', actingSuperAdmin: false, isLoading: false });
});

describe('Console › Rule sets (C-1)', () => {
  it('lists the versions from the rule store and opens one', async () => {
    route({ 'GET /users/me': ME, 'GET /platform/statutory/rule-sets': [ROW] });
    wrap(<ConsoleRuleSetsPage />);
    expect(await screen.findByText('In review')).toBeInTheDocument();
    expect(screen.getByText('Anand Iyer')).toBeInTheDocument();
  });

  it('negative: without the Rules editor key the page says so', async () => {
    route({ 'GET /users/me': ME, 'GET /platform/statutory/rule-sets': Object.assign(new Error('Missing required permission(s): platform.statutory.manage'), { status: 403 }) });
    wrap(<ConsoleRuleSetsPage />);
    expect(await screen.findByText("You can't open the rule sets.")).toBeInTheDocument();
  });

  it('a version in review that someone else drafted offers Review, which opens the review', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'r1' });
    route({ 'GET /users/me': ME, 'GET /platform/statutory/rule-sets': [ROW], 'GET /platform/statutory/rule-sets/r1': DETAIL });
    wrap(<ConsoleRuleSetPage />);
    await ue.click(await screen.findByRole('button', { name: 'Review' }));
    expect(push).toHaveBeenCalledWith('/staff/rules/golden?id=r1&review=1');
  });

  it('publish: shows the impact numbers and publishes through the API (the security key is asked by the API client)', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('id=r1'));
    route({
      'GET /users/me': ME,
      'GET /platform/statutory/rule-sets': [ROW],
      'GET /platform/statutory/rule-sets/r1': DETAIL,
      'GET /platform/statutory/rule-sets/r1/impact': { countable: true, companies: 3, employees: 41, bySize: [{ size: 'Under 50', companies: 3, employees: 41 }], pastDated: false, validFrom: '2027-04-01' },
      'POST /platform/statutory/rule-sets/r1/publish': { id: 'r1', status: 'published' },
    });
    wrap(<ConsolePublishPage />);
    expect((await screen.findAllByText('41')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Numbers only: no company or person is named/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    await ue.click(await screen.findByRole('button', { name: 'Publish rule set' }));
    await waitFor(() => expect(calls).toContain('POST /platform/statutory/rule-sets/r1/publish'));
    expect(await screen.findByText('IN.PT · IN-KA v2027-04 is published')).toBeInTheDocument();
  });
});

describe('rule helpers', () => {
  it('the queue holds in review and sent back; I publish only what someone else drafted', () => {
    const rows = [ROW, { ...ROW, id: 'r2', state: 'changes requested' }, { ...ROW, id: 'r3', state: 'published' }, { ...ROW, id: 'r4', draftedBy: 'u-farah' }] as never[];
    expect(reviewQueue(rows).map((r: { id: string }) => r.id).sort()).toEqual(['r1', 'r2', 'r4']);
    expect(publishable(rows, 'u-farah').map((r: { id: string }) => r.id)).toEqual(['r1']);
  });
});
