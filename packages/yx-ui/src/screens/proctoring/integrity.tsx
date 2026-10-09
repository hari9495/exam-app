// Integrity review queue, incident workspace, appeals, evaluator console, integrity reports, fairness analytics
// (T05, A13). PRC-16 … PRC-20.
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Download, Pause, Play, Scale } from 'lucide-react';
import { Button, ButtonGroup } from '../../components/button';
import { Badge, AiBadge } from '../../components/display';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { TextArea } from '../../components/inputs';
import { Select } from '../../components/select';
import { RadioGroup, Switch } from '../../components/choice';
import { Kbd } from '../../components/foundations';
import { BarChart, LineChart, StatCard } from '../../components/charts';
import { Timeline } from '../../components/timeline';
import { formatClock } from '../../components/exam';
import { formatDate } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { PrcFrame, type ViewState } from './proctoring-shared';
import { CameraFrame, EvidenceFrame, FlagTimeline, IntegrityScoreCard, ScreenThumb, CodeAnswer } from './proctoring-kit';
import { impactRatios, needsModeration, verdictError, VERDICT_LABEL, type Verdict } from './proctoring-logic';
import { EVENTS_SNEHA, INCIDENTS, PEOPLE, REVIEWERS, SIGNALS_SNEHA, d, type IncidentRow } from './proctoring-data';

const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
const SEV_TONE = { High: 'danger', Medium: 'warning', Low: 'neutral' } as const;

/* ================================================================== */
/* PRC-16 · Integrity review queue (+ reviewer capacity)               */
/* ================================================================== */

const INC_FIELDS: FilterFieldDef[] = [
  { key: 'severity', label: 'Severity', type: 'multi', options: opt(['High', 'Medium', 'Low']) },
  { key: 'status', label: 'Status', type: 'multi', options: opt(['Open', 'Under review', 'Verdict given', 'Appealed', 'Closed', 'Escalated']) },
  { key: 'reviewer', label: 'Reviewer', type: 'multi', options: opt(REVIEWERS) },
  { key: 'language', label: 'Language', type: 'multi', options: opt(['English', 'Hindi', 'Tamil', 'Telugu']) },
  { key: 'due', label: 'SLA due', type: 'date' },
];

const INC_COLS: TableColumn<IncidentRow>[] = [
  { key: 'id', header: 'Incident', type: 'id', value: (r) => r.id, width: 110 },
  { key: 'candidate', header: 'Candidate', value: (r) => r.candidate, width: 180 },
  { key: 'test', header: 'Test', value: (r) => r.test, width: 220 },
  {
    key: 'types',
    header: 'Signals',
    value: (r) => r.types.join(', '),
    render: (r) => (
      <span className="yx-prc-row">
        {r.types.join(', ')} {r.types.some((t) => t.startsWith('Response time')) && <AiBadge />}
      </span>
    ),
    width: 260,
  },
  { key: 'severity', header: 'Severity', type: 'status', value: (r) => r.severity, statusTone: (v) => SEV_TONE[v as IncidentRow['severity']], width: 100 },
  { key: 'score', header: 'Integrity', type: 'number', value: (r) => r.score, width: 90 },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Escalated' ? 'danger' : v === 'Closed' || v === 'Verdict given' ? 'success' : 'warning'), groupable: true, width: 130 },
  { key: 'reviewer', header: 'Reviewer', value: (r) => r.reviewer, groupable: true, width: 160 },
  { key: 'due', header: 'SLA due', type: 'date', value: (r) => r.due, width: 110 },
];

