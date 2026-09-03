import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../auth-context';
import * as apiClient from '../api-client';
import { useApprovalChains, useDecideApproval } from './useApprovals';

jest.mock('../auth-context');
jest.mock('../api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useApprovalChains', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockResolvedValue({
      requisition: { gate: 'requisition', enabled: false, steps: [] },
      offer: { gate: 'offer', enabled: false, steps: [] },
    });
  });

  it('fetches both gate chains from /organizations/approvals/chains', async () => {
    const { result } = renderHook(() => useApprovalChains(), { wrapper });

    await waitFor(() => expect(result.current.data?.requisition.gate).toBe('requisition'));

    expect(mockedApiFetch).toHaveBeenCalledWith('/organizations/approvals/chains', {}, 'token');
  });
});

describe('useDecideApproval', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockResolvedValue({});
  });

  it('invalidates the real cache keys (approvals, jobs, candidate-offers) on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const localWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDecideApproval(), { wrapper: localWrapper });

    result.current.mutate({ id: 'req-1', decision: 'approved' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['approvals'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['jobs'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['candidate-offers'] });
    // These stale keys from the original (buggy) brief must NOT be invalidated anymore.
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['pipeline'] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['offers'] });
  });
});
