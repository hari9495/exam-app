import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ToastProvider } from '@yukthix/ui';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxExpectationsPage from './(app)/performance/expected/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// T2-C item 68 (answer 2842): What is expected of me, read-only; a manager opens a report's page.
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
const api = apiFetch as jest.Mock;
const push = jest.fn();
const DATA = { employee: { id: 'e1', name: 'Priya', designation: 'Sales Lead', mine: true }, competencies: [{ id: 'c1', name: 'Ownership', group: 'core', description: null, expectedLevel: 2, levelLabel: 'Owns own work', behaviours: 'Closes the loop.', levels: 4 }], values: ['Own it'], reports: [{ value: 'e2', label: 'Arjun' }] };

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/expected');
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('What is expected of me (web)', () => {
  it('reads my page, and the manager opens a report’s page', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
    api.mockImplementation(async (path: string) => {
      if (path === '/rbac/me/permissions') return [];
      if (path === '/performance/expectations') return DATA;
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxExpectationsPage />);
    expect(await screen.findByText('Expected: level 2 of 4 · Owns own work')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Show the page for' }));
    await userEvent.click(screen.getByRole('option', { name: 'Arjun' }));
    expect(push).toHaveBeenCalledWith('/yx/performance/expected?employee=e2');
  });

  it('negative: someone not in my chain is refused by the API and the page says it did not load', async () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('employee=e9'));
    api.mockImplementation(async (path: string) => {
      if (path === '/rbac/me/permissions') return [];
      if (path === '/performance/expectations?employeeId=e9') throw Object.assign(new Error('No such person.'), { status: 404 });
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxExpectationsPage />);
    expect(await screen.findByText('This page didn’t load')).toBeInTheDocument();
    expect(screen.queryByText(/Expected: level/)).toBeNull();
  });
});
