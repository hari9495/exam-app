import { useState } from 'react';
import { Button } from '../../components/button';
import { RadioGroup } from '../../components/choice';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Card } from '../../components/shell';
import { DataTable } from '../../components/table';
import { errorText } from '../org/org-kit';
import { LivePage, dateText } from '../time/live/kit';
import type { FeedbackTask, LoadState, PeerForm } from '../performance/live/types';

// PRF-07 (batch PM5; re-wired as designed screens in batch F, answer 2579): the feedback a colleague was asked for in a
// review, and answering it. Answers are anonymous and shown only as groups of the company's minimum; advisory, never
// part of the score.

export interface FeedbackTasksScreenProps {
  state: LoadState;
  onRetry?: () => void;
  tasks: FeedbackTask[];
  onOpen: (reviewId: string) => void;
}

export function FeedbackTasksScreen(p: FeedbackTasksScreenProps) {
  return (
    <LivePage title="Feedback I was asked for" description="Colleagues' reviews you were asked to add to. Your answers are anonymous." state={p.state} onRetry={p.onRetry} what="your feedback tasks">
      <DataTable
        label="Feedback I was asked for"
        columns={[
          { key: 'e', header: 'For', value: (t: FeedbackTask) => t.employee, width: 220, hideable: false },
          { key: 'c', header: 'Cycle', value: (t) => t.cycle, width: 220 },
          { key: 'd', header: 'By', value: (t) => t.dueOn ?? '', render: (t) => <Text>{t.dueOn ? dateText(t.dueOn) : '—'}</Text>, width: 130 },
          { key: 's', header: 'Status', value: (t) => (t.done ? 'done' : 'open'), render: (t) => <Badge tone={t.done ? 'success' : t.open ? 'info' : 'neutral'}>{t.done ? 'Sent' : t.open ? 'To do' : 'Closed'}</Badge>, width: 120 },
        ]}
        rows={p.tasks}
        getRowId={(t) => t.id}
        rowNoun={['request', 'requests']}
        cardSummary
        empty={<EmptyState compact title="No one has asked you for feedback." />}
        rowButtons={(t) => (
          <Button size="sm" onClick={() => p.onOpen(t.reviewId)}>
            {t.open ? 'Answer' : 'Open'}
          </Button>
        )}
      />
    </LivePage>
  );
}

export interface PeerFormScreenProps {
  state: LoadState;
  onRetry?: () => void;
  form: PeerForm | null;
  onBack: () => void;
  onSave: (input: { answers: { questionId: string; rating?: number | null; text?: string | null }[]; comment: string | null }, submit: boolean) => Promise<unknown>;
}

export function PeerFormScreen(p: PeerFormScreenProps) {
  const f = p.form;
  return (
    <LivePage title={f ? `Feedback for ${f.employee}` : 'Feedback'} description={f ? `${f.cycle}${f.dueOn ? ` · by ${dateText(f.dueOn)}` : ''}` : undefined} state={p.state} onRetry={p.onRetry} what="this request" actions={<Button onClick={p.onBack}>Back</Button>}>
      {f && <PeerFormBody key={f.entry?.status ?? 'new'} f={f} onSave={p.onSave} />}
    </LivePage>
  );
}

function PeerFormBody({ f, onSave }: { f: PeerForm; onSave: PeerFormScreenProps['onSave'] }) {
  const [answers, setAnswers] = useState<Record<string, { rating: number | null; text: string | null }>>(f.entry?.answers ?? {});
  const [comment, setComment] = useState(f.entry?.comment ?? '');
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [sending, setSending] = useState(false);
  const set = (id: string, patch: Partial<{ rating: number | null; text: string | null }>) => setAnswers((a) => ({ ...a, [id]: { rating: a[id]?.rating ?? null, text: a[id]?.text ?? null, ...patch } }));
  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'save');
    setFailed(null);
    try {
      await onSave({ answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, rating: a.rating, text: a.text })), comment: comment.trim() || null }, submit);
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const done = f.entry?.status === 'submitted';
  return (
    <>
      <InlineAlert tone="info" title="Anonymous">
        {`${f.employee} and their manager see answers only as a group with others', never with your name. Your answer is advisory and does not change the rating.`}
      </InlineAlert>
      {done && <InlineAlert tone="success" title="Sent">Thank you. Your feedback is in.</InlineAlert>}
      {!f.can.answer && !done && <InlineAlert tone="warning" title="Closed">This request is no longer open.</InlineAlert>}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {f.sections.map((s) => (
        <Card key={s.id} title={s.title}>
          {s.questions.map((q) => (
            <div key={q.id} className="yx-tim-stack">
              {q.answer !== 'text' && (
                <FormField id={`pf-${q.id}`} label={q.wholeSection ? `Rating for ${s.title}` : q.text} optional={q.wholeSection || !q.required}>
                  <RadioGroup aria-label={q.wholeSection ? `Rating for ${s.title}` : q.text} orientation="horizontal" disabled={!f.can.answer} value={answers[q.id]?.rating != null ? String(answers[q.id].rating) : ''} onChange={(x) => set(q.id, { rating: Number(x) })} options={f.levels.map((l) => ({ value: String(l.value), label: `${l.value} · ${l.label}` }))} />
                </FormField>
              )}
              {q.answer !== 'rating' && (
                <FormField id={`pt-${q.id}`} label={q.answer === 'text' ? q.text : 'Why'} optional={q.answer === 'both' || !q.required}>
                  <TextArea value={answers[q.id]?.text ?? ''} onChange={(t) => set(q.id, { text: t })} rows={3} maxLength={q.maxChars} disabled={!f.can.answer} />
                </FormField>
              )}
            </div>
          ))}
        </Card>
      ))}
      <FormField id="pf-comment" label="Anything else" optional>
        <TextArea value={comment} onChange={setComment} rows={3} maxLength={5000} disabled={!f.can.answer} />
      </FormField>
      {f.can.answer && (
        <div className="yx-lif-row">
          <Button loading={busy === 'save'} onClick={() => void save(false)}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => setSending(true)}>
            Send feedback
          </Button>
        </div>
      )}
      {sending && (
        <ConfirmDialog open onOpenChange={(o) => !o && setSending(false)} title="Send your feedback?" confirmLabel="Send" onConfirm={async () => {
          await save(true);
          setSending(false);
        }}>
          <Text as="p">You cannot change it afterwards.</Text>
        </ConfirmDialog>
      )}
    </>
  );
}

