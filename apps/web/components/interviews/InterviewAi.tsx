'use client';

// AI interview kit UI (inert until the org configures an AI key — the backend then returns a
// friendly "configure a key" 400 the panels surface as an error). Two self-contained panels:
//  - InterviewQuestionsPanel: recruiter generates a tailored question kit for a pipeline entry.
//  - ScorecardPanel: an interviewer turns raw notes into a structured scorecard.
// Workfox Azure tokens only (var(--org-primary)/--ink/--muted/--hair/--paper); no raw hex.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui-v2/Button';
import {
  useGenerateInterviewQuestions,
  useGenerateScorecard,
  type InterviewQuestionCategory,
  type ScorecardRecommendation,
} from '../../lib/hooks/useInterviews';

const muted = 'var(--muted)';
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const CATEGORY_LABELS: Record<InterviewQuestionCategory, string> = {
  technical: 'Technical',
  behavioral: 'Behavioral',
  role_specific: 'Role-specific',
  culture: 'Culture',
};

export function InterviewQuestionsPanel({ entryId }: { entryId: string }) {
  const gen = useGenerateInterviewQuestions(entryId);
  const [focus, setFocus] = useState('');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Optional focus, e.g. system design"
          aria-label="Interview question focus"
          style={{ flex: '1 1 200px', minWidth: 0, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 14%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)' }}
        />
        <Button onClick={() => gen.mutate({ focus: focus.trim() || undefined })} loading={gen.isPending}>
          <Sparkles size={14} /> Suggest questions
        </Button>
      </div>
      {gen.isError && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 8 }}>{errMsg(gen.error)}</p>}
      {gen.data && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gen.data.questions.map((q, i) => (
            <li key={i} style={{ borderLeft: '2px solid var(--org-primary)', paddingLeft: 10 }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{q.question}</div>
              <div style={{ fontSize: 11.5, color: muted, marginTop: 2 }}>
                {CATEGORY_LABELS[q.category] ?? q.category} · {q.rationale}
              </div>
            </li>
          ))}
          {gen.data.questions.length === 0 && <li style={{ fontSize: 13, color: muted }}>No questions returned — try again.</li>}
        </ul>
      )}
    </div>
  );
}

const REC_LABELS: Record<ScorecardRecommendation, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  no: 'No',
  strong_no: 'Strong no',
};
const REC_TONE: Record<ScorecardRecommendation, string> = {
  strong_yes: '#15803d',
  yes: '#15803d',
  no: 'var(--danger)',
  strong_no: 'var(--danger)',
};

export function ScorecardPanel({ interviewId }: { interviewId: string }) {
  const gen = useGenerateScorecard(interviewId);
  const [notes, setNotes] = useState('');

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste your interview notes here…"
        aria-label="Interview notes"
        rows={6}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 14%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={() => gen.mutate({ notes })} loading={gen.isPending} disabled={!notes.trim()}>
          <Sparkles size={14} /> Generate scorecard
        </Button>
      </div>
      {gen.isError && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 8 }}>{errMsg(gen.error)}</p>}
      {gen.data && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: muted }}>Recommendation</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: REC_TONE[gen.data.recommendation] ?? 'var(--ink)' }}>{REC_LABELS[gen.data.recommendation] ?? gen.data.recommendation}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0 }}>{gen.data.summary}</p>
          {gen.data.competencies.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {gen.data.competencies.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                  <span className="v2-mono" style={{ color: 'var(--org-primary)', minWidth: 28 }}>{c.rating}/5</span>
                  <span style={{ color: 'var(--ink)' }}><strong style={{ fontWeight: 600 }}>{c.name}</strong> — <span style={{ color: muted }}>{c.justification}</span></span>
                </div>
              ))}
            </div>
          )}
          <ScoreList label="Strengths" items={gen.data.strengths} />
          <ScoreList label="Concerns" items={gen.data.concerns} />
          <p style={{ fontSize: 11.5, color: muted, margin: 0 }}>AI-generated from your notes — review before sharing.</p>
        </div>
      )}
    </div>
  );
}

function ScoreList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: muted, marginBottom: 4 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink)' }}>
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
