'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { isRetryableError } from '../../../lib/retry';
import { TerminalCard } from '../components/TerminalCard';

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

  if (failure) {
    return (
      <TerminalCard tone="error" title="Can't open this invitation" body={failure.message}>
        {failure.canRetry ? (
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded-md bg-candidate-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Try again
          </button>
        ) : null}
      </TerminalCard>
    );
  }

  return <TerminalCard tone="loading" title="Verifying your invitation" body="This only takes a moment." />;
}

export default function CandidateStartPage() {
  return (
    <Suspense fallback={<TerminalCard tone="loading" title="Loading" body="This only takes a moment." />}>
      <StartRedeemer />
    </Suspense>
  );
}
