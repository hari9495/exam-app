import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authModule from '../auth-context';
import * as apiClientModule from '../api-client';
import { useUnblockAttempt } from './useAttemptModeration';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUnblockAttempt', () => {
  it('POSTs to /attempts/:id/unblock with the access token', async () => {
    jest.spyOn(authModule, 'useAuth').mockReturnValue({ accessToken: 'staff-token' } as any);
    const apiFetch = jest.spyOn(apiClientModule, 'apiFetch').mockResolvedValue({ status: 'in_progress' });

    const { result } = renderHook(() => useUnblockAttempt(), { wrapper });
    result.current.mutate('attempt-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith('/attempts/attempt-1/unblock', { method: 'POST', body: JSON.stringify({}) }, 'staff-token');
  });
});
