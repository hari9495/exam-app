'use client';

import { useParams } from 'next/navigation';
import { ScoreReportScreen } from '@yukthix/ui/assessments';
import { useApi } from '../../../../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../../../../lib/yx-org';
import { loadState, scoreReport, type CandidateDetailResponse } from '../../../../../../../../lib/yx-assessments';

// Assessments AS-2 › Score report (PRC-06): one candidate's result on one test, from the older report. Results readers
// only, and a Hiring manager only for candidates of their own jobs (AS-0, answer 2004: another job's candidate is 404).
// Raw marks for test writers; everyone else the score. A held result says so (its evidence is kept, answer 2008).
export default function YxScoreReportPage() {
  const { examId, candidateId } = useParams<{ examId: string; candidateId: string }>();
  const perms = useYxPermissions();
  const report = useApi<CandidateDetailResponse>(`/reports/${examId}/candidates/${candidateId}/report`);
  const exam = useApi<{ title: string; passCriteriaPercent: number }>(`/exams/${examId}`);
  return (
    <ScoreReportScreen
      live={{
        state: report.isError || exam.isError ? 'error' : loadState({ isLoading: report.isLoading || exam.isLoading, isError: false }),
        onRetry: () => void Promise.all([report.refetch(), exam.refetch()]),
        viewer: perms.has('exam:manage' as never) ? 'owner' : 'recruiter',
        testTitle: exam.data?.title ?? '',
        passMark: exam.data?.passCriteriaPercent ?? 0,
        report: report.data ? scoreReport(report.data) : null,
      }}
    />
  );
}
