'use client';

import { ToastProvider } from '@yukthix/ui';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CandidatePortalHomeScreen, type LivePortal } from '@yukthix/ui/assessments';
import { useCandidateBrand, useMyTests, useReuseOffer } from '../../../lib/hooks/useAttempt';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

// AS-3 (PRC-21): the designed "My tests" page, live: every test of this candidate at this company; another one opens
// in place (the server checks it is the same candidate and company).
export default function MyTestsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accessToken, isLoading: authLoading, switchTo } = useCandidateAuth();
  const tests = useMyTests();
  const reuse = useReuseOffer();
  const brand = useCandidateBrand();

  useEffect(() => {
    if (!authLoading && !accessToken) router.push('/session-ended');
  }, [authLoading, accessToken, router]);

  const live: LivePortal = {
    state: tests.isError ? 'error' : tests.data ? 'ready' : 'loading',
    onRetry: () => void tests.refetch(),
    brand,
    tests: tests.data ?? [],
    reuseOffer: Boolean(reuse.data?.offer),
    onReuse: () => router.push('/reuse'),
    onStart: () => router.push('/welcome'),
    onResult: () => router.push('/result'),
    onOpen: async (invitationId) => {
      await switchTo(invitationId);
      await queryClient.invalidateQueries({ queryKey: ['attempt'] });
      router.push('/welcome');
    },
  };
  // The kit's toasts need their provider; the candidate layout has only the older one.
  return (
    <ToastProvider>
      <CandidatePortalHomeScreen live={live} />
    </ToastProvider>
  );
}
