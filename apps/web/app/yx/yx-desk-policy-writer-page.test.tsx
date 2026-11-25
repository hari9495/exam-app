import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxPolicyWriterPage from './(app)/desk/policy-writer/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), API_BASE: '' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Write policies with AI (HLP-14): the designed screen with `live` and the real API calls.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const replace = jest.fn();
const push = jest.fn();
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const OPT = { types: [{ value: 'leave', label: 'Leave' }], industries: [{ value: 'fmcg', label: 'Food and consumer goods' }], states: [{ value: 'IN-KA', label: 'Karnataka' }], patterns: [{ value: 'office', label: 'Office hours only' }], values: { leave: [{ key: 'earned', label: 'Earned leave days a year', min: 0, max: 60, default: 15 }], work_from_home: [], notice: [] }, notesMax: 500 };
const HOME = { ai: 'off', latest: null, options: OPT };
const DRAFT = { id: 'd1', status: 'draft', version: 2, mode: 'starter', type: 'leave', typeLabel: 'Leave', answers: { industry: 'Food and consumer goods', states: ['Karnataka'], headcount: 40, workPattern: 'Office hours only' }, values: { earned: 18 }, clauses: [{ id: 'v-earned', title: 'Earned leave', text: 'Employees earn 18 days of earned leave a year.', source: 'company', editable: false }], findings: [{ id: 'f1', state: 'Karnataka', text: 'Earned leave: 18 days a year meets the Karnataka minimum of 18.', status: 'resolved' }], openFindings: 0, createdBy: 'HR', createdAt: '2026-11-04T05:00:00.000Z', approvedBy: null, approvedAt: null, approvedByMe: false, counselNote: null, discardedBy: null, discardedAt: null, discardReason: null, target: { title: 'Leave policy', policyId: null, code: null, number: 1, blockedBy: null } };
const forbidden = Object.assign(new Error('Company policies apply to the whole company.'), { status: 403 });

beforeEach(() => {
  api.mockReset();
  replace.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Write policies with AI (HLP-14 live)', () => {
  it('AI off: says so and offers the starter', async () => {
    route({ 'GET /desk/policy-writer': HOME });
    wrap(<YxPolicyWriterPage />);
    expect(await screen.findByText('AI is switched off for policies')).toBeInTheDocument();
  });

  it('opens a draft from the address and approves it; Policy admin opens', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('draft=d1'));
    const sent: unknown[] = [];
    route({
      'GET /desk/policy-writer': HOME,
      'GET /desk/policy-writer/drafts/d1': DRAFT,
      'POST /desk/policy-writer/drafts/d1/approve': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), { policyId: 'pol1', code: 'POL-01', title: 'Leave policy', number: 1 }),
    });
    wrap(<YxPolicyWriterPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve & load' }));
    const buttons = await screen.findAllByRole('button', { name: 'Approve & load' });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(await screen.findByText('Leave policy v1 is waiting to be published')).toBeInTheDocument();
    expect(sent).toEqual([{ version: 2 }]);
    expect(push).toHaveBeenCalledWith('/yx/desk/policy-admin?policy=pol1');
  });

  it('discards a draft: posts the version and goes back to the questions', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('draft=d1'));
    const sent: unknown[] = [];
    route({
      'GET /desk/policy-writer': HOME,
      'GET /desk/policy-writer/drafts/d1': DRAFT,
      'POST /desk/policy-writer/drafts/d1/discard': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), { status: 'discarded' }),
    });
    wrap(<YxPolicyWriterPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    expect(await screen.findByText('Draft discarded')).toBeInTheDocument();
    expect(sent).toEqual([{ version: 2 }]);
    expect(replace).toHaveBeenCalledWith('/yx/desk/policy-writer');
  });

  it('no policy key: the no-access state', async () => {
    route({ 'GET /desk/policy-writer': forbidden });
    wrap(<YxPolicyWriterPage />);
    expect(await screen.findByText(/HR with policy rights for the whole company/)).toBeInTheDocument();
  });
});
