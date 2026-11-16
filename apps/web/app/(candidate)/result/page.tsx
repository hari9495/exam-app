'use client';

import { ResultAppealScreen, type LiveResult } from '@yukthix/ui/assessments';
import { useAttemptQuery, useCandidateBrand, useCandidateCertificate } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

// AS-4a (PRC-27): the designed result page, live: released (only what the test shows) or held for review.
export default function CandidateResultPage() {
  const { data: current } = useAttemptQuery();
  const certificate = useCandidateCertificate();
  const brand = useCandidateBrand();
  const state = current && isAttemptStarted(current) ? current : null;
  const f = state?.feedback ?? null;
  const live: LiveResult = {
    brand,
    testName: state?.exam.title ?? 'Test',
    state: f?.status === 'held' ? 'held' : f?.status === 'settled' ? 'released' : 'pending',
    passed: f?.passFail == null ? null : f.passFail === 'pass',
    percentage: f?.percentage ?? null,
    sections: f?.sections ?? null,
    onCertificate: f?.certificateAvailable
      ? async () => {
          const { url } = await certificate.mutateAsync();
          window.open(url, '_blank', 'noopener');
        }
      : undefined,
  };
  return <ResultAppealScreen live={live} />;
}
