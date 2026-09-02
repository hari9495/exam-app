'use client';

// v2 candidate report route — thin wrapper around the v2 CandidateReportPanel (same as the old
// panel route wraps the old panel). Recruiter-scoped: reached from the pipeline board/drawer and
// (later) the v2 exam report. Panel-role users keep using the old /reports route.
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CandidateReportPanel } from '../../../CandidateReportPanel';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };

export default function V2CandidateReportPage() {
  const { examId, candidateId } = useParams<{ examId: string; candidateId: string }>();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId') || null;

  return (
    <CandidateReportPanel
      examId={examId}
      candidateId={candidateId}
      attemptId={attemptId}
      backSlot={<Link href="/v2/reports" style={backLink} className="print:hidden"><ArrowLeft size={15} /> Back to Results</Link>}
    />
  );
}
