'use client';

// v2 candidate compare — re-skin of (panel)/reports/[examId]/compare on v2 tokens. Same hook and
// matrix (metrics as rows, candidates as columns); format only. Reached from the v2 exam report's
// "Compare selected"; back-nav stays within /v2. Reuses IntegrityBadge as-is.
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useCandidateComparison } from '../../../../../../lib/hooks/usePanelReports';
import { IntegrityBadge } from '../../../../../../components/ui';
import { Pill } from '../../../../../../components/ui-v2';
import { STATUS, rateColor } from '../../../../../../components/ui-v2/viz';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap' };
const metricCell: React.CSSProperties = { padding: '11px 14px', fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' };
const valueCell: React.CSSProperties = { padding: '11px 14px', fontSize: 13, color: 'var(--ink)' };

// Value + a thin rate-colored magnitude bar, so a metric row is scannable across the candidate
// columns at a glance (high = good; same rateColor + scaleX as the candidate report).
function ScoreCell({ pct, text }: { pct: number | null; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 84 }}>
      <span className="v2-mono">{text}</span>
      {pct !== null && (
        <div style={{ position: 'relative', height: 5, width: 84, borderRadius: 99, overflow: 'hidden', background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
          <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left', transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`, background: rateColor(pct) }} />
        </div>
      )}
    </div>
  );
}

function CompareInner() {
  const { examId } = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const invitationIds = (searchParams.get('invitationIds') ?? '').split(',').filter((id) => id.length > 0);
  const { data: rows, isLoading } = useCandidateComparison(examId, invitationIds);

  const header = (
    <>
      <Link href={`/v2/reports/${examId}`} style={backLink}><ArrowLeft size={15} /> Back to Results</Link>
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
    <div className="v2-rise">
      {header}
      <div style={{ overflowX: 'auto', background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' }}>
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
              {rows.map((row) => <td key={row.invitationId} style={valueCell}><ScoreCell pct={row.percentage} text={row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'} /></td>)}
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
                  const pct = section && section.maxScore > 0 ? (section.score / section.maxScore) * 100 : null;
                  return <td key={row.invitationId} style={valueCell}><ScoreCell pct={pct} text={section ? `${section.score}/${section.maxScore}` : '—'} /></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function V2ComparePage() {
  return (
    <Suspense fallback={<p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}>
      <CompareInner />
    </Suspense>
  );
}
