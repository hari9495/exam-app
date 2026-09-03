'use client';

// v2 panel candidate compare — same as the recruiter v2 compare (one hook, metrics-as-rows matrix,
// format only), reached from the panel exam report's "Compare selected"; back-nav stays under
// /v2/panel/*. Keeps the Suspense wrapper (useSearchParams). Reuses IntegrityBadge as-is.
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useCandidateComparison } from '../../../../../../lib/hooks/usePanelReports';
import { IntegrityBadge } from '../../../../../../components/ui';
import { Pill } from '../../../../../../components/ui-v2';
import { STATUS } from '../../../../../../components/ui-v2/viz';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap' };
const metricCell: React.CSSProperties = { padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' };
const valueCell: React.CSSProperties = { padding: '11px 14px', fontSize: 13, color: 'var(--ink)' };

function CompareInner() {
  const { examId } = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const invitationIds = (searchParams.get('invitationIds') ?? '').split(',').filter((id) => id.length > 0);
  const { data: rows, isLoading } = useCandidateComparison(examId, invitationIds);

  const header = (
    <>
      <Link href={`/v2/panel/reports/${examId}`} style={backLink}><ArrowLeft size={15} /> Back to Results</Link>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '12px 0 20px' }}>Compare candidates</h1>
    </>
  );

  if (invitationIds.length < 2) {
    return <div>{header}<p style={{ fontSize: 13, color: 'var(--muted)' }}>Select at least 2 candidates to compare.</p></div>;
  }
  if (isLoading || !rows) {
    return <div>{header}<p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p></div>;
  }

  const sectionTitles = [...new Set(rows.flatMap((row) => row.sectionScores.map((section) => section.title)))];

  return (
    <div>
      {header}
      <div style={{ overflowX: 'auto', background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hair)' }}>
              <th style={th}>Metric</th>
              {rows.map((row) => <th key={row.invitationId} style={{ ...th, color: 'var(--ink)', fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>{row.candidateName}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--hair)' }}>
              <td style={metricCell}>Overall score</td>
              {rows.map((row) => <td key={row.invitationId} style={valueCell}><span className="v2-mono">{row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'}</span></td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid var(--hair)' }}>
              <td style={metricCell}>Result</td>
              {rows.map((row) => <td key={row.invitationId} style={valueCell}>{row.passFail ? <Pill c={row.passFail === 'pass' ? STATUS.ok : STATUS.bad} label={row.passFail} /> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>)}
            </tr>
            <tr style={{ borderBottom: '1px solid var(--hair)' }}>
              <td style={metricCell}>Integrity</td>
              {rows.map((row) => <td key={row.invitationId} style={valueCell}><IntegrityBadge level={row.integrityAnalysis?.level} /></td>)}
            </tr>
            {sectionTitles.map((title) => (
              <tr key={title} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={metricCell}>{title}</td>
                {rows.map((row) => {
                  const section = row.sectionScores.find((s) => s.title === title);
                  return <td key={row.invitationId} style={valueCell}><span className="v2-mono">{section ? `${section.score}/${section.maxScore}` : '—'}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function V2PanelComparePage() {
  return (
    <Suspense fallback={<p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}>
      <CompareInner />
    </Suspense>
  );
}
