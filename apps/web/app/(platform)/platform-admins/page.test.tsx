import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlatformAdminsPage from './page';
import { ToastProvider } from '../../../components/ui';
import * as authContext from '../../../lib/auth-context';
import * as apiClient from '../../../lib/api-client';

jest.mock('../../../lib/auth-context');
jest.mock('../../../lib/api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PlatformAdminsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('PlatformAdminsPage', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token', role: 'super_admin', isLoading: false });
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/users/super-admins') {
        return Promise.resolve([{ id: 'sa-1', email: 'super@platform.test', createdAt: '2026-01-01T00:00:00.000Z' }]);
      }
      return Promise.resolve({});
    });
  });

  it('lists existing super admins', async () => {
    renderPage();
    expect(await screen.findByText('super@platform.test')).toBeInTheDocument();
  });

  it('confirms before inviting a new super admin', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Invite by email'), { target: { value: 'new@platform.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    expect(await screen.findByText(/Grant super_admin access to new@platform.test/)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/users/super-admins/invite', expect.anything(), expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/users/super-admins/invite',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'new@platform.test' }) }),
        'token',
      ),
    );
  });

  it('confirms before promoting an existing user', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Promote by email'), { target: { value: 'existing@org.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Promote' }));

    expect(await screen.findByText(/Grant super_admin access to existing@org.test/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/users/super-admins/promote',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'existing@org.test' }) }),
        'token',
      ),
    );
  });
});
