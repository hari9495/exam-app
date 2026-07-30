import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../auth-context';
import * as apiClient from '../api-client';
import { useUpdateUser } from './useUsers';

jest.mock('../auth-context');
jest.mock('../api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useUpdateUser', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockResolvedValue({});
  });

  it('calls PATCH /users/:id with the given role', async () => {
    const { result } = renderHook(() => useUpdateUser(), { wrapper });

    result.current.mutate({ id: 'user-1', role: 'recruiter' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/user-1',
      { method: 'PATCH', body: JSON.stringify({ role: 'recruiter', name: undefined }) },
      'token',
    );
  });
});
