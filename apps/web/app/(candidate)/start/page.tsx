'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { isRetryableError } from '../../../lib/retry';
import { CandidateLinkScreen } from '@yukthix/ui/assessments';

interface RedeemFailure {
  message: string;
  // A spent or malformed invitation is final -- offering "Try again" there
  // invites the candidate to keep pressing a button that cannot work. Only a
  // 5xx or a dropped connection earns the button.
  canRetry: boolean;
}

function StartRedeemer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { redeem } = useCandidateAuth();
  const [failure, setFailure] = useState<RedeemFailure | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setFailure({ message: 'This invitation link is missing a token.', canRetry: false });
      return;
    }
    setFailure(null);
    redeem(token)
      .then(() => router.push('/welcome'))
      .catch((err: Error) => setFailure({ message: err.message, canRetry: isRetryableError(err) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, retryCount]);

  // Decision 2398 (step 4): the kit's invitation-link screen.
  if (failure) return <CandidateLinkScreen live={{ state: 'failed', message: failure.message, onRetry: failure.canRetry ? () => setRetryCount((count) => count + 1) : undefined }} />;
  return <CandidateLinkScreen live={{ state: 'checking' }} />;
}

export default function CandidateStartPage() {
  return (
    <Suspense fallback={<CandidateLinkScreen live={{ state: 'checking' }} />}>
      <StartRedeemer />
    </Suspense>
  );
}
