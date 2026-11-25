// AS-5 part 1 (answers 2006, 2008, 2012): the designed integrity queue (PRC-16), incident workspace (PRC-17) and appeals
// (PRC-18) with real data. Only kit parts; the designed sample screens in integrity.tsx hand over when given `live`.
import { useState } from 'react';
import { Download, Scale } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { EmptyState, ErrorState, InlineAlert } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { BarChart, LineChart } from '../../components/charts';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Select } from '../../components/select';
import { RadioGroup } from '../../components/choice';
import { SYSTEM_ACTOR, Timeline } from '../../components/timeline';
import { EvidenceFrame } from './proctoring-kit';
import { PrcFrame } from './proctoring-shared';
import { VERDICT_LABEL, type Verdict } from './proctoring-logic';

type Load = 'loading' | 'error' | 'ready';
const REASON_MIN = 10;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const LEVEL = { high_concern: { label: 'High concern', tone: 'danger' }, review: { label: 'Review', tone: 'warning' }, manual: { label: 'Opened by a person', tone: 'neutral' } } as const;
const STATUS = { open: 'Waiting for a verdict', second_review: 'Waiting for the second reviewer', decided: 'Verdict given' } as const;
const FLAG: Record<string, string> = {
  large_paste: 'Large paste',
  paste_dominant: 'Mostly pasted',
  no_iteration: 'No edits or runs',
  similarity_match: 'Similar to another candidate',
  webcam_violations: 'Camera flags',
  proctoring_events: 'Browser flags',
};
const flagLabel = (t: string) => FLAG[t] ?? t.replace(/_/g, ' ');
const useAct = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<unknown>, done?: () => void) => {
    setBusy(key);
    setError(null);
    fn()
      .then(() => done?.())
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Try again in a moment.'))
      .finally(() => setBusy(null));
  };
  return { busy, error, run };
};

/* ---------------- PRC-16 · queue ---------------- */

export interface LiveIncidentRow {
  id: string;
  candidate: string;
  test: string;
  level: keyof typeof LEVEL;
  flags: string[];
  status: keyof typeof STATUS;
  reviewer: string | null;
  verdict: Verdict | null;
  appeal: 'open' | 'upheld' | 'overturned' | null;
  openedAt: string;
}
export interface LiveIntegrityQueue {
  state: Load;
  onRetry: () => void;
  rows: LiveIncidentRow[];
  onOpen: (id: string) => void;
}

const QUEUE_COLS: TableColumn<LiveIncidentRow>[] = [
  { key: 'candidate', header: 'Candidate', value: (r) => r.candidate, width: 180 },
  { key: 'test', header: 'Test', value: (r) => r.test, width: 220 },
  { key: 'level', header: 'Concern', value: (r) => LEVEL[r.level].label, render: (r) => <Badge tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</Badge>, width: 140 },
  { key: 'flags', header: 'What was flagged', value: (r) => r.flags.map(flagLabel).join(', ') || '—', width: 240 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'decided' && r.verdict ? VERDICT_LABEL[r.verdict] : STATUS[r.status]), statusTone: (v) => (v === STATUS.open ? 'warning' : v === STATUS.second_review ? 'info' : 'neutral'), width: 200 },
  { key: 'appeal', header: 'Appeal', value: (r) => (r.appeal === 'open' ? 'Open' : r.appeal === 'upheld' ? 'Upheld' : r.appeal === 'overturned' ? 'Overturned' : '—'), width: 110 },
  { key: 'reviewer', header: 'Reviewer', value: (r) => r.reviewer ?? 'Not taken', width: 150 },
  { key: 'openedAt', header: 'Opened', value: (r) => day(r.openedAt), width: 120 },
];

export function LiveIntegrityQueueScreen({ live }: { live: LiveIntegrityQueue }) {
  const waiting = live.rows.filter((r) => r.status !== 'decided').length;
  return (
    <PrcFrame page="Integrity queue">
      <PageHeader
        title="Integrity review"
        description={`High concern first, then oldest. Signals are flags for people to review; nothing here fails a candidate by itself.${live.state === 'ready' ? ` ${waiting} waiting.` : ''}`}
      />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load incidents." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Incidents"
          columns={QUEUE_COLS}
          rows={live.rows}
          getRowId={(r) => r.id}
          state={live.state === 'loading' ? 'loading' : 'ready'}
          empty={<EmptyState title="Nothing to review." description="An incident opens when a test ends with flags, or when a reviewer opens one from a candidate's report." />}
          onRowClick={(r) => live.onOpen(r.id)}
          pageSize={20}
        />
      )}
    </PrcFrame>
  );
}

