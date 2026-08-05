'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { CandidateReportPanel } from '../../../../../../components/CandidateReportPanel';
import { BackLink } from '../../../../../../components/BackLink';

export default function PanelCandidateDetailPage() {
  const { examId, candidateId } = useParams<{ examId: string; candidateId: string }>();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId') || null;

  return (
    <CandidateReportPanel
      examId={examId}
      candidateId={candidateId}
      attemptId={attemptId}
      backSlot={<BackLink href={`/reports/${examId}`} label="Back To Results" className="print:hidden" />}
    />
  );
}
