'use client';

// Candidate-experience surveys: build a short question set (rating 1-5 + free text), auto-fire it when
// a candidate reaches a target global stage (e.g. Rejected) or send it manually from the candidate
// drawer, then read per-question aggregates on the results page. Workfox Azure tokens only.
// Backend: apps/api/src/surveys/*.
import { useState } from 'react';
import Link from 'next/link';
import { Button, Combobox } from '../../../../components/ui-v2';
import { useToast } from '../../../../components/ui';
import { useSurveys, useCreateSurvey, useUpdateSurvey, useSetSurveyEnabled, useDeleteSurvey, SurveyInput } from '../../../../lib/hooks/useSurveys';
import type { SurveyDefinition, SurveyQuestion } from '../../../../lib/types';

const ink = 'var(--ink)';
const muted = 'var(--muted)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '18px 20px' };
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 500, color: ink, marginBottom: 6 };
const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, outline: 'none' };
const ghostBtn: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '7px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 16%, var(--hair))', background: 'var(--paper)', color: ink, cursor: 'pointer' };

// Duplicated web-side (the web bundle can't import shared runtime VALUES). Mirrors GLOBAL_STAGES.
// '' = manual send only. Unlike drip, 'hired' is a valid trigger (a post-hire experience survey).
const STAGE_OPTIONS = [
  { value: '', label: 'Manual send only' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'hired', label: 'Hired' },
  { value: 'offered', label: 'Offered' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'available', label: 'Available' },
  { value: 'in_review', label: 'In review' },
  { value: 'new', label: 'New' },
];
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGE_OPTIONS.map((o) => [o.value, o.label]));
const TYPE_OPTIONS = [
  { value: 'rating', label: 'Rating (1–5)' },
  { value: 'text', label: 'Free text' },
];

const emptyQuestion = (): SurveyQuestion => ({ type: 'rating', prompt: '' });

interface Draft { id: string | null; name: string; triggerStage: string; questions: SurveyQuestion[] }

function QuestionEditor({ index, question, onChange, onRemove }: { index: number; question: SurveyQuestion; onChange: (q: SurveyQuestion) => void; onRemove: () => void }) {
  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>Question {index + 1}</span>
        <button type="button" style={ghostBtn} onClick={onRemove}>Remove</button>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <span style={label}>Type</span>
          <Combobox options={TYPE_OPTIONS} value={question.type} onChange={(v) => onChange({ ...question, type: v as SurveyQuestion['type'] })} width={180} />
        </div>
        <label style={{ flex: 1, minWidth: 220 }}>
          <span style={label}>Prompt</span>
          <input value={question.prompt} onChange={(e) => onChange({ ...question, prompt: e.target.value })} style={textInput} placeholder="e.g. How would you rate your interview experience?" />
        </label>
      </div>
    </div>
  );
}