/* ---------------- PRC-17 · incident workspace ---------------- */

export interface LiveIncident {
  id: string;
  status: keyof typeof STATUS;
  level: keyof typeof LEVEL;
  candidate: { name: string; email: string };
  test: { title: string };
  submittedAt: string | null;
  sections: string[];
  analysis: { flags: { type: string; severity: string; detail: string }[]; narrative: string | null } | null;
  events: { id: string; type: string; severity: string; at: string }[];
  /** Answer 2262: the frames kept (opened one by one, each opening audited). */
  frames?: { eventId: string; kind: 'camera' | 'screen'; at: string; what: string; flagged: boolean }[];
  reviewer: { id: string; name: string | null } | null;
  verdict: Verdict | null;
  sectionTitle: string | null;
  reason: string | null;
  decidedBy: { id: string; name: string | null } | null;
  decidedAt: string | null;
  secondReviewer: { id: string; name: string | null } | null;
  confirmedBy: { id: string; name: string | null } | null;
  confirmedAt: string | null;
  appealClosesAt: string | null;
  appeal: { text: string; status: 'open' | 'upheld' | 'overturned'; reason: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string } | null;
}
export interface LiveIncidentWorkspace {
  state: Load;
  onRetry: () => void;
  incident: LiveIncident | null;
  /** The signed-in reviewer's id. */
  me: string;
  /** Who else may review (for the second reviewer of an invalidation). */
  reviewers: { id: string; name: string }[];
  onTake: () => Promise<unknown>;
  onVerdict: (input: { verdict: 'cleared' | 'warning' | 'section'; reason: string; sectionTitle?: string }) => Promise<unknown>;
  /** Asks for the second factor first (the page). */
  onInvalidate: (input: { reason: string; secondReviewerId: string }) => Promise<unknown>;
  onSecondReview: (input: { confirm: boolean; reason: string }) => Promise<unknown>;
  onBack: () => void;
  /** Answer 2262: opens one frame (audited). */
  onFrame?: (eventId: string, kind: 'camera' | 'screen') => Promise<unknown>;
}

