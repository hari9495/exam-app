import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAiJob } from './useQuestions';

jest.mock('../api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../auth-context', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiFetch } = require('../api-client');

// No shared QueryClientProvider test helper exists in this repo yet (other hook tests each
// define their own local `wrapper`) -- this is the smallest one that works, matching that
// pattern. retry/refetchOnWindowFocus are disabled so only the hook's own refetchInterval
// drives additional apiFetch calls, keeping the "polling stopped" assertion below honest.
function makeQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useAiJob', () => {
  beforeEach(() => {
    (apiFetch as jest.Mock).mockClear();
  });

  it('stops polling once the job has completed', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      id: 'j1',
      type: 'ai-question-generation',
      status: 'completed',
      outputJson: '{"requested":3,"created":3,"dropped":[],"questionIds":[]}',
      error: null,
    });
    const { result } = renderHook(() => useAiJob('j1'), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.data?.status).toBe('completed'));
    const callsAfterComplete = (apiFetch as jest.Mock).mock.calls.length;
    await new Promise((r) => setTimeout(r, 2500));
    expect((apiFetch as jest.Mock).mock.calls.length).toBe(callsAfterComplete);
  });
});
