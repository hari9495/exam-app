// Assessments AS-6 (PRC-19, answers 2019, 2165): the designed evaluator console and fairness screen with live data. The
// designed EvaluatorConsoleScreen and FairnessScreen (integrity.tsx) render these when the page passes `live`. Same
// layout, kit parts and words as the designs; the server checks every rule again (blind marking, the AI suggestion only
// after a person's own mark and never for an under-18, a moderator who is neither marker, groups below the company's
// least size hidden).
import { useState } from 'react';
import { Button } from '../../components/button';
import { AiBadge, Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, PageHeader } from '../../components/shell';
import { FormField } from '../../components/field';
import { NumberField, TextArea } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { ConfirmDialog } from '../../components/overlay';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { useRun } from '../org/org-kit';
import { useSay } from '../ops/ops-kit';
import { PrcFrame } from './proctoring-shared';
import { CodeAnswer } from './proctoring-kit';
import type { BankLoad } from './bank-live';

/* ------------------------------------------------------------------ PRC-19 · Evaluator console */

export type MarkStatus = 'final' | 'needs_first' | 'needs_second' | 'needs_moderation';

/** GET /asmt/marking/:attemptId/:questionId. */
export interface MarkingItem {
  attemptId: string;
  questionId: string;
  test: string;
  candidate: string;
  blind: boolean;
  question: { text: string; type: string; marks: number };
  answer: { text: string | null; language: string | null; files: string[] };
  state: MarkStatus;
  mine: { marks: number; feedback: string | null; round: number } | null;
  toModerate: { a: number; b: number } | null;
  minor: boolean;
  suggestion: { marks: number; reason: string | null } | null;
  attemptReady: boolean;
  /** AS-6 part 2 (answer 2272): an AI-allowed test's assistant log for this question (null: not an AI-allowed test). */
  assistant?: { turns: { role: 'candidate' | 'assistant'; body: string; at: string }[]; otherTurns: number } | null;
}

export interface LiveEvaluator {
  state: BankLoad;
  onRetry: () => void;
  /** Where this answer sits in my queue (null: nothing waiting for me). */
  position: { index: number; total: number } | null;
  item: MarkingItem | null;
  onMark: (marks: number, feedback: string | null) => Promise<void>;
  /** The AI's suggestion, asked only after my own mark. */
  onSuggest: () => Promise<void>;
  onNext: () => void;
  /** Every human-marked answer of the attempt has its final mark: finish it (asks for the second factor). */
  onFinish: () => Promise<void>;
}

const STATE_WORDS: Record<MarkStatus, string> = {
  final: 'Final mark recorded',
  needs_first: 'Not marked yet',
  needs_second: 'Waiting for a second marker',
  needs_moderation: 'Marks differ: a moderator decides',
};

