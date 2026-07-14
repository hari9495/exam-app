'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CandidateButton } from '../components/CandidateButton';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';
import { useToast } from '../../../components/ui';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.push('/session-ended');
    } else if (isError) {
      router.push('/session-ended');
    } else if (current && isAttemptStarted(current)) {
      router.push('/exam');
    }
  }, [current, isError, router, accessToken, authLoading]);

  if (isLoading || isError || !current || isAttemptStarted(current)) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  async function handleStart() {
    try {
      await startAttempt.mutateAsync();
      router.push('/exam');
    } catch {
      toast("Couldn't start the exam — please check your connection and try again.", 'error');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-gray-600">Duration: {current.exam.durationMinutes} minutes</p>
        {current.exam.instructions && <p className="mb-4 whitespace-pre-wrap text-sm text-gray-700">{current.exam.instructions}</p>}
        <div className="mb-6 rounded-md bg-candidate-review-bg p-3 text-xs text-candidate-review">
          This exam is monitored. Tab switches, exiting fullscreen, copy/paste, right-click, and developer tools will be
          reported.
        </div>
        <CandidateButton onClick={handleStart} disabled={startAttempt.isPending} className="w-full">
          {startAttempt.isPending ? 'Starting…' : 'Start exam'}
        </CandidateButton>
      </div>
    </div>
  );
}
