'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import { TerminalCard } from '../components/TerminalCard';

function StartRedeemer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { redeem } = useCandidateAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('This invitation link is missing a token.');
      return;
    }
    redeem(token)
      .then(() => router.push('/welcome'))
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (error) {
    return <TerminalCard tone="error" title="Can't open this invitation" body={error} />;
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