function DecisionCard({ live, inc }: { live: LiveIncidentWorkspace; inc: LiveIncident }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useAct();
  const reasonError = tried && reason.trim().length < REASON_MIN ? `Enter a reason of at least ${REASON_MIN} characters.` : undefined;
  const sectionError = tried && verdict === 'section' && !section ? 'Choose the section.' : undefined;
  const secondError = tried && verdict === 'attempt' && !second ? 'Choose the second reviewer.' : undefined;
  const save = () => {
    setTried(true);
    if (!verdict || reason.trim().length < REASON_MIN || (verdict === 'section' && !section) || (verdict === 'attempt' && !second)) return;
    run('save', () => (verdict === 'attempt' ? live.onInvalidate({ reason, secondReviewerId: second! }) : live.onVerdict({ verdict, reason, ...(verdict === 'section' ? { sectionTitle: section! } : {}) })));
  };
  return (
    <Card title="Your decision">
      <div className="yx-prc-stack">
        {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
        <RadioGroup
          aria-label="Verdict"
          value={verdict ?? undefined}
          onChange={(v) => setVerdict(v as Verdict)}
          options={[
            { value: 'cleared', label: `${VERDICT_LABEL.cleared} (accept the attempt)`, description: 'No integrity action; the result can be released.' },
            { value: 'warning', label: VERDICT_LABEL.warning, description: 'Recorded; the score stands. The candidate can appeal.' },
            { value: 'section', label: VERDICT_LABEL.section, description: "That section's score is voided. The candidate can appeal." },
            { value: 'attempt', label: `${VERDICT_LABEL.attempt} (disqualify)`, description: 'Needs a second reviewer and your second factor.' },
          ]}
        />
        {verdict === 'section' && (
          <FormField label="Section" required error={sectionError}>
            <Select value={section} onChange={setSection} options={inc.sections.map((s) => ({ value: s, label: s }))} placeholder="Choose section" />
          </FormField>
        )}
        {verdict === 'attempt' && (
          <FormField label="Second reviewer" required error={secondError} helper="Someone else who reviews integrity here; they confirm or send it back.">
            <Select value={second} onChange={setSecond} options={live.reviewers.map((r) => ({ value: r.id, label: r.name }))} placeholder="Choose reviewer" />
          </FormField>
        )}
        <FormField label="Reason and evidence referred to" required error={reasonError} helper="The candidate sees this reason if the verdict is not cleared.">
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={2000} placeholder="E.g. frames at 23:15 and 33:30 show a second person reading the screen" />
        </FormField>
        <Button variant="primary" loading={busy === 'save'} onClick={save} disabled={!verdict}>
          {verdict === 'attempt' ? 'Send for second review' : 'Save verdict'}
        </Button>
        <p className="yx-prc-muted yx-prc-small">Signals and AI never decide. The candidate is told the outcome and can appeal any verdict but cleared.</p>
      </div>
    </Card>
  );
}

function SecondReviewCard({ live, inc }: { live: LiveIncidentWorkspace; inc: LiveIncident }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useAct();
  const mine = inc.secondReviewer?.id === live.me;
  const go = (confirm: boolean) => {
    setTried(true);
    if (reason.trim().length < REASON_MIN) return;
    run(confirm ? 'confirm' : 'back', () => live.onSecondReview({ confirm, reason }));
  };
  return (
    <Card title="Second review">
      <div className="yx-prc-stack">
        <InlineAlert tone="info">{`${inc.decidedBy?.name ?? 'A reviewer'} proposed "${VERDICT_LABEL.attempt}". ${mine ? 'You are the second reviewer: confirm it, or send it back for another verdict.' : `${inc.secondReviewer?.name ?? 'The second reviewer'} confirms or sends it back.`}`}</InlineAlert>
        <DescriptionList items={[{ label: 'Their reason', value: inc.reason ?? '—' }]} />
        {mine && (
          <>
            {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
            <FormField label="Your reason" required error={tried && reason.trim().length < REASON_MIN ? `Enter a reason of at least ${REASON_MIN} characters.` : undefined}>
              <TextArea value={reason} onChange={setReason} rows={3} maxLength={2000} />
            </FormField>
            <div className="yx-prc-row">
              <Button loading={busy === 'back'} onClick={() => go(false)}>
                Send back
              </Button>
              <Button variant="primary" loading={busy === 'confirm'} onClick={() => go(true)}>
                Confirm invalidation
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function LiveIncidentWorkspaceScreen({ live }: { live: LiveIncidentWorkspace }) {
  const { busy, error, run } = useAct();
  const inc = live.incident;
  if (live.state !== 'ready' || !inc)
    return (
      <PrcFrame page="Integrity queue">
        {live.state === 'error' ? <ErrorState title="We couldn't load this incident." onRetry={live.onRetry} /> : <EmptyState title="Loading the incident…" />}
      </PrcFrame>
    );
  const holdNote =
    inc.status !== 'decided' ? 'Held until decided' : inc.appeal?.status === 'open' ? 'Held while the appeal is open' : inc.verdict === 'cleared' ? 'Not held' : `Appeal window until ${day(inc.appealClosesAt)}`;
  const flags = inc.analysis?.flags ?? [];
  return (
    <PrcFrame page="Integrity queue">
      <ObjectHeader
        name={inc.candidate.name}
        secondary={`${inc.test.title} · submitted ${when(inc.submittedAt)}`}
        status={
          <span className="yx-prc-row">
            <Badge tone={LEVEL[inc.level].tone}>{LEVEL[inc.level].label}</Badge>
            <Badge tone={inc.status === 'decided' ? 'neutral' : 'warning'}>{inc.status === 'decided' && inc.verdict ? VERDICT_LABEL[inc.verdict] : STATUS[inc.status]}</Badge>
          </span>
        }
        facts={[
          { label: 'Reviewer', value: inc.reviewer?.name ?? 'Not taken' },
          { label: 'Result', value: holdNote },
          { label: 'Evidence', value: inc.status === 'decided' && !inc.appeal ? 'Kept while it can be appealed' : 'Kept on legal hold' },
        ]}
        actions={
          <span className="yx-prc-row">
            <Button onClick={live.onBack}>Back to the queue</Button>
            {inc.status !== 'decided' && inc.reviewer?.id !== live.me && (
              <Button variant="primary" loading={busy === 'take'} onClick={() => run('take', live.onTake)}>
                Take this review
              </Button>
            )}
          </span>
        }
      />
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      <div className="yx-prc-split" data-wide-aside>
        <div className="yx-prc-stack">
          <Card title="What the analysis found">
            {flags.length ? (
              <ul className="yx-prc-plain">
                {flags.map((f, i) => (
                  <li key={`${f.type}-${i}`}>
                    <span className="yx-prc-stack" data-gap="sm">
                      <strong>{flagLabel(f.type)}</strong>
                      <span className="yx-prc-small">{f.detail}</span>
                    </span>
                    <Badge tone={f.severity === 'high' ? 'danger' : 'warning'}>{f.severity === 'high' ? 'High' : 'Medium'}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="yx-prc-muted">No flags recorded: a reviewer opened this incident.</p>
            )}
            {inc.analysis?.narrative && <p className="yx-prc-p">{inc.analysis.narrative}</p>}
          </Card>
          {inc.frames && (
            <Card title="Evidence frames">
              {inc.frames.length ? (
                <div className="yx-prc-grid4">
                  {inc.frames.map((f) => (
                    <div key={`${f.eventId}-${f.kind}`} className="yx-prc-stack">
                      <EvidenceFrame at={new Date(f.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })} source={f.kind} label={f.what} flagged={f.flagged} />
                      {live.onFrame && (
                        <Button size="sm" onClick={() => void live.onFrame!(f.eventId, f.kind)} aria-label={`View the ${f.kind} frame: ${f.what}`}>
                          View
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="yx-prc-muted">No camera or screen frames were kept for this attempt.</p>
              )}
              <p className="yx-prc-muted yx-prc-small">Your views are audited.</p>
            </Card>
          )}
          <Card title="Session events">
            {inc.events.length ? (
              <Timeline aria-label="Session events" items={inc.events.map((e) => ({ id: e.id, actor: { name: SYSTEM_ACTOR }, action: `${e.type.replace(/_/g, ' ')} (${e.severity})`, at: new Date(e.at) }))} />
            ) : (
              <p className="yx-prc-muted">No browser or camera events were recorded.</p>
            )}
          </Card>
        </div>
        <aside className="yx-prc-stack">
          {inc.status === 'open' ? (
            <DecisionCard key={inc.id} live={live} inc={inc} />
          ) : inc.status === 'second_review' ? (
            <SecondReviewCard key={inc.id} live={live} inc={inc} />
          ) : (
            <Card title="Verdict">
              <DescriptionList
                items={[
                  { label: 'Verdict', value: `${VERDICT_LABEL[inc.verdict!]}${inc.sectionTitle ? ` (${inc.sectionTitle})` : ''}` },
                  { label: 'Reason', value: inc.reason ?? '—' },
                  { label: 'Reviewer', value: `${inc.decidedBy?.name ?? '—'}, ${when(inc.decidedAt)}` },
                  ...(inc.confirmedBy ? [{ label: 'Second reviewer', value: `${inc.confirmedBy.name ?? '—'}, ${when(inc.confirmedAt)}` }] : []),
                  ...(inc.appealClosesAt ? [{ label: 'Appeal window', value: `Until ${day(inc.appealClosesAt)}` }] : []),
                ]}
              />
            </Card>
          )}
          {inc.appeal && (
            <Card title="Appeal">
              <DescriptionList
                items={[
                  { label: 'Received', value: when(inc.appeal.createdAt) },
                  { label: "Candidate's words", value: inc.appeal.text },
                  { label: 'Status', value: inc.appeal.status === 'open' ? 'Open: decided on the Appeals page' : inc.appeal.status === 'upheld' ? 'Upheld' : 'Overturned' },
                  ...(inc.appeal.reason ? [{ label: 'Decision reason', value: `${inc.appeal.reason} (${inc.appeal.decidedBy ?? '—'})` }] : []),
                ]}
              />
            </Card>
          )}
        </aside>
      </div>
    </PrcFrame>
  );
}

/* ---------------- PRC-18 · appeals ---------------- */

export interface LiveAppealRow {
  id: string;
  candidate: string;
  test: string;
  verdict: Verdict | null;
  sectionTitle: string | null;
  verdictReason: string | null;
  verdictBy: (string | null)[];
  /** The people who gave the verdict: they may not decide the appeal. */
  excluded: string[];
  text: string;
  /** Answer 2264: the name of the file sent with the appeal, if any. */
  evidenceName?: string | null;
  status: 'open' | 'upheld' | 'overturned';
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}
export interface LiveAppeals {
  state: Load;
  onRetry: () => void;
  rows: LiveAppealRow[];
  me: string;
  onUphold: (id: string, reason: string) => Promise<unknown>;
  /** Asks for the second factor first (the page). */
  onOverturn: (id: string, reason: string) => Promise<unknown>;
  /** Opens the appeal's file (an audited short-lived link). */
  onEvidence?: (id: string) => Promise<unknown>;
}

const APPEAL_COLS: TableColumn<LiveAppealRow>[] = [
  { key: 'candidate', header: 'Candidate', value: (r) => r.candidate, width: 170 },
  { key: 'test', header: 'Test', value: (r) => r.test, width: 200 },
  { key: 'verdict', header: 'Original decision', value: (r) => (r.verdict ? `${VERDICT_LABEL[r.verdict]}${r.sectionTitle ? ` (${r.sectionTitle})` : ''}` : '—'), width: 200 },
  { key: 'createdAt', header: 'Received', value: (r) => day(r.createdAt), width: 120 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => (r.status === 'open' ? 'Open' : r.status === 'upheld' ? 'Upheld' : 'Overturned'), statusTone: (v) => (v === 'Overturned' ? 'success' : v === 'Upheld' ? 'neutral' : 'warning'), width: 120 },
];

function AppealDecision({ live, a }: { live: LiveAppeals; a: LiveAppealRow }) {
  const [dec, setDec] = useState<string | undefined>();
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useAct();
  if (a.excluded.includes(live.me))
    return <InlineAlert tone="info">You gave this verdict, so someone else decides the appeal.</InlineAlert>;
  return (
    <>
      {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
      <RadioGroup aria-label="Decision" value={dec} onChange={setDec} options={[{ value: 'uphold', label: 'Uphold the original decision' }, { value: 'overturn', label: 'Overturn it', description: 'Asks for your second factor.' }]} />
      <FormField label="Reason sent to the candidate" required error={tried && reason.trim().length < REASON_MIN ? `Enter a reason of at least ${REASON_MIN} characters.` : undefined}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={2000} />
      </FormField>
      <Button
        variant="primary"
        disabled={!dec}
        icon={Scale}
        loading={busy === 'save'}
        onClick={() => {
          setTried(true);
          if (reason.trim().length < REASON_MIN || !dec) return;
          run('save', () => (dec === 'overturn' ? live.onOverturn(a.id, reason) : live.onUphold(a.id, reason)));
        }}
      >
        Save decision
      </Button>
    </>
  );
}

export function LiveAppealsScreen({ live }: { live: LiveAppeals }) {
  const [sel, setSel] = useState<string | null>(null);
  const a = live.rows.find((x) => x.id === (sel ?? live.rows.find((r) => r.status === 'open')?.id ?? live.rows[0]?.id));
  return (
    <PrcFrame page="Appeals">
      <PageHeader title="Appeals" description="Decided by someone who did not give the original verdict. The candidate's result is held while an appeal is open; the decision is final and shown to the candidate." />
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load appeals." onRetry={live.onRetry} />
      ) : (
        <div className="yx-prc-split" data-wide-aside>
          <DataTable
            label="Appeals"
            columns={APPEAL_COLS}
            rows={live.rows}
            getRowId={(r) => r.id}
            state={live.state === 'loading' ? 'loading' : 'ready'}
            empty={<EmptyState title="No appeals." description="Candidates can appeal an integrity decision within the company's appeal window." />}
            onRowClick={(r) => setSel(r.id)}
            activeRowId={a?.id}
          />
          {a && live.state === 'ready' && (
            <section className="yx-prc-box" aria-label={`Appeal from ${a.candidate}`}>
              <h2 className="yx-prc-h">{a.candidate}</h2>
              <DescriptionList
                items={[
                  { label: 'Original decision', value: a.verdict ? `${VERDICT_LABEL[a.verdict]}${a.sectionTitle ? ` (${a.sectionTitle})` : ''}` : '—' },
                  { label: 'Reason given', value: a.verdictReason ?? '—' },
                  { label: 'Given by', value: `${a.verdictBy.filter(Boolean).join(' and ') || '—'} (excluded from this appeal)` },
                  { label: 'Received', value: when(a.createdAt) },
                ]}
              />
              <Card title="Candidate's statement">
                <p className="yx-prc-p">{a.text}</p>
                {a.evidenceName && (
                  <div className="yx-prc-row">
                    <span className="yx-prc-muted yx-prc-small">{`1 file: ${a.evidenceName}`}</span>
                    {live.onEvidence && (
                      <Button size="sm" onClick={() => void live.onEvidence!(a.id)}>
                        View
                      </Button>
                    )}
                  </div>
                )}
              </Card>
              {a.status === 'open' ? (
                <AppealDecision key={a.id} live={live} a={a} />
              ) : (
                <InlineAlert tone={a.status === 'overturned' ? 'success' : 'info'} title={a.status === 'overturned' ? 'Overturned' : 'Upheld'}>
                  {`${a.reason ?? ''} (${a.decidedBy ?? '—'}, ${when(a.decidedAt)})`}
                </InlineAlert>
              )}
            </section>
          )}
        </div>
      )}
    </PrcFrame>
  );
}

/* ---------------- PRC-20 · integrity reports ---------------- */

export interface LiveIntegrityReportData {
  test: { id: string; title: string };
  attempts: number;
  minSame: number;
  clusters: { id: string; who: string[]; same: number; timing: string; incident: string }[];
  sizes: { size: '2' | '3' | '4' | '5+'; clusters: number }[];
  pairs: { pair: string; question: string; similarity: number }[];
  agreement: { weeks: { week: string; kappa: number }[]; target: number; markers: { pair: string; moderated: number; of: number }[]; doubleMarked: number };
}
export interface LiveIntegrityReports {
  state: Load;
  onRetry: () => void;
  tests: { id: string; title: string }[];
  onTest: (id: string) => void;
  data: LiveIntegrityReportData | null;
  /** The three reports as a workbook (the API records who exported it). */
  onExport: () => Promise<unknown>;
}

/** AS-5 part 3 (PRC-20): a real test's collusion clusters, code similarity pairs and marker agreement. */
export function LiveIntegrityReportsScreen({ live }: { live: LiveIntegrityReports }) {
  const { busy, error, run } = useAct();
  const d = live.data;
  const loading = live.state === 'loading';
  return (
    <PrcFrame page="Integrity reports">
      <PageHeader
        title="Integrity reports"
        description={`${d?.test.title ?? 'Test'} · ${d ? `${d.attempts} submitted ${d.attempts === 1 ? 'attempt' : 'attempts'}` : ''} · flags point reviewers at attempts; they never change a score`}
        actions={
          <>
            {live.tests.length > 1 && <Select aria-label="Test" size="sm" value={d?.test.id ?? null} onChange={(v) => v && live.onTest(v)} options={live.tests.map((t) => ({ value: t.id, label: t.title }))} />}
            <Button icon={Download} loading={busy === 'export'} disabled={!d} onClick={() => void run('export', live.onExport)}>
              Export XLSX
            </Button>
          </>
        }
      />
      {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
      {live.state === 'error' ? (
        <ErrorState title="We couldn't load the reports." onRetry={live.onRetry} />
      ) : !d && !loading ? (
        <EmptyState title="No test to report on yet." description="Reports appear once a test has submitted attempts." />
      ) : (
        <Tabs defaultValue="collusion">
          <TabsList aria-label="Report">
            <TabsTrigger value="collusion">Collusion</TabsTrigger>
            <TabsTrigger value="plagiarism">Plagiarism and code similarity</TabsTrigger>
            <TabsTrigger value="agreement">Inter-rater agreement</TabsTrigger>
          </TabsList>
          <TabsContent value="collusion">
            {d && !d.clusters.length ? (
              <EmptyState title="No collusion clusters found." description={`Answer-pattern checks ran on ${d.attempts} submitted ${d.attempts === 1 ? 'attempt' : 'attempts'}: no two shared ${d.minSame} or more identical wrong answers.`} />
            ) : (
              <div className="yx-prc-stack">
                <BarChart title="Clusters by size" categories={['2', '3', '4', '5+']} series={[{ name: 'Clusters', values: (d?.sizes ?? []).map((s) => s.clusters) }]} loading={loading} xLabel="Candidates in cluster" />
                <DataTable
                  label="Answer-pattern clusters"
                  columns={[
                    { key: 'id', header: 'Cluster', type: 'id', value: (r: LiveIntegrityReportData['clusters'][number]) => r.id, width: 100 },
                    { key: 'who', header: 'Candidates', value: (r: LiveIntegrityReportData['clusters'][number]) => r.who.join(', '), width: 300 },
                    { key: 'same', header: 'Identical wrong answers', type: 'number', value: (r: LiveIntegrityReportData['clusters'][number]) => r.same, width: 180 },
                    { key: 'timing', header: 'Timing', value: (r: LiveIntegrityReportData['clusters'][number]) => r.timing, width: 220 },
                    { key: 'inc', header: 'Incident', value: (r: LiveIntegrityReportData['clusters'][number]) => r.incident, width: 160 },
                  ]}
                  rows={d?.clusters ?? []}
                  getRowId={(r) => r.id}
                  state={loading ? 'loading' : 'ready'}
                />
              </div>
            )}
          </TabsContent>
          <TabsContent value="plagiarism">
            {d && !d.pairs.length ? (
              <EmptyState title="No similar code found." description="Code answers are compared with other candidates' answers to the same question when each attempt is analysed." />
            ) : (
              <DataTable
                label="Code similarity pairs"
                columns={[
                  { key: 'pair', header: 'Pair', value: (r: LiveIntegrityReportData['pairs'][number]) => r.pair, width: 300 },
                  { key: 'q', header: 'Question', value: (r: LiveIntegrityReportData['pairs'][number]) => r.question, width: 260 },
                  { key: 'sim', header: 'Similarity', type: 'number', value: (r: LiveIntegrityReportData['pairs'][number]) => r.similarity, render: (r: LiveIntegrityReportData['pairs'][number]) => `${r.similarity} %`, width: 110 },
                ]}
                rows={d?.pairs ?? []}
                getRowId={(r) => `${r.pair}-${r.question}`}
                state={loading ? 'loading' : 'ready'}
              />
            )}
          </TabsContent>
          <TabsContent value="agreement">
            {d && !d.agreement.doubleMarked ? (
              <EmptyState title="No answers were marked twice yet." description="Agreement shows once a second marker marks the same answers (Settings: second marker)." />
            ) : (
              <div className="yx-prc-grid2">
                <LineChart title="Evaluator agreement (weighted kappa) by week" categories={(d?.agreement.weeks ?? []).map((w) => w.week)} series={[{ name: d?.test.title ?? 'Test', values: (d?.agreement.weeks ?? []).map((w) => w.kappa) }]} target={{ value: d?.agreement.target ?? 0.7, label: `Target ${(d?.agreement.target ?? 0.7).toFixed(2)}` }} yMin={0} loading={loading} />
                <Card title="Pairs above the disagreement threshold">
                  {d?.agreement.markers.length ? (
                    <ul className="yx-prc-plain">
                      {d.agreement.markers.map((m) => (
                        <li key={m.pair}>
                          <span>{m.pair}</span> <span>{`${m.moderated} of ${m.of} moderated`}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="yx-prc-muted">No answer needed a third marker.</p>
                  )}
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </PrcFrame>
  );
}
