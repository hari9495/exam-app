import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxLedgerMappingPage from './(app)/payroll/accounting/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Pay › Ledger mapping (PAY-62, Enterprise E4) wired to payroll/ledger-mappings.
const wrap = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const ROWS = [
  { id: 'm1', scopeType: 'company', scopeId: null, componentCode: '_net_pay', side: 'payable', accountCode: '2100', accountName: 'Net salary payable', updatedAt: '2026-11-20T10:00:00Z' },
  { id: 'm2', scopeType: 'company', scopeId: null, componentCode: 'basic', side: 'expense', accountCode: '5100', accountName: 'Salaries', updatedAt: '2026-11-20T10:00:00Z' },
];
const base = (perms: string[]) => ({
  'GET /rbac/me/permissions': perms,
  'GET /payroll/ledger-mappings': ROWS,
  'GET /payroll/components': [{ id: 'c1', code: 'basic', name: 'Basic salary' }],
  'GET /org/legal-entities': [{ id: 'le-1', name: 'Kaveri Foods Pvt Ltd', archivedAt: null }],
  'GET /org/masters/cost-centres': [],
});

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('/yx/payroll/accounting', () => {
  it('payroll sets the suspense account through the mapping API (positive)', async () => {
    const put = jest.fn().mockResolvedValue({});
    route({ ...base(['payroll.ledger.manage']), 'PUT /payroll/ledger-mappings': (_p: string, init: RequestInit) => put(JSON.parse(String(init.body))) });
    wrap(<YxLedgerMappingPage />);
    const table = await screen.findByRole('table', { name: 'Ledger mapping' });
    expect(await within(table).findByText('Basic salary (basic)')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Set suspense account' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Account code/ }), '9999');
    await userEvent.type(screen.getByRole('textbox', { name: /Account name/ }), 'Payroll suspense');
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith({ scopeType: 'company', scopeId: null, componentCode: '_suspense', side: 'payable', accountCode: '9999', accountName: 'Payroll suspense' }));
  });

  it('the journal export key reads it without changing anything (negative)', async () => {
    route(base(['payroll.journal.export']));
    wrap(<YxLedgerMappingPage />);
    await screen.findByRole('table', { name: 'Ledger mapping' });
    expect(screen.queryByRole('button', { name: 'Add mapping' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set suspense account' })).not.toBeInTheDocument();
  });
});