export default function SurveysPage() {
  const { data: surveys } = useSurveys();
  const create = useCreateSurvey();
  const update = useUpdateSurvey();
  const setEnabled = useSetSurveyEnabled();
  const remove = useDeleteSurvey();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  function startNew() { setError(null); setDraft({ id: null, name: '', triggerStage: '', questions: [emptyQuestion()] }); }
  function startEdit(s: SurveyDefinition) {
    setError(null);
    setDraft({ id: s.id, name: s.name, triggerStage: s.triggerStage ?? '', questions: s.questions.length ? s.questions : [emptyQuestion()] });
  }

  function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setError('Give the survey a name.'); return; }
    if (draft.questions.length === 0) { setError('Add at least one question.'); return; }
    for (const [i, q] of draft.questions.entries()) {
      if (!q.prompt.trim()) { setError(`Question ${i + 1}: prompt is required.`); return; }
    }
    setError(null);
    const input: SurveyInput = { name: draft.name.trim(), triggerStage: draft.triggerStage || undefined, questions: draft.questions };
    const onDone = { onSuccess: () => { toast('Survey saved.'); setDraft(null); }, onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Failed to save.') };
    if (draft.id) update.mutate({ id: draft.id, input }, onDone);
    else create.mutate(input, onDone);
  }

  function updateQuestion(i: number, q: SurveyQuestion) { setDraft((d) => (d ? { ...d, questions: d.questions.map((x, j) => (j === i ? q : x)) } : d)); }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Surveys</h1>
          <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>Ask candidates about their experience. A survey can auto-fire when a candidate reaches a stage (e.g. Rejected), or be sent by hand from the candidate drawer. Candidates answer from a private link — no account needed.</p>
        </div>
        {!draft && <Button onClick={startNew}>New survey</Button>}
      </div>

      {draft ? (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="wf-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label>
              <span style={label}>Survey name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={textInput} placeholder="e.g. Post-rejection feedback" />
            </label>
            <div>
              <span style={label}>Auto-send trigger</span>
              <Combobox options={STAGE_OPTIONS} value={draft.triggerStage} onChange={(v) => setDraft({ ...draft, triggerStage: v })} width="100%" />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {draft.questions.map((q, i) => (
              <QuestionEditor key={i} index={i} question={q} onChange={(qq) => updateQuestion(i, qq)} onRemove={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })} />
            ))}
            <button type="button" style={{ ...ghostBtn, alignSelf: 'flex-start' }} onClick={() => setDraft({ ...draft, questions: [...draft.questions, emptyQuestion()] })}>Add question</button>
          </div>

          <p style={{ fontSize: 12, color: muted, margin: 0 }}>Rating questions ask for a score from 1 to 5. The invite email carries your org branding and an unsubscribe link.</p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button onClick={save} loading={saving}>{draft.id ? 'Save changes' : 'Create survey'}</Button>
            <button type="button" style={ghostBtn} onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
            {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>{error}</span>}
          </div>
        </div>
      ) : !surveys ? (
        <div style={card} aria-busy="true"><p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p></div>
      ) : surveys.length === 0 ? (
        <div style={card}><p style={{ fontSize: 13, color: muted, margin: 0 }}>No surveys yet. Create one to start collecting candidate feedback.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {surveys.map((s) => (
            <div key={s.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: ink }}>{s.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: s.enabled ? 'var(--org-primary)' : muted, background: s.enabled ? 'color-mix(in srgb, var(--org-primary) 12%, transparent)' : 'var(--surface)', borderRadius: 99, padding: '2px 9px' }}>{s.enabled ? 'Active' : 'Off'}</span>
                </div>
                <div style={{ fontSize: 12.5, color: muted, marginTop: 3 }}>
                  {s.questions.length} question{s.questions.length === 1 ? '' : 's'} · {s.triggerStage ? `Auto: ${STAGE_LABEL[s.triggerStage] ?? s.triggerStage}` : 'Manual send'}
                  {typeof s.submitted === 'number' ? ` · ${s.submitted}/${s.invited ?? 0} responded` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link href={`/v2/surveys/${s.id}`} style={{ ...ghostBtn, textDecoration: 'none' }}>Results</Link>
                <button type="button" style={ghostBtn} disabled={setEnabled.isPending} onClick={() => setEnabled.mutate({ id: s.id, enabled: !s.enabled }, { onError: (e) => toast(e instanceof Error ? e.message : 'Failed.', 'error') })}>
                  {s.enabled ? 'Disable' : 'Enable'}
                </button>
                <button type="button" style={ghostBtn} onClick={() => startEdit(s)}>Edit</button>
                <button type="button" style={ghostBtn} onClick={() => { if (confirm(`Delete survey "${s.name}"? Responses will be removed.`)) remove.mutate(s.id, { onSuccess: () => toast('Survey deleted.'), onError: (e) => toast(e instanceof Error ? e.message : 'Failed.', 'error') }); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
