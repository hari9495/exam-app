'use client';

import { ResultAppealScreen, type LiveResult } from '@yukthix/ui/assessments';
import { useAttemptQuery, useCandidateCertificate, useRunnerActions } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

// AS-4a (PRC-27): the designed result page, live: released (only what the test shows) or held for review. AS-5 (answer
// 2012): an integrity decision with its appeal window, the appeal form and what became of the appeal.
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export default function CandidateResultPage() {
  const { data: current } = useAttemptQuery();
  const certificate = useCandidateCertificate();
  const actions = useRunnerActions();
  const state = current && isAttemptStarted(current) ? current : null;
  const f = state?.feedback ?? null;
  const live: LiveResult = {
    testName: state?.exam.title ?? 'Test',
    companyName: state?.organizationName ?? '',
    state: f?.status === 'held' ? 'held' : f?.status === 'invalidated' ? 'invalidated' : f?.status === 'settled' ? 'released' : 'pending',
    integrity: f?.integrity
      ? {
          verdict: f.integrity.verdict,
          sectionTitle: f.integrity.sectionTitle,
          reason: f.integrity.reason,
          decidedOn: day(f.integrity.decidedAt),
          appealUntil: f.integrity.appealUntil ? day(f.integrity.appealUntil) : null,
          canAppeal: f.integrity.canAppeal,
          appeal: f.integrity.appeal ? { status: f.integrity.appeal.status, sentOn: day(f.integrity.appeal.sentAt), decidedOn: f.integrity.appeal.decidedAt ? day(f.integrity.appeal.decidedAt) : null, reason: f.integrity.appeal.reason } : null,
        }
      : null,
    onAppeal: actions.sendAppeal,
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
