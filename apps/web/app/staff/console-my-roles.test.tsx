import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import ConsoleMySecurityPage from './(console)/security/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })), usePathname: jest.fn(() => '/staff/security'), useParams: jest.fn(), useSearchParams: jest.fn(() => new URLSearchParams('')) }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), STAFF_SIGN_IN: '/staff/sign-in' }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Answer 1166: every member of staff sees their own console roles on My security.
const api = apiFetch as jest.Mock;
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const MFA = { factors: [{ id: 'f1', type: 'passkey', label: 'YubiKey', createdAt: '2026-10-01T00:00:00Z', lastUsedAt: null }], recoveryCodesRemaining: 0, required: true, enrolmentDueAt: '2026-10-01T00:00:00Z', allowedFactors: ['passkey'], mobileNumber: null };
const serve = (roles: unknown) =>
  api.mockImplementation(async (path: string) => {
    if (path === '/platform/my-roles') return roles;
    if (path === '/auth/mfa') return MFA;
    if (path === '/auth/sessions') return [];
    if (path.startsWith('/auth/login-history')) return { data: [], total: 0, page: 1, pageSize: 25 };
    throw new Error(`unexpected ${path}`);
  });

beforeEach(() => {
  api.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'super_admin' });
});

it('shows my own roles and what each lets me do', async () => {
  serve([{ role: 'rules_editor', label: 'Rules editor', does: ['Draft, review and publish rule sets'] }]);
  wrap(<ConsoleMySecurityPage />);
  expect(await screen.findByText('Your console roles')).toBeInTheDocument();
  expect(screen.getByText('Draft, review and publish rule sets')).toBeInTheDocument();
});

it('negative: no role yet says the console opens no pages', async () => {
  serve([]);
  wrap(<ConsoleMySecurityPage />);
  expect(await screen.findByText(/No role yet/)).toBeInTheDocument();
});
