'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ResultReuseScreen, type LiveReuse } from '@yukthix/ui/assessments';
import { useAttemptQuery, useCandidateBrand, useReuseActions, useReuseOffer } from '../../../lib/hooks/useAttempt';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

// AS-3 (PRC-32): the designed result-reuse choice, live: the candidate's earlier result on the same test within the
// company's months (Settings 6.5), used only after they agree; the server checks it all again.
export default function ResultReusePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const offer = useReuseOffer();
  const { data: current } = useAttemptQuery();
  const { use, withdraw } = useReuseActions();
  const brand = useCandidateBrand();

  useEffect(() => {
    if (!authLoading && !accessToken) router.push('/session-ended');
  }, [authLoading, accessToken, router]);

  const live: LiveReuse = {
    state: offer.isError ? 'error' : offer.data ? 'ready' : 'loading',
    onRetry: () => void offer.refetch(),
    brand,
    testTitle: current?.exam.title ?? '',
    offer: offer.data?.offer ?? null,
    reused: offer.data?.reused ?? null,
    onUse: async (attemptId) => {
      await use.mutateAsync(attemptId);
    },
    onWithdraw: async () => {
      await withdraw.mutateAsync();
    },
    onTakeTest: () => router.push('/welcome?retake=1'),
    onLater: () => router.push('/my-tests'),
  };
  return <ResultReuseScreen live={live} />;
}
