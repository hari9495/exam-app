'use client';

import { useRouter } from 'next/navigation';
import { AccommodationRequestScreen } from '@yukthix/ui/assessments';
import { useAskForHelp, useAttemptQuery, useCandidateHelp } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

// AS-4b (answer 2011, PRC-23): the designed request form, live. The candidate asks before the test, with optional
// evidence; the test owner decides; approved extra time becomes the invitation's. The runtime checks every rule again.
export default function CandidateAccommodationPage() {
  const router = useRouter();
  const current = useAttemptQuery();
  const help = useCandidateHelp();
  const ask = useAskForHelp();
  const started = Boolean(current.data && isAttemptStarted(current.data));
  return (
    <AccommodationRequestScreen
      live={{
        state: current.isError || help.isError ? 'error' : current.isLoading || help.isLoading ? 'loading' : 'ready',
        onRetry: () => void Promise.all([current.refetch(), help.refetch()]),
        testTitle: current.data?.exam.title ?? 'Your test',
        durationMinutes: current.data && !isAttemptStarted(current.data) ? current.data.exam.durationMinutes : 0,
        started,
        help: help.data ?? null,
        onSend: async (a) => void (await ask.mutateAsync(a)),
        onBack: () => router.push('/welcome'),
      }}
    />
  );
}
