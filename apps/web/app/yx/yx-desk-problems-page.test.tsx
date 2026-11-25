import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxDeskProblemsPage from './(app)/desk/problems/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Helpdesk › Problems (ITSM-3): an employee without the IT desk sees the no-access state, never "did not load".
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;

beforeEach(() => {
  api.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace: jest.fn() });
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
});

describe('Helpdesk › Problems', () => {
  it('a 403 (no desk.ticket.view) shows no access', async () => {
    api.mockImplementation(() => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 })));
    wrap(<YxDeskProblemsPage />);
    expect(await screen.findByText(/You don't have access to IT problems/)).toBeInTheDocument();
    expect(screen.queryByText('The problems did not load.')).not.toBeInTheDocument();
  });

  it('any other failure still offers a retry', async () => {
    api.mockImplementation(() => Promise.reject(Object.assign(new Error('Boom'), { status: 500 })));
    wrap(<YxDeskProblemsPage />);
    expect(await screen.findByText('The problems did not load.')).toBeInTheDocument();
  });
});
