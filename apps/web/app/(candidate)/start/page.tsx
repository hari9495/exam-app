'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

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
    return (
      <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">Can&apos;t open this invitation</h1>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    );
  }

  return <p className="text-sm text-gray-500">Verifying your invitation…</p>;
}

export default function CandidateStartPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
        <StartRedeemer />
      </Suspense>
    </div>
  );
}
