'use client';

// Survey results: response rate + per-question aggregates (rating average & distribution, free-text
// answers). Reuses the reports aggregate shape (getSurveySummary). Backend: apps/api/src/surveys.
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSurveySummary } from '../../../../../lib/hooks/useSurveys';
import type { SurveySummaryQuestion } from '../../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px' };

function RatingQuestion({ q }: { q: SurveySummaryQuestion }) {
  const dist = q.distribution ?? {};
  const max = Math.max(1, ...Object.values(dist));
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: ink }}>{q.prompt}</span>
        <span style={{ fontSize: 13, color: muted }}>
          <strong style={{ color: ink, fontVariantNumeric: 'tabular-nums' }}>{q.averageRating?.toFixed(1) ?? '—'}</strong> avg · {q.count} response{q.count === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {[5, 4, 3, 2, 1].map((n) => {
          const count = dist[String(n)] ?? 0;
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: muted }}>
              <span style={{ width: 14, textAlign: 'right', color: ink }}>{n}</span>
              <div style={{ flex: 1, height: 8, background: 'var(--surface)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: 'var(--org-primary)', borderRadius: 99 }} />
              </div>
              <span style={{ width: 28, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TextQuestion({ q }: { q: SurveySummaryQuestion }) {
  const responses = q.responses ?? [];
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: ink }}>{q.prompt}</span>
        <span style={{ fontSize: 13, color: muted }}>{q.count} response{q.count === 1 ? '' : 's'}</span>
      </div>
      {responses.length === 0 ? (
        <p style={{ fontSize: 13, color: muted, margin: '12px 0 0' }}>No written answers yet.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {responses.map((r, i) => (
            <li key={i} style={{ fontSize: 13, color: ink, background: 'var(--surface)', borderRadius: 8, padding: '9px 11px', lineHeight: 1.5 }}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SurveyResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: summary, isLoading, error } = useSurveySummary(id);

  return (
    <div style={{ maxWidth: 820 }}>
      <Link href="/v2/surveys" style={{ fontSize: 12.5, color: muted, textDecoration: 'none' }}>← Surveys</Link>
      {isLoading ? (
        <div style={{ ...card, marginTop: 12 }} aria-busy="true"><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
      ) : error || !summary ? (
        <div style={{ ...card, marginTop: 12 }}><p style={{ fontSize: 13, color: muted, margin: 0 }}>Couldn’t load these results.</p></div>
      ) : (
        <>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>{summary.survey.name}</h1>
            <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>
              <strong style={{ color: ink, fontVariantNumeric: 'tabular-nums' }}>{summary.totalSubmitted}</strong> of {summary.totalInvited} invited responded
              {summary.totalInvited > 0 ? ` · ${summary.responseRate.toFixed(0)}% response rate` : ''}
            </p>
          </div>
          {summary.questions.length === 0 ? (
            <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>This survey has no questions.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {summary.questions.map((q, i) => (q.type === 'rating' ? <RatingQuestion key={i} q={q} /> : <TextQuestion key={i} q={q} />))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
