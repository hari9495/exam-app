import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authContext from '../auth-context';
import * as apiClient from '../api-client';
import { usePipelines, useCreateStage, useUpdateStage, useDeleteStage, useCreatePipeline, useDeletePipeline, useCreateStatus, useUpdateStatus, useDeleteStatus } from './usePipelines';

jest.mock('../auth-context');
jest.mock('../api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('usePipelines', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockResolvedValue([{ id: 'p1', name: 'Default', isDefault: true, stages: [] }]);
  });

  it('fetches pipelines from GET /pipelines under the ["pipelines"] key', async () => {
    const { result } = renderHook(() => usePipelines(), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('p1'));

    expect(mockedApiFetch).toHaveBeenCalledWith('/pipelines', {}, 'token');
  });
});

// Regression for the approvals-feature invalidation-key bug (Task 9 brief): every mutation here
// must invalidate the exact same key usePipelines() queries with -- ['pipelines'] -- not some
// other/nested key that never matches and silently leaves stale data cached.
describe('useCreateStage invalidation', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockResolvedValue({ id: 's1', name: 'Screening', category: 'active', position: 1 });
  });

  it('invalidates the ["pipelines"] query key on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const localWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useCreateStage(), { wrapper: localWrapper });

    result.current.mutate({ pipelineId: 'p1', name: 'Screening', category: 'active', position: 1 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pipelines'] });
  });
});

describe('other pipeline config mutations invalidate ["pipelines"]', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockResolvedValue({});
  });

  function expectInvalidatesPipelines(hookFn: () => { mutate: (input: any) => void; isSuccess: boolean }, input: any) {
    return async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      const localWrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(hookFn, { wrapper: localWrapper });

      result.current.mutate(input);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pipelines'] });
    };
  }

  it('useCreatePipeline', expectInvalidatesPipelines(useCreatePipeline, { name: 'New Pipeline' }));
  it('useDeletePipeline', expectInvalidatesPipelines(useDeletePipeline, 'p1'));
  it('useUpdateStage', expectInvalidatesPipelines(useUpdateStage, { stageId: 's1', name: 'Renamed' }));
  it('useDeleteStage', expectInvalidatesPipelines(useDeleteStage, 's1'));
  it('useCreateStatus', expectInvalidatesPipelines(useCreateStatus, { stageId: 's1', name: 'New', position: 0 }));
  it('useUpdateStatus', expectInvalidatesPipelines(useUpdateStatus, { statusId: 'st1', name: 'Renamed' }));
  it('useDeleteStatus', expectInvalidatesPipelines(useDeleteStatus, 'st1'));
});
