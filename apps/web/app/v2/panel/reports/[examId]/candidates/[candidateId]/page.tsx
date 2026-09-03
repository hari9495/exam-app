'use client';

// v2 panel candidate report route — thin wrapper around the recruiter v2 CandidateReportPanel
// (reused as-is; no panel-specific copy). Same params/attemptId handling and Suspense wrapper as the
// recruiter route; only the back link points at /v2/panel/reports/:examId so panelists stay under
// /v2/panel/*.
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CandidateReportPanel } from '../../../../../(recruiter)/reports/CandidateReportPanel';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };

function CandidateReportInner() {
  const { examId, candidateId } = useParams<{ examId: string; candidateId: string }>();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId') || null;

  return (
    <CandidateReportPanel
      examId={examId}
      candidateId={candidateId}
      attemptId={attemptId}
      backSlot={<Link href={`/v2/panel/reports/${examId}`} style={backLink} className="print:hidden"><ArrowLeft size={15} /> Back to Results</Link>}
    />
  );
}

export default function V2PanelCandidateReportPage() {
  return (
    <Suspense fallback={<p style={{ padding: 32, fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}>
      <CandidateReportInner />
    </Suspense>
  );
}