export function LiveEvaluatorScreen({ live }: { live: LiveEvaluator }) {
  const it = live.item;
  const [marks, setMarks] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [itemKey, setItemKey] = useState('');
  const { busy, run, error } = useRun();
  const { done, say } = useSay();
  const key = it ? `${it.attemptId}:${it.questionId}` : '';
  if (key !== itemKey) {
    // A new answer: start empty.
    setItemKey(key);
    setMarks(null);
    setFeedback('');
  }
  if (live.state === 'error')
    return (
      <PrcFrame page="Evaluation">
        <ErrorState title="We couldn't load the answers to mark." onRetry={live.onRetry} />
      </PrcFrame>
    );
  if (live.state === 'loading')
    return (
      <PrcFrame page="Evaluation">
        <PageHeader title="Marking" description="Loading…" />
      </PrcFrame>
    );
  if (!it || !live.position)
    return (
      <PrcFrame page="Evaluation">
        <PageHeader title="Marking" />
        <EmptyState title="Nothing to mark." description="Written, code, file and spoken answers waiting for you appear here." />
      </PrcFrame>
    );
  const max = it.question.marks;
  const save = () => {
    if (marks == null) return say('Enter your marks first.');
    if (marks > max) return say(`This question is out of ${max} marks.`);
    void run('mark', async () => {
      await live.onMark(marks, feedback.trim() || null);
      done('Mark saved');
    });
  };
  return (
    <PrcFrame page="Evaluation">
      <PageHeader
        title={`Response ${live.position.index + 1} of ${live.position.total}`}
        description={`${it.test} · ${it.blind ? 'Candidate hidden (blind marking)' : it.candidate}`}
        actions={
          <>
            <Button onClick={live.onNext}>{it.mine ? 'Next' : 'Skip'}</Button>
            {!it.mine && (
              <Button variant="primary" loading={busy === 'mark'} onClick={save}>
                Save mark
              </Button>
            )}
          </>
        }
      />
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      <div className="yx-prc-split" data-wide-aside>
        <section className="yx-prc-stack" aria-label="Response">
          <Card title={`Question · ${max} ${max === 1 ? 'mark' : 'marks'}`}>
            <p className="yx-prc-p">{it.question.text}</p>
          </Card>
          {it.question.type === 'code' ? (
            <CodeAnswer language={it.answer.language ?? 'Code'} value={it.answer.text ?? ''} onChange={() => {}} />
          ) : it.answer.files.length ? (
            <Card title="Files">
              <ul className="yx-prc-plain">
                {it.answer.files.map((f) => (
                  <li key={f}>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card title={`Answer · ${(it.answer.text ?? '').trim().split(/\s+/).filter(Boolean).length} words`}>
              <p className="yx-prc-p">{it.answer.text || 'No answer was written.'}</p>
            </Card>
          )}
          {it.assistant && (
            <>
              <InlineAlert tone="info">AI-allowed test. Using the approved assistant is not an integrity issue here. Score prompting and checking from the log.</InlineAlert>
              <Card title={`Assistant log for this question · ${it.assistant.turns.filter((t) => t.role === 'candidate').length} ${it.assistant.turns.filter((t) => t.role === 'candidate').length === 1 ? 'turn' : 'turns'}`} actions={<AiBadge />}>
                {it.assistant.turns.length ? (
                  <ul className="yx-prc-plain" aria-label="Assistant log">
                    {it.assistant.turns.map((t, i) => (
                      <li key={i}>
                        <span>
                          <strong>{t.role === 'candidate' ? 'Candidate:' : 'Assistant:'}</strong> {t.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="yx-prc-muted">The candidate did not use the assistant on this question.</p>
                )}
                {it.assistant.otherTurns > 0 && <p className="yx-prc-muted yx-prc-small">{`${it.assistant.otherTurns} more ${it.assistant.otherTurns === 1 ? 'question' : 'questions'} to the assistant on other questions of this test.`}</p>}
              </Card>
            </>
          )}
        </section>
        <aside className="yx-prc-stack" aria-label="Your mark">
          {it.toModerate && <InlineAlert tone="warning" title="You are the moderator">{`The two blind marks were ${it.toModerate.a} and ${it.toModerate.b}. Your mark is final; you do not see their comments.`}</InlineAlert>}
          {it.mine ? (
            <div className="yx-prc-box" data-tone="subtle" aria-live="polite">
              <strong>{`Your mark: ${it.mine.marks} / ${max}`}</strong>
              <span className="yx-prc-small">{STATE_WORDS[it.state]}</span>
            </div>
          ) : (
            <section className="yx-prc-box" aria-label="Mark this answer">
              <FormField label={`Your marks (out of ${max})`} required>
                <NumberField value={marks} onChange={(v) => setMarks(v == null ? null : Math.max(0, Math.round(Number(v))))} min={0} max={max} />
              </FormField>
              <FormField label="Feedback" optional helper="Shown with the mark. Other markers never see it.">
                <TextArea rows={3} maxLength={2000} value={feedback} onChange={setFeedback} />
              </FormField>
            </section>
          )}
          <div className="yx-prc-box" data-tone="subtle" aria-live="polite">
            {it.minor ? (
              <span className="yx-prc-small">Under-18 test-taker: human marking only, no AI suggestion.</span>
            ) : !it.mine ? (
              <span className="yx-prc-small yx-prc-muted">The AI suggestion shows after you enter your own mark.</span>
            ) : it.suggestion ? (
              <span className="yx-prc-stack" data-gap="sm">
                <span className="yx-prc-row yx-prc-small">
                  <AiBadge /> {`Suggested ${it.suggestion.marks} / ${max} from the text only. Advisory; your mark counts.`}
                </span>
                {it.suggestion.reason && <span className="yx-prc-small yx-prc-muted">{it.suggestion.reason}</span>}
              </span>
            ) : it.question.type === 'code' || it.question.type === 'essay' ? (
              <Button size="sm" loading={busy === 'ai'} onClick={() => void run('ai', live.onSuggest)}>
                Show the AI suggestion
              </Button>
            ) : (
              <span className="yx-prc-small yx-prc-muted">No AI suggestion for files or recordings.</span>
            )}
          </div>
          {it.state === 'needs_moderation' && it.mine && <InlineAlert tone="warning" title="Marks differ">Your mark and the other blind marker's are far apart. A third person moderates; neither of you sees the other's comments.</InlineAlert>}
          {it.attemptReady && (
            <Button variant="primary" loading={busy === 'finish'} onClick={() => void run('finish', live.onFinish).then((ok) => ok && done('Marking finished; the result is worked out'))}>
              Finish marking this attempt
            </Button>
          )}
        </aside>
      </div>
    </PrcFrame>
  );
}

/* ------------------------------------------------------------------ Extra · Fairness analytics (answer 2019) */

export interface FairnessRow {
  group: string;
  attempts: number | null;
  rate: number | null;
  ratio: number | null;
  status: 'ok' | 'watch' | 'flagged' | 'hidden';
}

/** GET /asmt/fairness/:examId. */
export interface FairnessData {
  exam: { id: string; title: string };
  minGroup: number;
  described: number;
  rows: FairnessRow[];
  finding: { group: string; ratio: number } | null;
  review: { id: string; finding: string; openedAt: string; decision: string | null; reason: string | null; decidedAt: string | null } | null;
  survey: { responses: number; averageRating: number; clearPercent: number | null } | null;
}

export interface LiveFairness {
  state: BankLoad;
  onRetry: () => void;
  data: FairnessData | null;
  /** The company's tests to pick from. */
  tests: { id: string; title: string }[];
  onTest: (id: string) => void;
  /** Test writers only: open and decide a review. */
  onOpenReview?: () => Promise<void>;
  onDecide?: (id: string, decision: 'keep' | 'revise' | 'retire', reason: string) => Promise<void>;
}

const STATUS_BADGE: Record<FairnessRow['status'], { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  ok: { tone: 'success', label: 'OK' },
  watch: { tone: 'warning', label: 'Watch' },
  flagged: { tone: 'danger', label: 'Below 0.80' },
  hidden: { tone: 'neutral', label: 'Hidden' },
};
const DECISION_WORDS: Record<string, string> = { keep: 'Kept, with a reason', revise: 'To be revised', retire: 'To be retired' };

export function LiveFairnessScreen({ live }: { live: LiveFairness }) {
  const [deciding, setDeciding] = useState(false);
  const [decision, setDecision] = useState<string | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, run, error } = useRun();
  const { done } = useSay();
  const d = live.data;
  if (live.state === 'error')
    return (
      <PrcFrame page="Fairness">
        <ErrorState title="We couldn't load the fairness check." onRetry={live.onRetry} />
      </PrcFrame>
    );
  const cols: TableColumn<FairnessRow>[] = [
    { key: 'group', header: 'Group', value: (r) => r.group, width: 180 },
    { key: 'attempts', header: 'Attempts', type: 'number', value: (r) => r.attempts ?? '', render: (r) => (r.attempts == null ? `Under ${d?.minGroup ?? 30}` : r.attempts.toLocaleString('en-IN')), width: 120 },
    { key: 'rate', header: 'Pass rate', type: 'number', value: (r) => r.rate ?? '', render: (r) => (r.rate == null ? 'Hidden' : `${Math.round(r.rate * 100)} %`), width: 120 },
    { key: 'ratio', header: 'Impact ratio', type: 'number', value: (r) => r.ratio ?? '', render: (r) => (r.ratio == null ? 'Hidden' : r.ratio.toFixed(2)), width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => STATUS_BADGE[r.status].label, statusTone: (v) => Object.values(STATUS_BADGE).find((b) => b.label === v)?.tone ?? 'neutral', width: 130 },
  ];
  const open = d?.review && !d.review.decision ? d.review : null;
  return (
    <PrcFrame page="Fairness">
      <PageHeader
        title="Fairness and validity"
        description={d ? `${d.exam.title} · self-declared, voluntary answers, used only as counts · groups under ${d.minGroup} are hidden` : 'Loading…'}
        actions={live.tests.length > 1 ? <Select aria-label="Test" size="sm" value={d?.exam.id ?? null} onChange={(v) => v && live.onTest(v)} options={live.tests.map((t) => ({ value: t.id, label: t.title }))} /> : undefined}
      />
      {error && (
        <InlineAlert tone="danger" title="That did not work">
          {error}
        </InlineAlert>
      )}
      {d && d.finding && !open && !(d.review && !d.review.decision) && (
        <InlineAlert tone="danger" title={`Finding: pass rate for ${d.finding.group.toLowerCase()} is ${Math.round(d.finding.ratio * 100)} % of the highest group's`} actions={live.onOpenReview ? <Button size="sm" loading={busy === 'open'} onClick={() => void run('open', live.onOpenReview!).then((ok) => ok && done('Review task opened'))}>Open review task</Button> : undefined}>
          The test stays live; attempts in progress are never interrupted. Decide: keep with a reason, revise, or retire.
        </InlineAlert>
      )}
      {open && (
        <InlineAlert tone="warning" title="Review open" actions={live.onDecide ? <Button size="sm" onClick={() => setDeciding(true)}>Decide</Button> : undefined}>
          {open.finding}.
        </InlineAlert>
      )}
      {d?.review?.decision && <InlineAlert tone="info" title={DECISION_WORDS[d.review.decision] ?? d.review.decision}>{d.review.reason}</InlineAlert>}
      <Card title="Adverse impact (4/5ths rule)">
        <DataTable label="Pass rate by group" columns={cols} rows={d?.rows ?? []} getRowId={(r) => r.group} state={live.state === 'loading' ? 'loading' : 'ready'} empty={<EmptyState title="No answers yet." description="Candidates may say how they describe themselves after a test; only counts are shown." />} />
        {d && <p className="yx-prc-small yx-prc-muted">{`${d.described} candidates with a result answered the voluntary question. A group shows from ${d.minGroup} answers (Settings › Assessments).`}</p>}
      </Card>
      <Card title="After-test survey">
        {d?.survey ? (
          <p className="yx-prc-p">{`${d.survey.responses} answers · average ${d.survey.averageRating} of 5${d.survey.clearPercent != null ? ` · ${d.survey.clearPercent} % found the instructions clear` : ''}`}</p>
        ) : (
          <EmptyState compact title="Not enough answers yet." description="The survey shows from 5 answers, so no one can be picked out." />
        )}
      </Card>
      {open && live.onDecide && (
        <ConfirmDialog
          open={deciding}
          onOpenChange={setDeciding}
          title="Decide the review"
          consequence="Recorded with your reason; the test's history keeps it."
          confirmLabel="Save decision"
          onConfirm={async () => {
            setTried(true);
            if (!decision || reason.trim().length < 10) return false;
            await live.onDecide!(open.id, decision as 'keep' | 'revise' | 'retire', reason.trim());
            done('Decision saved');
          }}
        >
          <div className="yx-prc-stack">
            <RadioGroup aria-label="Decision" value={decision} onChange={setDecision} options={[{ value: 'keep', label: 'Keep, with a reason' }, { value: 'revise', label: 'Revise the test' }, { value: 'retire', label: 'Retire the test' }]} />
            {tried && !decision && <p className="yx-prc-small">Choose a decision.</p>}
            <FormField label="Reason" required error={tried && reason.trim().length < 10 ? 'Give a reason of at least 10 characters.' : undefined}>
              <TextArea rows={3} maxLength={2000} value={reason} onChange={setReason} />
            </FormField>
          </div>
        </ConfirmDialog>
      )}
    </PrcFrame>
  );
}