export function IntegrityQueueScreen({ incidents, state = 'ready', tab = 'queue', reassign = false }: { incidents: IncidentRow[]; state?: ViewState; tab?: 'queue' | 'capacity'; reassign?: boolean }) {
  // PRC-16
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(reassign ? ['INC-5510'] : []);
  const rows = useMemo(() => [...incidents].sort((a, b) => a.score - b.score).filter((r) => (!q || `${r.id} ${r.candidate}`.toLowerCase().includes(q.toLowerCase())) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f))), [incidents, filters, q]);
  return (
    <PrcFrame page="Integrity queue">
      <PageHeader title="Integrity review" description="Ordered by integrity score. Signals are flags for people to review; nothing here fails a candidate by itself. Review within 3 working days." />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Integrity review">
          <TabsTrigger value="queue" count={incidents.length}>
            Queue
          </TabsTrigger>
          <TabsTrigger value="capacity">Reviewer capacity</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <div className="yx-prc-stack">
            <FilterBar fields={INC_FIELDS} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder="Search incident or candidate" />
            {reassign && (
              <InlineAlert tone="danger" title="Can't assign INC-5510 to Lakshmi Venkatesan">
                Conflict of interest: recruiter on this application. The next eligible reviewer by round-robin is Arvind Swamy.
              </InlineAlert>
            )}
            <DataTable
              label="Incidents"
              columns={INC_COLS}
              rows={state === 'empty' ? [] : rows}
              getRowId={(r) => r.id}
              state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
              errorTitle="We couldn't load incidents."
              onRetry={() => {}}
              filtered={filters.length > 0 || !!q}
              onClearFilters={() => {
                setFilters([]);
                setQ('');
              }}
              empty={<EmptyState title="Nothing to review." description="New incidents appear when attempts end with flags." />}
              selectable
              selectedIds={sel}
              onSelectedChange={setSel}
              bulkActions={(ids) => <Button size="sm">Reassign {ids.length}</Button>}
              onRowClick={() => {}}
              pageSize={20}
            />
          </div>
        </TabsContent>
        <TabsContent value="capacity">
          <div className="yx-prc-stack">
            <div className="yx-prc-grid4">
              <StatCard label="Open items" value={18} drill={{ label: 'View all', href: '#open' }} />
              <StatCard label="Overdue" value={2} drill={{ label: 'View overdue', href: '#overdue' }} />
              <StatCard label="Closed this week" value={41} previous={36} previousLabel="last week" drill={{ label: 'View closed', href: '#closed' }} />
              <StatCard label="Due in next 2 days" value={9} drill={{ label: 'View forecast', href: '#forecast' }} />
            </div>
            <DataTable
              label="Reviewers"
              columns={[
                { key: 'name', header: 'Reviewer', value: (r: { name: string }) => r.name, width: 200 },
                { key: 'open', header: 'Open (high / medium / low)', value: (r: { open: string }) => r.open, width: 200 },
                { key: 'oldest', header: 'Oldest item', value: (r: { oldest: string }) => r.oldest, width: 160 },
                { key: 'cap', header: 'Capacity used', value: (r: { used: number }) => r.used, render: (r: { used: number; cap: number; name: string }) => <Meter value={r.used} max={r.cap} label={`${r.name} capacity`} warnAt={Math.round(r.cap * 0.8)} valueText={`${r.used} of ${r.cap}`} />, width: 220 },
                { key: 'avail', header: 'Availability', type: 'status', value: (r: { avail: string }) => r.avail, statusTone: (v) => (v === 'Available' ? 'success' : 'warning'), width: 160 },
              ]}
              rows={[
                { name: 'Farah Siddiqui', open: '2 / 1 / 0', oldest: '2 days (SLA 3)', used: 3, cap: 12, avail: 'Available' },
                { name: 'Gopal Menon', open: '2 / 0 / 1', oldest: '4 days, overdue', used: 12, cap: 12, avail: 'At cap' },
                { name: 'Lakshmi Venkatesan', open: '0 / 1 / 0', oldest: '1 day', used: 1, cap: 8, avail: 'On leave from 1 Oct' },
                { name: 'Arvind Swamy', open: '0 / 0 / 0', oldest: '—', used: 0, cap: 10, avail: 'Available' },
              ]}
              getRowId={(r) => r.name}
              rowButtons={() => <Button size="sm">Pause</Button>}
            />
          </div>
        </TabsContent>
      </Tabs>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-17 · Incident workspace (flag review)                           */
/* ================================================================== */

export interface IncidentWorkspaceProps {
  incident?: IncidentRow;
  defaultVerdict?: Verdict | null;
  defaultReason?: string;
  variant?: 'review' | 'second-review' | 'identity' | 'escalated' | 'decided';
}

export function IncidentWorkspaceScreen({ incident = INCIDENTS[0], defaultVerdict = null, defaultReason = '', variant = 'review' }: IncidentWorkspaceProps) {
  // PRC-17
  const [at, setAt] = useState(1395);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [verdict, setVerdict] = useState<Verdict | null>(defaultVerdict);
  const [reason, setReason] = useState(defaultReason);
  const [second, setSecond] = useState<string | null>(null);
  const [tried, setTried] = useState(defaultVerdict === 'attempt');
  const err = verdictError(verdict, reason, second);
  const events = variant === 'identity' ? [{ id: 'i1', at: 30, type: 'identity', label: 'Face does not match the photo from the application check (0.38)', severity: 'high' as const, source: 'camera' as const }, ...EVENTS_SNEHA.slice(1, 3)] : EVENTS_SNEHA;
  return (
    <PrcFrame page="Integrity queue">
      <ObjectHeader
        name={`${incident.id} · ${incident.candidate}`}
        secondary={`${incident.test} · attempt ATT-88190 · 28 Sep 2026, 9:02 am`}
        status={
          <span className="yx-prc-row">
            <Badge tone={SEV_TONE[incident.severity]}>{incident.severity}</Badge>
            <Badge tone={variant === 'escalated' ? 'danger' : 'warning'}>{variant === 'escalated' ? 'Escalated · legal hold' : variant === 'decided' ? 'Verdict given' : variant === 'second-review' ? 'Waiting for second reviewer' : 'Under review'}</Badge>
          </span>
        }
        facts={[
          { label: 'Reviewer', value: incident.reviewer },
          { label: 'SLA due', value: formatDate(incident.due) },
          { label: 'Result', value: 'Held until closed' },
          { label: 'Evidence', value: '14 items, hashes verified' },
        ]}
        actions={<Button icon={Download}>{variant === 'escalated' ? 'Sealed evidence export' : 'Session report (provisional)'}</Button>}
      />
      {variant === 'identity' && (
        <InlineAlert tone="warning" title="Identity mismatch: review, not a rejection" actions={<Button size="sm">Request re-verification</Button>}>
          The face at test start does not match the template captured at application on 12 Sep. The candidate can explain or re-verify with a fresh ID and selfie before you decide.
        </InlineAlert>
      )}
      {variant === 'escalated' && (
        <InlineAlert tone="danger" title="Court case recorded on 20 Sep (ref. OS 412/2026)">
          Legal hold on every evidence item, score and audit record of this incident. Retention sweeps and erasure requests skip them until closure. The export includes a SHA-256 manifest and the electronic-records certificate.
        </InlineAlert>
      )}
      <div className="yx-prc-split" data-wide-aside>
        <div className="yx-prc-stack">
          <div className="yx-prc-grid3">
            <CameraFrame state={at >= 1390 && at < 1420 ? 'multiple' : at >= 1510 && at < 1540 ? 'phone' : 'live'} label={`Camera ${formatClock(at)}`} />
            <ScreenThumb label="Screen" note={`Screen ${formatClock(at)} · Q 18`} />
            <CameraFrame kind="room" label={`Companion phone ${formatClock(at)}`} />
          </div>
          <div className="yx-prc-row">
            <Button icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play'} all streams
            </Button>
            <Select aria-label="Playback speed" value={speed} onChange={(v) => setSpeed(v ?? '1')} options={[{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }]} size="sm" />
            <span className="yx-prc-muted yx-prc-small">Camera, screen and phone play in sync. Select a flag to jump.</span>
          </div>
          <FlagTimeline duration={2700} events={events} current={at} onSeek={setAt} />
          <Card title="Evidence frames">
            <div className="yx-prc-grid4">
              <EvidenceFrame at="23:15" source="camera" label="More than one face" flagged />
              <EvidenceFrame at="25:20" source="camera" label="Phone detected" flagged />
              <EvidenceFrame at="20:40" source="audio" label="Second voice" />
              <EvidenceFrame at="33:30" source="camera" label="More than one face" flagged />
            </div>
            <p className="yx-prc-muted yx-prc-small">Every frame is hashed at capture. Your views are audited.</p>
          </Card>
        </div>
        <aside className="yx-prc-stack">
          <IntegrityScoreCard signals={SIGNALS_SNEHA} />
          {variant === 'decided' ? (
            <Card title="Verdict">
              <DescriptionList items={[{ label: 'Verdict', value: 'Warning noted' }, { label: 'Reason', value: 'Family member entered twice; candidate asked them to leave. Answers unaffected.' }, { label: 'Reviewer', value: `${PEOPLE.reviewer}, 29 Sep, 9:30 am` }, { label: 'Appeal window', value: 'Until 6 Oct' }]} />
            </Card>
          ) : variant === 'escalated' ? (
            <Timeline
              items={[
                { id: '1', actor: { name: PEOPLE.reviewer }, action: 'Attempt invalidated (with Gopal Menon as second reviewer)', at: d(2) },
                { id: '2', actor: { name: 'Sanjay Chatterjee' }, action: 'Appealed', at: d(4) },
                { id: '3', actor: { name: 'Arvind Swamy' }, action: 'Appeal upheld the verdict', at: d(14) },
                { id: '4', actor: { name: 'Legal team' }, action: 'Escalation recorded: court case; legal hold placed', at: d(20) },
              ]}
            />
          ) : (
            <Card title="Your decision">
              <div className="yx-prc-stack">
                {variant === 'second-review' && <InlineAlert tone="info">Farah Siddiqui proposed "Attempt invalidated". You are the second reviewer: agree, or choose another verdict.</InlineAlert>}
                <RadioGroup
                  aria-label="Verdict"
                  value={verdict ?? undefined}
                  onChange={(v) => setVerdict(v as Verdict)}
                  options={[
                    { value: 'cleared', label: `${VERDICT_LABEL.cleared} (accept the attempt)`, description: 'No integrity action; the result can be released.' },
                    { value: 'warning', label: VERDICT_LABEL.warning, description: 'Recorded; the score stands.' },
                    { value: 'section', label: VERDICT_LABEL.section, description: "That section's score is voided." },
                    { value: 'attempt', label: `${VERDICT_LABEL.attempt} (disqualify)`, description: 'Needs a second reviewer or the test owner.' },
                  ]}
                />
                {verdict === 'section' && (
                  <FormField label="Section">
                    <Select value="Java" onChange={() => {}} options={opt(['Aptitude', 'Java', 'SQL'])} />
                  </FormField>
                )}
                {verdict === 'attempt' && variant !== 'second-review' && (
                  <FormField label="Second reviewer" required helper="Excludes anyone with a conflict of interest">
                    <Select value={second} onChange={setSecond} options={opt(['Gopal Menon', 'Arvind Swamy', 'Neha Joshi (test owner)'])} placeholder="Choose reviewer" />
                  </FormField>
                )}
                <FormField label="Reason and evidence referred to" required error={tried ? (err && !err.startsWith('Choose a verdict') ? err : null) : null}>
                  <TextArea value={reason} onChange={setReason} rows={3} placeholder="E.g. frames at 23:15 and 33:30 show a second person reading the screen" />
                </FormField>
                <Button variant="primary" onClick={() => setTried(true)} disabled={!verdict}>
                  {verdict === 'attempt' && variant !== 'second-review' ? 'Send for second review' : 'Save verdict'}
                </Button>
                {tried && !err && verdict && (
                  <InlineAlert tone="success">
                    {verdict === 'attempt' && variant !== 'second-review'
                      ? `Sent to ${second} for the second review. The result stays held.`
                      : `Saved: ${VERDICT_LABEL[verdict]}. The candidate is told and can appeal until 6 Oct.`}
                  </InlineAlert>
                )}
                <p className="yx-prc-muted yx-prc-small">Signals and AI never decide. The candidate is told the outcome and can appeal within 7 days.</p>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-18 · Appeals queue                                              */
/* ================================================================== */

interface AppealRow {
  id: string;
  candidate: string;
  about: string;
  original: string;
  firstReviewer: string;
  assigned: string;
  received: Date;
  due: Date;
  status: 'New' | 'In review' | 'Upheld' | 'Overturned';
}
export const APPEALS: AppealRow[] = [
  { id: 'APL-118', candidate: 'Manoj Kumar', about: 'INC-5488 · code similarity 91 %', original: 'Section invalidated (Java)', firstReviewer: 'Farah Siddiqui', assigned: 'Arvind Swamy', received: d(26), due: d(9, 9), status: 'In review' },
  { id: 'APL-117', candidate: 'Nandini Reddy', about: 'Score: Q 22 answer key', original: 'Score 58', firstReviewer: '—', assigned: 'Gopal Menon', received: d(24), due: d(7, 9), status: 'New' },
  { id: 'APL-110', candidate: 'Sanjay Chatterjee', about: 'INC-5470 · identity mismatch', original: 'Attempt invalidated', firstReviewer: 'Farah Siddiqui', assigned: 'Arvind Swamy', received: d(4), due: d(18), status: 'Upheld' },
];

export function AppealsScreen({ appeals, state = 'ready', decided }: { appeals: AppealRow[]; state?: ViewState; decided?: 'upheld' | 'overturned' }) {
  // PRC-18
  const [sel, setSel] = useState('APL-118');
  const [dec, setDec] = useState<string | undefined>(decided === 'overturned' ? 'overturn' : decided === 'upheld' ? 'uphold' : undefined);
  const a = appeals.find((x) => x.id === sel);
  return (
    <PrcFrame page="Appeals">
      <PageHeader title="Appeals" description="Decided by a reviewer who did not make the original decision, within 10 working days. The decision is final and sent to the candidate." />
      <div className="yx-prc-split" data-wide-aside>
        <DataTable
          label="Appeals"
          columns={[
            { key: 'id', header: 'Appeal', type: 'id', value: (r: AppealRow) => r.id, width: 100 },
            { key: 'candidate', header: 'Candidate', value: (r: AppealRow) => r.candidate, width: 170 },
            { key: 'about', header: 'About', value: (r: AppealRow) => r.about, width: 250 },
            { key: 'assigned', header: 'Reviewer', value: (r: AppealRow) => r.assigned, width: 150 },
            { key: 'due', header: 'Due', type: 'date', value: (r: AppealRow) => r.due, width: 110 },
            { key: 'status', header: 'Status', type: 'status', value: (r: AppealRow) => r.status, statusTone: (v) => (v === 'Overturned' ? 'success' : v === 'Upheld' ? 'neutral' : 'warning'), width: 120 },
          ]}
          rows={state === 'empty' ? [] : appeals}
          getRowId={(r) => r.id}
          state={state === 'loading' ? 'loading' : 'ready'}
          empty={<EmptyState title="No appeals." description="Candidates can appeal a verdict or score within 7 days of seeing it." />}
          onRowClick={(r) => setSel(r.id)}
          activeRowId={sel}
        />
        {a && state === 'ready' && (
          <section className="yx-prc-box" aria-label={`Appeal ${a.id}`}>
            <h2 className="yx-prc-h">
              {a.id} · {a.candidate}
            </h2>
            <DescriptionList items={[{ label: 'Original decision', value: a.original }, { label: 'First reviewer', value: `${a.firstReviewer} (excluded from this appeal)` }, { label: 'Received', value: formatDate(a.received) }]} />
            <Card title="Candidate's statement">
              <p className="yx-prc-p">"I wrote this solution in my college lab project last year and the same classmate was in my drive. I have attached my git history from March."</p>
              <p className="yx-prc-muted yx-prc-small">1 attachment: git-log-march.pdf</p>
            </Card>
            <p className="yx-prc-muted yx-prc-small">The candidate was shown an evidence summary (timestamps, flag types, key frames), not full recordings.</p>
            {decided ? (
              <InlineAlert tone={decided === 'overturned' ? 'success' : 'info'}>{decided === 'overturned' ? 'Overturned. The Java section is restored, the result is released, and a new session report replaces the old one.' : 'Upheld. The candidate has been told the reason. This decision is final.'}</InlineAlert>
            ) : (
              <>
                <RadioGroup aria-label="Decision" value={dec} onChange={setDec} options={[{ value: 'uphold', label: 'Uphold the original decision' }, { value: 'overturn', label: 'Overturn it' }]} />
                <FormField label="Reason sent to the candidate" required>
                  <TextArea rows={3} />
                </FormField>
                <Button variant="primary" disabled={!dec} icon={Scale}>
                  Save decision
                </Button>
              </>
            )}
          </section>
        )}
      </div>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-19 · Evaluator console                                          */
/* ================================================================== */

const RUBRIC = [
  { id: 'c1', name: 'Identifies root cause', levels: ['Not shown', 'Names a cause', 'Uses a method (5 Whys, fishbone)', 'Method + evidence from the line'] },
  { id: 'c2', name: 'Corrective actions', levels: ['None', 'Generic', 'Specific to the line', 'Specific with owner and date'] },
  { id: 'c3', name: 'Food-safety controls', levels: ['Missing', 'Mentions HACCP', 'Links to a CCP', 'Links to CCP with monitoring'] },
];

export interface EvaluatorConsoleProps {
  blind?: boolean;
  kind?: 'descriptive' | 'code' | 'ai-allowed';
  defaultScores?: Record<string, number>;
  otherScore?: number | null;
  minor?: boolean;
}

export function EvaluatorConsoleScreen({ blind = true, kind = 'descriptive', defaultScores = {}, otherScore = null, minor = false }: EvaluatorConsoleProps) {
  // PRC-19
  const [scores, setScores] = useState<Record<string, number>>(defaultScores);
  const [focus, setFocus] = useState(0);
  const [blindOn, setBlind] = useState(blind);
  const total = Object.values(scores).reduce((n, v) => n + v, 0);
  const done = RUBRIC.every((c) => scores[c.id] != null);
  const max = RUBRIC.length * 3;
  const moderation = done && otherScore != null && needsModeration(total, otherScore);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      setScores({ ...scores, [RUBRIC[focus].id]: n - 1 });
      setFocus(Math.min(RUBRIC.length - 1, focus + 1));
    } else if (e.key === 'ArrowDown') setFocus(Math.min(RUBRIC.length - 1, focus + 1));
    else if (e.key === 'ArrowUp') setFocus(Math.max(0, focus - 1));
  };
  return (
    <PrcFrame page="Evaluation">
      <PageHeader
        title="Response 14 of 32"
        description={`Quality supervisor certification · Q-1060 · ${blindOn ? 'Candidate hidden (blind mode)' : 'Revathi Murthy'}`}
        facts={<span className="yx-prc-small yx-prc-muted">Keys: <Kbd>1</Kbd>–<Kbd>4</Kbd> score the highlighted criterion · <Kbd>↑</Kbd> <Kbd>↓</Kbd> move · <Kbd>Enter</Kbd> next response</span>}
        actions={
          <>
            <Switch label="Blind mode" checked={blindOn} onChange={setBlind} />
            <Button>Skip</Button>
            <Button variant="primary" disabled={!done}>
              Save and next
            </Button>
          </>
        }
      />
      <div className="yx-prc-split" data-wide-aside>
        <section className="yx-prc-stack" aria-label="Response">
          {kind === 'descriptive' && (
            <Card title="Answer · 312 words">
              <p className="yx-prc-p">
                First I would pull the deviation log for the last four weeks and group deviations by station. On line 3 most deviations are seal-temperature drops after the 2 pm changeover. Using 5 Whys, the cause is that the heater warm-up is skipped when the shift changes. I would add a warm-up check to the changeover checklist, owned by the shift lead, starting next Monday, and record the seal temperature at the CCP every 30 minutes…
              </p>
            </Card>
          )}
          {kind === 'code' && <CodeAnswer language="Java 17" value={'public List<String> topK(List<String> words, int k) {\n  Map<String, Long> c = words.stream().collect(groupingBy(w -> w, counting()));\n  return c.entrySet().stream().sorted(byCount).limit(k).map(Map.Entry::getKey).toList();\n}'} onChange={() => {}} runs={7} results={[{ name: 'Visible tests', status: 'pass', detail: '3 of 3' }, { name: 'Hidden tests', status: 'fail', detail: '5 of 6 passed' }]} />}
          {kind === 'ai-allowed' && (
            <>
              <InlineAlert tone="info">AI-allowed test. Using the approved assistant is not an integrity issue here. Score prompting and checking from the log.</InlineAlert>
              <Card title="Assistant log for this question · 4 turns">
                <ul className="yx-prc-plain">
                  <li>
                    <span>
                      <strong>Candidate:</strong> List common causes of seal failures on pouch lines.
                    </span>
                  </li>
                  <li>
                    <span>
                      <strong>Assistant:</strong> Low jaw temperature, dwell time too short, contamination in the seal area…
                    </span>
                  </li>
                  <li>
                    <span>
                      <strong>Candidate:</strong> Our log shows drops only after 2 pm. Which of these fits a time pattern?
                    </span>
                  </li>
                  <li>
                    <span>
                      <strong>Assistant:</strong> A changeover-related warm-up gap fits a time pattern best.
                    </span>
                  </li>
                </ul>
              </Card>
            </>
          )}
        </section>
        <aside className="yx-prc-stack" onKeyDown={onKey} tabIndex={0} aria-label="Rubric: use keys 1 to 4 to score">
          {RUBRIC.map((c, i) => (
            <fieldset key={c.id} className="yx-prc-box" data-selected={i === focus || undefined} onFocus={() => setFocus(i)}>
              <legend className="yx-prc-h">
                {c.name} {scores[c.id] != null && <Badge tone="info">{scores[c.id]} / 3</Badge>}
              </legend>
              <ButtonGroup aria-label={`${c.name} level`}>
                {c.levels.map((l, li) => (
                  <Button key={l} size="sm" aria-pressed={scores[c.id] === li} onClick={() => setScores({ ...scores, [c.id]: li })} title={l}>
                    {li + 1}
                  </Button>
                ))}
              </ButtonGroup>
              <span className="yx-prc-small yx-prc-muted">{scores[c.id] != null ? c.levels[scores[c.id]] : 'Not scored'}</span>
            </fieldset>
          ))}
          {kind === 'ai-allowed' && (
            <fieldset className="yx-prc-box">
              <legend className="yx-prc-h">Verification of AI output</legend>
              <span className="yx-prc-small">Checked the assistant's claim against the line's own log: level 3.</span>
            </fieldset>
          )}
          <div className="yx-prc-box" data-tone="subtle" aria-live="polite">
            <strong>
              Your score: {total} / {max}
            </strong>
            {minor ? (
              <span className="yx-prc-small">Under-18 test-taker: human scoring only, no AI suggestion.</span>
            ) : done ? (
              <span className="yx-prc-row yx-prc-small">
                <AiBadge /> Suggested {Math.min(max, total + 1)} / {max} from the text only. Advisory; your score counts.
              </span>
            ) : (
              <span className="yx-prc-small yx-prc-muted">The AI suggestion shows after you enter your own score.</span>
            )}
          </div>
          {moderation && <InlineAlert tone="warning" title="Scores differ by more than 3">The other blind evaluator gave {otherScore}. A third evaluator will moderate; neither of you sees the other's comments.</InlineAlert>}
        </aside>
      </div>
    </PrcFrame>
  );
}

/* ================================================================== */
/* PRC-20 · Integrity reports                                          */
/* ================================================================== */

export function IntegrityReportsScreen({ tab = 'collusion', state = 'ready' }: { tab?: 'collusion' | 'plagiarism' | 'agreement'; state?: 'ready' | 'loading' | 'empty' }) {
  // PRC-20
  const loading = state === 'loading';
  return (
    <PrcFrame page="Integrity reports">
      <PageHeader
        title="Integrity reports"
        description="Campus aptitude 2026 · 1 Sep – 29 Sep 2026 · all flags, never score changes by themselves"
        actions={
          <>
            <Select aria-label="Test" value="T-22" onChange={() => {}} options={[{ value: 'T-22', label: 'Campus aptitude 2026' }, { value: 'T-21', label: 'Java Backend Developer · L2' }]} size="sm" />
            <Button icon={Download}>Export XLSX</Button>
          </>
        }
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Report">
          <TabsTrigger value="collusion">Collusion</TabsTrigger>
          <TabsTrigger value="plagiarism">Plagiarism and code similarity</TabsTrigger>
          <TabsTrigger value="agreement">Inter-rater agreement</TabsTrigger>
        </TabsList>
        <TabsContent value="collusion">
          {state === 'empty' ? (
            <EmptyState title="No collusion clusters found." description="Answer-pattern and timing checks ran on 5,310 attempts." />
          ) : (
            <div className="yx-prc-stack">
              <BarChart title="Clusters by size" categories={['2', '3', '4', '5+']} series={[{ name: 'Clusters', values: [14, 5, 2, 1] }]} loading={loading} xLabel="Candidates in cluster" />
              <DataTable
                label="Answer-pattern clusters"
                columns={[
                  { key: 'id', header: 'Cluster', type: 'id', value: (r: { id: string }) => r.id, width: 100 },
                  { key: 'who', header: 'Candidates', value: (r: { who: string }) => r.who, width: 300 },
                  { key: 'same', header: 'Identical wrong answers', type: 'number', value: (r: { same: number }) => r.same, width: 180 },
                  { key: 'timing', header: 'Timing', value: (r: { timing: string }) => r.timing, width: 220 },
                  { key: 'inc', header: 'Incident', value: (r: { inc: string }) => r.inc, width: 120 },
                ]}
                rows={[
                  { id: 'CL-09', who: 'Rahul Deshpande, Harish Gowda, Tarun Joshi, Faisal Ahmed, Manoj Kumar', same: 11, timing: 'Same centre, answers within 20 s', inc: 'INC-5510' },
                  { id: 'CL-12', who: 'Keerthi Varma, Nandini Reddy', same: 6, timing: 'Different slots', inc: 'Not raised' },
                ]}
                getRowId={(r) => r.id}
                state={loading ? 'loading' : 'ready'}
              />
            </div>
          )}
        </TabsContent>
        <TabsContent value="plagiarism">
          <DataTable
            label="Code similarity pairs"
            columns={[
              { key: 'pair', header: 'Pair', value: (r: { pair: string }) => r.pair, width: 300 },
              { key: 'q', header: 'Question', value: (r: { q: string }) => r.q, width: 120 },
              { key: 'sim', header: 'Similarity', type: 'number', value: (r: { sim: number }) => r.sim, render: (r: { sim: number }) => `${r.sim} %`, width: 110 },
              { key: 'src', header: 'Web match (partner add-on)', value: (r: { src: string }) => r.src, width: 220 },
            ]}
            rows={[
              { pair: 'Manoj Kumar · Sanjay Chatterjee', q: 'Q-1043', sim: 91, src: 'None' },
              { pair: 'Imran Qureshi · Aishwarya Srinivasan', q: 'Q-1043', sim: 78, src: 'Public forum answer, 64 %' },
            ]}
            getRowId={(r) => r.pair}
          />
        </TabsContent>
        <TabsContent value="agreement">
          <div className="yx-prc-grid2">
            <LineChart title="Evaluator agreement (weighted kappa) by week" categories={['W36', 'W37', 'W38', 'W39']} series={[{ name: 'Quality supervisor certification', values: [0.61, 0.66, 0.72, 0.74] }]} target={{ value: 0.7, label: 'Target 0.70' }} yMin={0} loading={loading} />
            <Card title="Pairs above the disagreement threshold">
              <ul className="yx-prc-plain">
                <li>
                  <span>Arvind Swamy · Farah Siddiqui</span> <span>3 of 22 responses moderated</span>
                </li>
                <li>
                  <span>Gopal Menon · Arvind Swamy</span> <span>1 of 18 moderated</span>
                </li>
              </ul>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </PrcFrame>
  );
}

/* ================================================================== */
/* Fairness analytics (A13)                                            */
/* ================================================================== */

const GROUPS = [
  { group: 'Men', passed: 612, total: 1180 },
  { group: 'Women', passed: 388, total: 1210 },
  { group: 'Non-binary', passed: 2, total: 3 },
  { group: 'Prefer not to say', passed: 71, total: 140 },
];

export function FairnessScreen({ finding = true, validitySuppressed = false }: { finding?: boolean; validitySuppressed?: boolean }) {
  const groups = finding ? GROUPS : GROUPS.map((g) => (g.group === 'Women' ? { ...g, passed: 580 } : g));
  const rows = impactRatios(groups);
  return (
    <PrcFrame page="Fairness">
      <PageHeader title="Fairness and validity" description="Campus aptitude 2026 · self-declared group data, used only in aggregate · groups under 5 are hidden" actions={<Button icon={Download}>Bias-audit export</Button>} />
      {finding && (
        <InlineAlert tone="danger" title="Finding: pass rate for women is 62 % of the rate for men (p < 0.01)" actions={<Button size="sm">Open review task</Button>}>
          Response set for this test: alert and required review. The test stays live; attempts in progress are never interrupted. Decide: keep with justification, revise, or retire.
        </InlineAlert>
      )}
      <Card title="Adverse impact (4/5ths rule)">
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
        <table className="yx-prc-table">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Attempts</th>
              <th scope="col">Pass rate</th>
              <th scope="col">Impact ratio</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.group}>
                <th scope="row">{r.group}</th>
                <td data-num>{r.status === 'suppressed' ? 'Under 5' : r.total.toLocaleString('en-IN')}</td>
                <td data-num>{r.rate == null ? 'Hidden' : `${Math.round(r.rate * 100)} %`}</td>
                <td data-num>{r.ratio == null ? 'Hidden' : r.ratio.toFixed(2)}</td>
                <td>
                  <Badge tone={r.status === 'flagged' ? 'danger' : r.status === 'watch' ? 'warning' : r.status === 'ok' ? 'success' : 'neutral'}>{r.status === 'flagged' ? 'Below 0.80' : r.status === 'watch' ? 'Watch' : r.status === 'ok' ? 'OK' : 'Suppressed'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      <div className="yx-prc-grid2">
        <Card title="Item bias (DIF)">
          <ul className="yx-prc-plain">
            <li>
              <span>Q-1062 · HACCP ordering</span> <Badge tone="danger">Grade C · large</Badge>
            </li>
            <li>
              <span>Q-1051 · speed and distance</span> <Badge tone="warning">Grade B · moderate</Badge>
            </li>
            <li>
              <span>38 other items</span> <Badge tone="success">Grade A · negligible</Badge>
            </li>
          </ul>
        </Card>
        {validitySuppressed ? (
          <Card title="Predictive validity">
            <EmptyState compact title="Not enough hires yet." description="12 hires in this job family; results show from 30 so no individual can be identified." />
          </Card>
        ) : (
          <BarChart title="Predictive validity: score band vs first rating" description="Hires from Java Backend Developer · L2, n = 64, r = 0.41 (95 % CI 0.19–0.59)" categories={['Below', 'Meets', 'Strong']} series={[{ name: 'Rated "exceeds" at 6 months (%)', values: [12, 28, 47] }]} />
        )}
      </div>
    </PrcFrame>
  );
}
