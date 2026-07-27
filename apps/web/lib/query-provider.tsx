'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';
import { RETRY_ATTEMPTS, isRetryableError, retryDelayMs } from './retry';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
          // Mutations previously inherited react-query's default of zero
          // retries, so a candidate whose start/submit landed during a burst
          // saw an error with no second attempt. Individual hooks can still
          // opt out -- useRunCode does, since it holds a scarce per-IP budget.
          mutations: {
            retry: (failureCount, error) => failureCount < RETRY_ATTEMPTS && isRetryableError(error),
            retryDelay: retryDelayMs,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
