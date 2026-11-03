// Performance reviews: cycle set-up + control room (PRF-04), review workspace (PRF-05) with "Help me draft" and bias
// flags (PRF-17), acknowledgement (PRF-06), 360° nominations (PRF-07), dispute escalation + evidence export (PRF-15).
import { useMemo, useState } from 'react';
import { Bell, CalendarPlus, Check, Download, FileLock2, Lock, Plus, Send, Trash2 } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { AiBadge, Badge, PersonLabel } from '../../components/display';
import { Icon, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { useAct } from './perf-live';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { useToast } from '../../components/notify';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { MultiSelect, PersonPicker, Select, type PersonOption } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Stepper } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { ApprovalTimeline, Timeline, type ApprovalStep, type TimelineItem } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import { TODAY } from '../_kit/data';
import { BiasFlagList, ConfidentialTag, PotentialChoice, GrowthFrame, RatingScale, ScoreBand, SplitLayout, StageTrack, type Device, type StageItem } from './growth-kit';
import { anonymityGroups, bandFor, detectBiasFlags, nominationCheck, RATING_LABELS, reviewScore, type BiasFlag, type Relationship, type ReviewSection } from './growth-logic';
import type { LoadState } from './perf-goals';
import { ReviewAssistantPanel, type ReviewAssistantProps } from './perf-assistant';
import { LiveCycleControlRoom, LiveCycleSetupScreen, LiveReviewAcknowledgeScreen, LiveReviewWorkspaceScreen, type LiveAcknowledge, type LiveControlRoom, type LiveCycleSetup, type LiveReviewWorkspace } from './perf-reviews-live';
import { useRun } from '../org/org-kit';
import './growth.css';

/* ================================================================== PRF-04 · Cycle set-up (T5) + control room (T6) */

export interface CycleSetupProps {
  defaultStep?: string;
  population: { eligible: number; excludedCutoff: number; prorated: number; protectedLeave: number; leavers: number };
}

const STAGE_DEFAULTS = [
  { id: 'self', label: 'Self review', owner: 'Employee', days: 10, on: true, optional: false },
  { id: '360', label: '360° feedback', owner: 'Nominated reviewers', days: 7, on: true, optional: true },
  { id: 'mgr', label: 'Manager review', owner: 'Manager', days: 10, on: true, optional: false },
  { id: 'skip', label: 'Skip-level review', owner: 'Manager’s manager', days: 5, on: true, optional: true },
  { id: 'cal', label: 'Calibration', owner: 'HR', days: 10, on: true, optional: true },
  { id: 'rel', label: 'Release', owner: 'HR', days: 3, on: true, optional: false },
  { id: 'ack', label: 'Employee acknowledgement', owner: 'Employee', days: 7, on: true, optional: false },
];

/** PRF-04 cycle set-up wizard: basics, population and eligibility (J11), template and scale, stages and deadlines. */
export function CycleSetupScreen(props: CycleSetupProps | { live: LiveCycleSetup; defaultStep?: string }) {
  return 'live' in props ? <LiveCycleSetupScreen live={props.live} defaultStep={props.defaultStep} /> : <SampleCycleSetup {...props} />;
}

function SampleCycleSetup({ defaultStep = 'basics', population }: CycleSetupProps) {
  const [name, setName] = useState('Half-yearly review H2 FY 2026-27');
  const [type, setType] = useState<string | null>('half');
  const [start, setStart] = useState<Date | null>(new Date(2026, 9, 1));
  const [end, setEnd] = useState<Date | null>(new Date(2027, 2, 31));
  const [cutoff, setCutoff] = useState<number | null>(3);
  const [weights, setWeights] = useState({ goals: 60, comp: 30, values: 10 });
  const [halfPoints, setHalfPoints] = useState(false);
  const [stages, setStages] = useState(STAGE_DEFAULTS);
  const [min360, setMin360] = useState<number | null>(3);
  const [max360, setMax360] = useState<number | null>(6);
  const total = weights.goals + weights.comp + weights.values;
  const weightError = total !== 100 ? `Section weights add up to ${total}%. Make them 100% to save the template.` : null;
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
      <PageHeader title="New review cycle" description="Cycles may overlap when their types differ, e.g. a probation review during the half-yearly cycle." />
      <Stepper
        title="New review cycle"
        defaultCurrent={defaultStep}
        onSaveAndExit={() => {}}
        onContinue={(id) => (id === 'template' ? !weightError : true)}
        review={{ title: 'Review and launch', description: 'The rating scale is frozen once the cycle launches.' }}
        finishLabel="Launch cycle"
        steps={[
          {
            id: 'basics',
            title: 'Basics',
            description: 'Name, type and period',
            content: (
              <div className="yx-growth-stack">
                <FormField label="Cycle name" required>
                  <TextField value={name} onChange={setName} />
                </FormField>
                <FormField label="Type" required>
                  <Select value={type} onChange={setType} options={[{ value: 'annual', label: 'Annual' }, { value: 'half', label: 'Half-yearly' }, { value: 'quarter', label: 'Quarterly (OKR)' }, { value: 'project', label: 'Project' }, { value: 'probation', label: 'Probation' }]} />
                </FormField>
                <FieldRow>
                  <FormField label="Period starts" required>
                    <DatePicker value={start} onChange={setStart} />
                  </FormField>
                  <FormField label="Period ends" required>
                    <DatePicker value={end} onChange={setEnd} />
                  </FormField>
                </FieldRow>
              </div>
            ),
            summary: <DescriptionList items={[{ label: 'Name', value: name }, { label: 'Period', value: `${formatDate(start)} – ${formatDate(end)}` }]} />,
          },
          {
            id: 'population',
            title: 'Population and eligibility',
            description: 'Who is reviewed',
            content: (
              <div className="yx-growth-stack">
                <FormField label="Include">
                  <MultiSelect value={['kf-ka', 'kf-tn']} onChange={() => {}} options={[{ value: 'kf-ka', label: 'Kaveri Foods Pvt Ltd' }, { value: 'kf-tn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }]} />
                </FormField>
                <FormField label="Joining cut-off" helper="People who join within this many months of the period end are not reviewed in this cycle (probation review instead).">
                  <NumberField value={cutoff} onChange={setCutoff} suffix="months" min={0} max={6} />
                </FormField>
                <FormField label="Mid-cycle joiners">
                  <RadioGroup aria-label="Mid-cycle joiners" defaultValue="months" options={[{ value: 'months', label: 'Goals for months served; increment prorated' }, { value: 'full', label: 'Full cycle, no proration' }]} />
                </FormField>
                <FormField label="Transfers between managers or entities">
                  <RadioGroup aria-label="Transfers" defaultValue="both" options={[{ value: 'both', label: 'Both managers give input, weighted by months' }, { value: 'current', label: 'Current manager only' }]} />
                </FormField>
                <InlineAlert tone="info" title="Protected leave">
                  Maternity or long leave of 3 months or more is protected: no rating is lowered for the leave, it isn’t counted in distributions, and increments aren’t prorated down.
                </InlineAlert>
                <div className="yx-growth-effect" aria-live="polite">
                  <span className="yx-growth-effect__title">Who this includes today</span>
                  <ul>
                    <li>{population.eligible} people reviewed</li>
                    <li>{population.excludedCutoff} excluded (joined after the {cutoff}-month cut-off)</li>
                    <li>{population.prorated} prorated (mid-cycle joiners)</li>
                    <li>{population.protectedLeave} on protected leave</li>
                    <li>{population.leavers} leavers closed without a rating</li>
                  </ul>
                </div>
              </div>
            ),
            summary: <Text>{population.eligible} people · cut-off {cutoff} months</Text>,
          },
          {
            id: 'template',
            title: 'Template and scale',
            description: 'Sections, weights, rating scale',
            status: weightError ? 'error' : undefined,
            statusNote: weightError ?? undefined,
            content: (
              <div className="yx-growth-stack">
                <FormField label="Template">
                  <Select value="hy" onChange={() => {}} options={[{ value: 'hy', label: 'Half-yearly review (shipped)' }, { value: 'annual', label: 'Annual review (shipped)' }]} />
                </FormField>
                <FieldRow>
                  <FormField label="Goals weight">
                    <NumberField value={weights.goals} onChange={(v) => setWeights((w) => ({ ...w, goals: v ?? 0 }))} suffix="%" />
                  </FormField>
                  <FormField label="Competencies weight">
                    <NumberField value={weights.comp} onChange={(v) => setWeights((w) => ({ ...w, comp: v ?? 0 }))} suffix="%" />
                  </FormField>
                  <FormField label="Values weight">
                    <NumberField value={weights.values} onChange={(v) => setWeights((w) => ({ ...w, values: v ?? 0 }))} suffix="%" />
                  </FormField>
                </FieldRow>
                {weightError && (
                  <InlineAlert tone="danger" title="Final-score formula is not valid">
                    {weightError}
                  </InlineAlert>
                )}
                <FormField label="Rating scale">
                  <Select value="5" onChange={() => {}} options={[{ value: '5', label: `1–5: ${RATING_LABELS.join(', ')}` }, { value: '4', label: '1–4' }, { value: '3', label: '1–3' }]} />
                </FormField>
                <Switch checked={halfPoints} onChange={setHalfPoints} label="Allow half points" description="e.g. 3.5. Applies to every section." />
              </div>
            ),
            summary: <Text>Goals {weights.goals}% · competencies {weights.comp}% · values {weights.values}% · 1–5 scale</Text>,
          },
          {
            id: 'stages',
            title: 'Stages and deadlines',
            description: 'Owner and due date per stage',
            content: (
              <div className="yx-growth-stack">
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="yx-growth-matrix">
                  <thead>
                    <tr>
                      <th scope="col">Stage</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Days</th>
                      <th scope="col">Include</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s) => (
                      <tr key={s.id}>
                        <th scope="row">{s.label}</th>
                        <td>{s.owner}</td>
                        <td className="yx-growth-num">{s.days}</td>
                        <td>{s.optional ? <Checkbox aria-label={`Include ${s.label}`} checked={s.on} onChange={(c) => setStages((xs) => xs.map((x) => (x.id === s.id ? { ...x, on: c } : x)))} /> : 'Always'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <FieldRow>
                  <FormField label="360° reviewers, minimum">
                    <NumberField value={min360} onChange={setMin360} />
                  </FormField>
                  <FormField label="360° reviewers, maximum">
                    <NumberField value={max360} onChange={setMax360} />
                  </FormField>
                </FieldRow>
                <FormField label="360° anonymity">
                  <RadioGroup aria-label="Anonymity" defaultValue="default" options={[{ value: 'default', label: 'Peers and direct reports anonymous (3+ responses), manager named' }, { value: 'named', label: 'All named' }]} />
                </FormField>
              </div>
            ),
            summary: <Text>{stages.filter((s) => s.on).map((s) => s.label).join(' → ')}</Text>,
          },
        ]}
      />
    </GrowthFrame>
  );
}

export interface CycleControlProps {
  name: string;
  funnel: { stage: string; count: number; names: string[] }[];
  overdue: { manager: string; count: number; stage: string }[];
  openStage?: string;
  state?: LoadState;
}

/** PRF-04 cycle control room: clickable funnel (YX-PERF-12) → names; overdue by owner; reminders and deadlines. */
export function CycleControlRoomScreen(props: CycleControlProps | { live: LiveControlRoom; defaultTab?: string; defaultStage?: string }) {
  return 'live' in props ? <LiveCycleControlRoom live={props.live} defaultTab={props.defaultTab} defaultStage={props.defaultStage} /> : <SampleControlRoom {...props} />;
}

function SampleControlRoom({ name, funnel, overdue, openStage, state = 'ready' }: CycleControlProps) {
  const [open, setOpen] = useState<string | null>(openStage ?? null);
  const top = funnel[0]?.count ?? 0;
  const current = funnel.find((f) => f.stage === open);
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
      <PageHeader
        title={name}
        status={<Badge tone="info">Self review</Badge>}
        facts="1 Apr – 30 Sep 2026 · 212 people · launched 15 Sep 2026"
        actions={
          <>
            <Button icon={CalendarPlus}>Extend a deadline</Button>
            <Button icon={Bell}>Send reminders</Button>
            <Button variant="primary" disabled title="Available after calibration closes on 4 Nov 2026">
              Release ratings
            </Button>
          </>
        }
      />
      {state === 'loading' ? (
        <Skeleton height={300} />
      ) : (
        <SplitLayout
          main={
            <Card title="Progress by stage">
              <Text size="sm" tone="secondary">
                Select a stage to see the names.
              </Text>
              <ol className="yx-growth-list">
                {funnel.map((f) => (
                  <li key={f.stage} className="yx-growth-list__item">
                    <span className="yx-growth-grow">
                      <Link
                        href={`#stage-${f.stage}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setOpen(f.stage);
                        }}
                      >
                        {f.stage}
                      </Link>
                    </span>
                    <span className="yx-growth-num">
                      {f.count} of {top}
                    </span>
                    <span className="yx-growth-range" aria-hidden="true">
                      <span className="yx-growth-range__band" style={{ left: 0, width: `${top ? (f.count / top) * 100 : 0}%` }} />
                    </span>
                    <span className="yx-growth-num yx-growth-meta">{top ? Math.round((f.count / top) * 100) : 0}%</span>
                  </li>
                ))}
              </ol>
            </Card>
          }
          side={
            <Card title="Overdue by owner">
              {overdue.length === 0 ? (
                <Text tone="secondary">Nothing overdue.</Text>
              ) : (
                <ul className="yx-growth-list">
                  {overdue.map((o) => (
                    <li key={o.manager} className="yx-growth-list__item">
                      <PersonLabel name={o.manager} secondary={o.stage} />
                      <Badge tone="danger">{o.count} overdue</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" icon={Bell}>
                Remind all overdue owners
              </Button>
            </Card>
          }
        />
      )}
      {current && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={current.stage} subtitle={`${current.count} people`}>
          <ul className="yx-growth-list">
            {current.names.map((n) => (
              <li key={n} className="yx-growth-list__item">
                <PersonLabel name={n} />
              </li>
            ))}
          </ul>
          {current.count > current.names.length && <Text tone="secondary">and {current.count - current.names.length} more. Export for the full list.</Text>}
        </Drawer>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-05 · Review workspace (+ PRF-17) */

export interface ReviewGoalLine {
  id: string;
  title: string;
  weight: number;
  progress: number;
  self: number | null;
  selfComment: string;
  manager: number | null;
  managerComment: string;
}

export interface ReviewData {
  employee: string;
  role: string;
  cycle: string;
  manager: string;
  stages: StageItem[];
  goals: ReviewGoalLine[];
  competencies: { id: string; name: string; required: number; self: number | null; manager: number | null }[];
  sections: ReviewSection[];
  peer: { relationship: Relationship; anonymous: boolean; author?: string; text: string }[];
  kudos: { value: string; count: number; latest: string }[];
  summary: string;
  /** The manager's proposed 9-box potential (PRF-05 → PRF-09). */
  potential?: 1 | 2 | 3;
}

export interface ReviewWorkspaceProps {
  persona: 'emp' | 'mgr';
  review: ReviewData;
  /** PRF-17 review assistant (story: sample draft and rule flags; live: the API through `assistant.live`). */
  assistant?: ReviewAssistantProps['assistant'];
  submitted?: boolean;
}

export { ReviewAssistantPanel, type LiveReviewAssistant, type ReviewAssistantProps } from './perf-assistant';

/** PRF-05 Review workspace (T3): stage stepper, section cards, advisory peer panel, score with band. PRF-17: Help me draft + bias flags. */
export function ReviewWorkspaceScreen(props: ReviewWorkspaceProps | { live: LiveReviewWorkspace }) {
  return 'live' in props ? <LiveReviewWorkspaceScreen live={props.live} /> : <SampleReviewWorkspace {...props} />;
}

function SampleReviewWorkspace({ persona, review, assistant, submitted }: ReviewWorkspaceProps) {
  const [ratings, setRatings] = useState<Record<string, number | null>>(Object.fromEntries(review.goals.map((g) => [g.id, persona === 'mgr' ? g.manager : g.self])));
  const [comp, setComp] = useState<Record<string, number | null>>(Object.fromEntries(review.competencies.map((c) => [c.id, persona === 'mgr' ? c.manager : c.self])));
  const [summary, setSummary] = useState(review.summary);
  const [overall, setOverall] = useState<number | null>(persona === 'mgr' ? 4 : null);
  const [potential, setPotential] = useState<1 | 2 | 3 | null>(review.potential ?? null);
  const goalAvg = (() => {
    const done = review.goals.filter((g) => ratings[g.id] != null);
    const w = done.reduce((a, g) => a + g.weight, 0);
    return done.length === review.goals.length && w ? done.reduce((a, g) => a + g.weight * (ratings[g.id] as number), 0) / w : null;
  })();
  const compAvg = (() => {
    const vs = review.competencies.map((c) => comp[c.id]);
    return vs.every((v) => v != null) ? (vs as number[]).reduce((a, v) => a + v, 0) / vs.length : null;
  })();
  const sections = review.sections.map((s) => (s.id === 'goals' ? { ...s, score: goalAvg } : s.id === 'comp' ? { ...s, score: compAvg } : s));
  const score = reviewScore(sections);
  const groups = anonymityGroups(review.peer);
  const locked = submitted;

  const peerPanel = (
    <Card title="Peer feedback" actions={<Badge tone="info">Advisory</Badge>}>
      <Text size="sm" tone="secondary">
        Advisory only. It is not averaged into the {persona === 'mgr' ? 'manager' : ''} rating.
      </Text>
      {persona === 'emp' ? (
        <Text tone="secondary">Your peer feedback is shared with you after ratings are released.</Text>
      ) : (
        <>
          <ul className="yx-growth-list">
            {groups.shown.map((g) => (
              <li key={g.group} className="yx-growth-list__item">
                <strong>{g.group}</strong>
                <span className="yx-growth-meta">{g.count} responses</span>
              </li>
            ))}
          </ul>
          {groups.heldBack > 0 && <InlineAlert tone="info">{groups.heldBack} anonymous responses are held back: fewer than 3 in the group, so they can’t be shown without identifying someone.</InlineAlert>}
          <ul className="yx-growth-list">
            {review.peer
              .filter((p) => !p.anonymous || groups.shown.some((g) => g.group === p.relationship))
              .map((p, i) => (
                <li key={i} className="yx-growth-list__item">
                  <div className="yx-growth-list__main">
                    <span className="yx-growth-meta">{p.anonymous ? `${p.relationship} (anonymous)` : `${p.author}, ${p.relationship.toLowerCase()}`}</span>
                    <p className="yx-growth-p">{p.text}</p>
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
    </Card>
  );
  const kudosPanel = (
    <Card title="Kudos this period">
      <Text size="sm" tone="secondary">
        Context only, never scored. {persona === 'emp' ? 'You can hide any kudos from this review.' : ''}
      </Text>
      <ul className="yx-growth-list">
        {review.kudos.map((k) => (
          <li key={k.value} className="yx-growth-list__item">
            <Badge tone="success">{k.value}</Badge>
            <span className="yx-growth-grow yx-growth-meta">
              {k.count} · latest: “{k.latest}”
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
  const scorePanel = (
    <Card title="Score">
      <ScoreBand score={score.score} pendingText="Pending" />
      {score.pending.length > 0 && <Text size="sm" tone="secondary">Pending: {score.pending.join(', ')}. Pending sections don’t count as 0.</Text>}
      {score.excluded.length > 0 && (
        <InlineAlert tone="warning" title="Section left out">
          {score.excluded.join(', ')} has no goals, so it isn’t scored.
        </InlineAlert>
      )}
      <DescriptionList items={sections.map((s) => ({ label: `${s.title} (${s.weight}%)`, value: s.empty ? 'Excluded' : s.score == null ? 'Pending' : s.score.toFixed(2) }))} />
    </Card>
  );

  const assistantPanel =
    persona === 'mgr' && assistant ? <ReviewAssistantPanel assistant={assistant} summary={summary} rating={overall} onSummary={setSummary} /> : null;

  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona={persona}>
      <ObjectHeader
        name={review.employee}
        person
        photoUrl={null}
        secondary={`${review.role} · ${review.cycle}`}
        status={
          <>
            <Badge tone={locked ? 'success' : 'info'}>{locked ? 'Submitted' : persona === 'mgr' ? 'Manager review' : 'Self review'}</Badge> <ConfidentialTag />
          </>
        }
        facts={[
          { label: 'Manager', value: review.manager },
          { label: 'Due', value: formatDate(review.stages.find((s) => s.state === 'current')?.due ?? TODAY) },
          { label: 'Score so far', value: score.score == null ? 'Pending' : `${score.score.toFixed(2)} · ${bandFor(score.score)}` },
        ]}
        actions={
          locked ? (
            <Button icon={Download}>Download PDF</Button>
          ) : (
            <>
              <Button>Save draft</Button>
              <Button variant="primary" icon={Send}>
                {persona === 'mgr' ? 'Complete manager review' : 'Complete self review'}
              </Button>
            </>
          )
        }
      />
      <StageTrack stages={review.stages} nextStep={persona === 'mgr' ? 'Skip-level review by Aisha Khan' : '360° feedback from your nominated reviewers'} />
      {locked && (
        <InlineAlert tone="success" title="Submitted">
          Your review moved to the next stage. You can’t edit it now; HR can reopen it with a reason.
        </InlineAlert>
      )}
      <SplitLayout
        main={
          <>
            <Card title={`Goals · ${review.sections.find((s) => s.id === 'goals')?.weight}%`}>
              <ul className="yx-growth-list">
                {review.goals.map((g) => (
                  <li key={g.id} className="yx-growth-list__item">
                    <div className="yx-growth-stack yx-growth-grow" data-gap="sm">
                      <div className="yx-growth-row" data-between="">
                        <span className="yx-growth-list__title">{g.title}</span>
                        <span className="yx-growth-meta">
                          Weight {g.weight}% · progress {g.progress}%
                        </span>
                      </div>
                      {persona === 'mgr' && (
                        <Text size="sm" tone="secondary">
                          Self rating: {g.self ? `${g.self} · ${RATING_LABELS[g.self - 1]}` : 'Not given'} · “{g.selfComment}”
                        </Text>
                      )}
                      <RatingScale label={`${persona === 'mgr' ? 'Manager' : 'Self'} rating for ${g.title}`} value={ratings[g.id]} onChange={(v) => setRatings((r) => ({ ...r, [g.id]: v }))} disabled={locked} />
                      <TextArea aria-label={`Comment on ${g.title}`} defaultValue={persona === 'mgr' ? g.managerComment : g.selfComment} rows={2} disabled={locked} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={`Competencies · ${review.sections.find((s) => s.id === 'comp')?.weight}%`}>
              <ul className="yx-growth-list">
                {review.competencies.map((c) => (
                  <li key={c.id} className="yx-growth-list__item">
                    <div className="yx-growth-stack yx-growth-grow" data-gap="sm">
                      <span className="yx-growth-list__title">
                        {c.name} <span className="yx-growth-meta">· required level {c.required}</span>
                      </span>
                      <RatingScale label={`Rating for ${c.name}`} value={comp[c.id]} onChange={(v) => setComp((r) => ({ ...r, [c.id]: v }))} disabled={locked} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            {review.sections
              .filter((s) => s.empty)
              .map((s) => (
                <InlineAlert key={s.id} tone="warning" title={`${s.title}: no goals in this section`}>
                  It is left out of the score and the other weights are adjusted.
                </InlineAlert>
              ))}
            <Card title={persona === 'mgr' ? 'Overall rating and summary' : 'Your summary'}>
              {persona === 'mgr' && <RatingScale label="Overall rating" value={overall} onChange={setOverall} disabled={locked} />}
              {persona === 'mgr' && <PotentialChoice value={potential} onChange={setPotential} readOnly={locked} />}
              <FormField label={persona === 'mgr' ? 'Summary for the employee' : 'What went well, and what you’d like to grow in'}>
                <TextArea value={summary} onChange={setSummary} rows={5} disabled={locked} />
              </FormField>
              {assistantPanel}
            </Card>
          </>
        }
        side={
          <>
            {scorePanel}
            {peerPanel}
            {kudosPanel}
          </>
        }
      />
    </GrowthFrame>
  );
}

/* ================================================================== PRF-06 · Review acknowledgement */

export interface ReleasedReview {
  employee: string;
  cycle: string;
  manager: string;
  score: number;
  released: Date;
  managerSummary: string;
  sections: { title: string; score: number }[];
}

/** PRF-06 acknowledgement (T4): comment allowed, rating unchanged; disagreement flag routes to HR (M06 Q2). */
export function ReviewAcknowledgeScreen(props: { device?: Device; review: ReleasedReview; defaultDisagree?: boolean; acknowledged?: boolean } | { live: LiveAcknowledge; defaultDisagree?: boolean }) {
  return 'live' in props ? <LiveReviewAcknowledgeScreen live={props.live} defaultDisagree={props.defaultDisagree} /> : <SampleAcknowledge {...props} />;
}

function SampleAcknowledge({ device = 'desktop', review, defaultDisagree, acknowledged }: { device?: Device; review: ReleasedReview; defaultDisagree?: boolean; acknowledged?: boolean }) {
  const [comment, setComment] = useState(defaultDisagree ? 'The line-3 automation was delayed by the vendor, which the review doesn’t mention.' : '');
  const [disagree, setDisagree] = useState(!!defaultDisagree);
  const [reason, setReason] = useState(defaultDisagree ? 'Goal 2 rating does not account for the vendor delay agreed in my 1:1 on 19 Aug.' : '');
  const [done, setDone] = useState(!!acknowledged);
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (disagree && reason.trim().length < 20) return setErr('Say which part you disagree with and why (at least 20 characters).');
    setErr(null);
    setDone(true);
  };
  const body = done ? (
    <InlineAlert tone="success" title={`Acknowledged on ${formatDate(TODAY)}`}>
      {disagree ? 'Your disagreement went to HR (Lakshmi Venkatesan). They will reply within 10 working days. Your rating stays as released while HR looks at it.' : 'Your review is complete. You can download it any time.'}
    </InlineAlert>
  ) : (
    <div className="yx-growth-stack">
      <Card title="Your released rating">
        <ScoreBand score={review.score} />
        <DescriptionList items={review.sections.map((s) => ({ label: s.title, value: `${s.score.toFixed(2)} · ${bandFor(s.score)}` }))} />
        <Text size="sm" tone="secondary">
          Released {formatDate(review.released)} by HR after calibration.
        </Text>
      </Card>
      <Card title={`Summary from ${review.manager}`}>
        <p className="yx-growth-p">{review.managerSummary}</p>
      </Card>
      <FormField label="Your comment" optional helper="Your manager and HR see it. It doesn’t change the rating.">
        <TextArea value={comment} onChange={setComment} rows={3} />
      </FormField>
      <Checkbox checked={disagree} onChange={setDisagree} label="I disagree with this rating" description="HR is told and looks at it. You can escalate further if it isn’t resolved." />
      {disagree && (
        <FormField label="What do you disagree with?" required error={err}>
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
      )}
      <div className="yx-growth-effect" aria-live="polite">
        <span className="yx-growth-effect__title">When you acknowledge</span>
        <ul>
          <li>Your review is marked acknowledged; the rating stays {review.score.toFixed(2)} · {bandFor(review.score)}.</li>
          {disagree ? <li>HR gets your disagreement with your reason, and your manager is told a disagreement was raised.</li> : <li>No one else is notified.</li>}
        </ul>
      </div>
    </div>
  );
  const actions = !done && (
    <Button variant="primary" icon={Check} fullWidth={device === 'phone'} onClick={submit}>
      {disagree ? 'Acknowledge and send disagreement' : 'Acknowledge review'}
    </Button>
  );
  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Reviews & cycles" persona="emp" device="phone" phone={{ title: 'Acknowledge review', back: true }}>
        {body}
        {actions && <div className="yx-growth-pinned">{actions}</div>}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="emp">
      <PageHeader title="Acknowledge your review" description={review.cycle} status={<ConfidentialTag />} actions={actions || <Button icon={Download}>Download review</Button>} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {body}
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== PRF-07 · 360° nominations */

export interface Nomination {
  id: string;
  name: string;
  relationship: Relationship;
  status: 'Proposed' | 'Approved' | 'Removed' | 'Invited' | 'Responded';
  addedBy?: string;
  /** Live: the viewer may take this one off the list (the employee their own proposal, the manager a proposal). */
  canRemove?: boolean;
}

/** The app's nominations: names searched on the server, every change checked there (who, the window, min and max). */
export interface LiveNominations {
  onRetry: () => void;
  cycle: string;
  dueOn: Date;
  manager: string;
  /** The list was sent and nothing new was added since. */
  sent: boolean;
  can: { propose: boolean; decide: boolean; add: boolean; send: boolean };
  onSearch: (query: string) => void;
  onAdd: (reviewerEmployeeId: string, relationship: 'peer' | 'report' | 'other') => Promise<unknown>;
  onApprove: (id: string) => Promise<unknown>;
  onRemove: (n: Nomination) => Promise<unknown>;
  onSend: () => Promise<unknown>;
  onApproveAll: () => Promise<unknown>;
}

const REL: Record<Relationship, 'peer' | 'report' | 'other'> = { Peer: 'peer', 'Direct report': 'report', Other: 'other', Manager: 'other' };

/** PRF-07 360° nominations (T4): employee nominates (min–max), manager approves or adds; anonymity explained (Q4). */
export function NominationsScreen({ persona, device = 'desktop', employee, people, nominations: initial, min = 3, max = 6, submitted, state = 'ready', live }: { persona: 'emp' | 'mgr'; device?: Device; employee: string; people: PersonOption[]; nominations: Nomination[]; min?: number; max?: number; submitted?: boolean; state?: LoadState; live?: LiveNominations }) {
  const [own, setList] = useState(initial);
  const list = live ? initial : own;
  const [pick, setPick] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PersonOption | null>(null);
  const [rel, setRel] = useState<Relationship>('Peer');
  const [ownSent, setSent] = useState(!!submitted);
  const sent = live ? live.sent : ownSent;
  const [tried, setTried] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const { busy, act } = useAct();
  const active = list.filter((n) => n.status !== 'Removed');
  const err = nominationCheck(active.length, min, max);
  const canAdd = live ? (persona === 'emp' ? live.can.propose : live.can.add) : !sent;
  const shown = [...(chosen && !people.some((p) => p.id === chosen.id) ? [chosen] : []), ...people];
  const add = async () => {
    const p = shown.find((x) => x.id === pick);
    if (!p) {
      setPickError('Choose a person to add.');
      return document.getElementById('nom-pick')?.focus();
    }
    if (list.some((n) => n.name === p.name && n.status !== 'Removed')) return setPickError(`${p.name} is already on the list.`);
    setPickError(null);
    if (live) {
      if (await act('add', () => live.onAdd(p.id, REL[rel]), `${p.name} added`)) {
        setPick(null);
        setChosen(null);
      }
      return;
    }
    setList((xs) => [...xs, { id: p.id, name: p.name, relationship: rel, status: persona === 'mgr' ? 'Approved' : 'Proposed', addedBy: persona === 'mgr' ? 'Manager' : undefined }]);
    setPick(null);
  };
  const remove = (n: Nomination) => (live ? void act(`r-${n.id}`, () => live.onRemove(n), `${n.name} removed`) : setList((xs) => (persona === 'mgr' ? xs.map((x) => (x.id === n.id ? { ...x, status: 'Removed' } : x)) : xs.filter((x) => x.id !== n.id))));
  const approve = (n: Nomination) => (live ? void act(`a-${n.id}`, () => live.onApprove(n.id), `${n.name} approved`) : setList((xs) => xs.map((x) => (x.id === n.id ? { ...x, status: 'Approved' } : x))));
  const rows = (
    <ul className="yx-growth-list">
      {list.map((n) => (
        <li key={n.id} className="yx-growth-list__item">
          <PersonLabel name={n.name} secondary={`${n.relationship}${n.addedBy ? ` · added by ${n.addedBy.toLowerCase()}` : ''}`} />
          <span className="yx-growth-grow" />
          <Badge tone={n.status === 'Approved' || n.status === 'Responded' ? 'success' : n.status === 'Removed' ? 'neutral' : 'info'}>{n.status}</Badge>
          {persona === 'mgr' && n.status === 'Proposed' && (!live || live.can.decide) && (
            <Button variant="approve" size="sm" loading={busy === `a-${n.id}`} onClick={() => approve(n)}>
              Approve
            </Button>
          )}
          {(live ? n.canRemove : !sent && n.status !== 'Removed' && n.status !== 'Responded') && (
            <Button size="sm" icon={Trash2} loading={busy === `r-${n.id}`} onClick={() => remove(n)}>
              Remove
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
  const adder = canAdd && (
    <FieldRow>
      <FormField label="Add a reviewer" id="nom-pick" error={pickError}>
        <PersonPicker
          people={shown.filter((p) => p.name !== employee)}
          value={pick}
          onChange={(id) => {
            setPick(id);
            setChosen(shown.find((p) => p.id === id) ?? null);
            setPickError(null);
          }}
          onSearchChange={live?.onSearch}
        />
      </FormField>
      <FormField label="Relationship">
        <Select value={rel} onChange={(v) => v && setRel(v as Relationship)} options={(['Peer', 'Direct report', 'Other'] as const).map((r) => ({ value: r, label: r }))} />
      </FormField>
      <Button icon={Plus} loading={busy === 'add'} onClick={() => void add()}>
        Add
      </Button>
    </FieldRow>
  );
  const info = (
    <InlineAlert tone="info" title="Who sees what">
      Peers and direct reports stay anonymous, and their feedback shows only when 3 or more in a group respond. Manager feedback is named. Only people on this approved list can give 360° feedback on {persona === 'emp' ? 'your' : `${employee}’s`} review.
    </InlineAlert>
  );
  // Never a disabled button: pressed too early, it says what is missing next to the list.
  const press = (fn: () => void) => () => {
    setTried(true);
    if (err) return;
    fn();
  };
  const primary =
    persona === 'emp' ? (
      (!live || live.can.send || !sent) && (
        <Button variant="primary" icon={Send} loading={busy === 'send'} onClick={press(() => (live ? void act('send', live.onSend, `Sent to ${live.manager}`) : setSent(true)))} fullWidth={device === 'phone'}>
          Send to manager for approval
        </Button>
      )
    ) : (
      (!live || (live.can.decide && !live.sent)) && (
        <Button variant="primary" loading={busy === 'all'} onClick={press(() => (live ? void act('all', live.onApproveAll, 'Reviewers invited') : (setList((xs) => xs.map((x) => (x.status === 'Proposed' ? { ...x, status: 'Approved' } : x))), setSent(true))))} fullWidth={device === 'phone'}>
          Approve list and invite
        </Button>
      )
    );
  const doneNote = sent && (
    <InlineAlert tone="success" title={persona === 'emp' ? `Sent to ${live?.manager ?? 'Karthik Subramanian'}` : 'Reviewers invited'}>
      {persona === 'emp' ? 'You’ll be told when your manager approves or changes the list.' : `Each reviewer gets an in-app task due ${formatDate(live?.dueOn ?? new Date(2026, 9, 12))}.`}
    </InlineAlert>
  );
  const content = (
    <>
      {info}
      {doneNote}
      <Card title={`Reviewers · ${active.length} of ${min}–${max}`}>
        {state === 'loading' ? <Skeleton height={160} /> : list.length === 0 ? <EmptyState compact title="No reviewers yet" description={`Add ${min} to ${max} people who worked closely with ${persona === 'emp' ? 'you' : employee} this period.`} /> : rows}
        {err && (tried || !live) && !sent && <Text tone="danger">{err}</Text>}
        {adder}
      </Card>
    </>
  );
  const description = live ? `${live.cycle} · nominations close ${formatDate(live.dueOn)}` : 'Half-yearly review H1 FY 2026-27 · nominations close 2 Oct 2026';
  if (state === 'error')
    return (
      <GrowthFrame area="performance" active="Reviews & cycles" persona={persona}>
        <PageHeader title="360° reviewers" />
        <ErrorState title="We couldn’t load the nominations" description="Check your connection and try again." onRetry={live?.onRetry} />
      </GrowthFrame>
    );
  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Reviews & cycles" persona={persona} device="phone" phone={{ title: '360° reviewers', back: true, tab: persona === 'mgr' ? 'requests' : 'me' }}>
        {content}
        <div className="yx-growth-pinned">{primary}</div>
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona={persona}>
      <PageHeader title={persona === 'emp' ? 'Nominate your 360° reviewers' : `360° reviewers for ${employee}`} description={description} actions={primary || undefined} />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {content}
      </div>
    </GrowthFrame>
  );
}

/* ================================================================== PRF-15 · Dispute escalation + evidence export */

export interface DisputeCase {
  id: string;
  employee: string;
  cycle: string;
  raised: Date;
  status: 'Raised' | 'With HR' | 'Escalated' | 'Resolved';
  grounds: string;
  sought: string;
  legalHold: boolean;
  steps: ApprovalStep[];
  evidence: { id: string; kind: string; label: string; at: Date; hash: string }[];
  activity: TimelineItem[];
  /** Live: the case reference (PRF-D-0001) and the decision once recorded. */
  ref?: string;
  decision?: string | null;
}

/** PRF-15 live: my escalation of one released review (performance builder 3). */
export interface LiveDisputeRaise {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  cycle: string;
  score: number | null;
  band: string | null;
  disagreement: { raisedOn: Date; answeredOn: Date | null } | null;
  escalateBy: Date | null;
  /** Why I cannot escalate now (null: I can). */
  why: string | null;
  dispute: { ref: string; status: 'raised' | 'resolved'; decision: string | null; decisionNote: string | null; files: { id: string; name: string }[] } | null;
  steps: ApprovalStep[];
  onRaise: (input: { grounds: string; sought: string }) => Promise<void>;
  /** Adds an attachment to my open escalation. */
  onUpload: (file: File) => Promise<void>;
}

const SOUGHT_OPTIONS = [
  { value: 'rereview', label: 'A fresh review of the rating by someone independent' },
  { value: 'correct', label: 'Correction of a factual error in the review' },
  { value: 'other', label: 'Something else (say in the text above)' },
];

/** PRF-15 employee escalation (T4): after a disagreement isn’t resolved, escalate with grounds and attachments. */
export function DisputeRaiseScreen({ device = 'desktop', dispute, sent, live }: { device?: Device; dispute?: DisputeCase; sent?: boolean; /** The live app's /yx/performance/reviews/[id]/dispute. */ live?: LiveDisputeRaise }) {
  const { toast } = useToast();
  const [grounds, setGrounds] = useState('');
  const [sought, setSought] = useState<string>('rereview');
  const [sampleDone, setSampleDone] = useState(!!sent);
  const [tried, setTried] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const { run, busy, error } = useRun();
  const done = live ? Boolean(live.dispute) : sampleDone;
  const groundsError = tried && grounds.trim().length < 20 ? 'Say what you are escalating and why, in at least 20 characters.' : null;
  const escalate = () => {
    setTried(true);
    if (grounds.trim().length < 20) return void document.getElementById('dispute-grounds')?.focus();
    if (!live) return setSampleDone(true);
    void run('raise', async () => {
      await live.onRaise({ grounds: grounds.trim(), sought });
      for (const f of files) await live.onUpload(f);
    }).then((ok) => ok && toast({ tone: 'success', title: 'Escalation raised' }));
  };
  const ref = live?.dispute?.ref ?? 'PRF-D-0412';
  const steps = live ? live.steps : dispute?.steps;
  const subtitle = live ? `${live.cycle}${live.score != null ? ` · rating ${live.score.toFixed(2)}` : ''}${live.band ? ` · ${live.band}` : ''}` : 'Annual review FY 2025-26 · rating 2.60 · Partly meets';
  const before = live
    ? live.disagreement
      ? `You raised a disagreement on ${formatDate(live.disagreement.raisedOn)}.${live.disagreement.answeredOn ? ` HR replied on ${formatDate(live.disagreement.answeredOn)}.` : ''}${live.escalateBy ? ` You can escalate until ${formatDate(live.escalateBy)}.` : ''} The rating stays as released while it’s reviewed.`
      : 'Raise a disagreement on your released review first. You can escalate once HR has answered it.'
    : 'You raised a disagreement on 14 Aug 2026. HR replied on 21 Aug 2026. If you’re still not satisfied, escalate it here. The rating stays as released while it’s reviewed.';
  const resolved = live?.dispute?.status === 'resolved';
  const form = done ? (
    <div className="yx-growth-stack">
      <InlineAlert tone="info" title={resolved ? 'A decision was recorded' : 'Escalation raised'}>
        {resolved
          ? `${live!.dispute!.decisionNote ?? ''} Reference ${ref}.`
          : `Reference ${ref}. HR’s dispute team and an independent reviewer look at it. Your rating stays as released until a decision.`}
      </InlineAlert>
      {steps && <ApprovalTimeline steps={steps} now={live ? new Date() : TODAY} />}
      {live && !resolved && (
        <FormField label="Attachments" optional helper="PDF, JPG or PNG, up to 10 MB each, at most 5.">
          <FileUpload upload={(f) => live.onUpload(f)} accept={['.pdf', '.jpg', '.png']} multiple defaultItems={[]} />
        </FormField>
      )}
      {live && live.dispute && live.dispute.files.length > 0 && <Text tone="secondary">Attached: {live.dispute.files.map((f) => f.name).join(', ')}</Text>}
    </div>
  ) : (
    <div className="yx-growth-stack">
      <InlineAlert tone="info" title="Before you escalate">
        {before}
      </InlineAlert>
      {live?.why && <InlineAlert tone="warning">{live.why}</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <FormField label="What are you escalating, and why?" required id="dispute-grounds" error={groundsError} helper="Refer to the goal, section or comment and what evidence supports your view.">
        <TextArea value={grounds} onChange={setGrounds} rows={5} maxLength={4000} />
      </FormField>
      <FormField label="What outcome are you asking for?">
        <RadioGroup aria-label="Outcome sought" value={sought} onChange={setSought} options={SOUGHT_OPTIONS} />
      </FormField>
      <FormField label="Attachments" optional helper={live ? 'PDF, JPG or PNG, up to 10 MB each, at most 5. They are sent with the escalation.' : undefined}>
        <FileUpload
          upload={async () => {}}
          accept={['.pdf', '.jpg', '.png']}
          multiple
          onItemsChange={(items) => setFiles(items.filter((i) => i.status !== 'error').map((i) => i.file).slice(0, 5))}
        />
      </FormField>
    </div>
  );
  const btn = !done && !(live && live.why) && (
    <Button variant="primary" icon={Send} loading={busy === 'raise'} onClick={escalate} fullWidth={device === 'phone'}>
      Escalate dispute
    </Button>
  );
  const body = live && live.state !== 'ready' ? <Skeleton height={320} /> : form;
  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Reviews & cycles" persona="emp" device="phone" phone={{ title: 'Escalate a dispute', back: true }}>
        {body}
        {btn && <div className="yx-growth-pinned">{btn}</div>}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="emp">
      <PageHeader title="Escalate a rating dispute" description={subtitle} status={<ConfidentialTag />} actions={btn || undefined} />
      {live?.state === 'error' ? (
        <EmptyState title="Your review did not load" description="Check your connection and try again." action={<Button onClick={live.onRetry}>Try again</Button>} />
      ) : (
        <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
          {body}
        </div>
      )}
    </GrowthFrame>
  );
}

/** PRF-15 HR's list of escalated disputes (design added 3 Nov 2026 with the live page). */
export interface DisputeRow {
  id: string;
  ref: string;
  employee: string;
  cycle: string;
  raised: Date;
  status: 'Raised' | 'Resolved';
  legalHold: boolean;
}

export function DisputeListScreen({ rows, state = 'ready', onOpen, onRetry }: { rows: DisputeRow[]; state?: LoadState; onOpen?: (id: string) => void; onRetry?: () => void }) {
  const cols: TableColumn<DisputeRow>[] = [
    { key: 'ref', header: 'Reference', type: 'id', value: (r) => r.ref, width: 130 },
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee }), width: 220 },
    { key: 'cycle', header: 'Cycle', value: (r) => r.cycle, width: 240 },
    { key: 'raised', header: 'Raised', type: 'date', value: (r) => r.raised, width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Resolved' ? 'success' : 'warning'), width: 130 },
    { key: 'hold', header: 'Legal hold', value: (r) => (r.legalHold ? 'On' : 'Off'), width: 110 },
  ];
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
      <PageHeader title="Rating disputes" description="Escalated disputes about released ratings. Only people who handle disputes see them; every view and export is recorded." status={<ConfidentialTag />} />
      <DataTable
        label="Rating disputes"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
        onRetry={onRetry ?? (() => {})}
        onRowClick={(r) => onOpen?.(r.id)}
        empty={<EmptyState title="No escalated disputes" description="When an employee escalates a disagreement HR answered, it is listed here." />}
      />
    </GrowthFrame>
  );
}

/** PRF-15 live: one escalated dispute for HR with perf.dispute.manage (performance builder 3). */
export interface LiveDisputeRecord {
  state: 'loading' | 'error' | 'ready';
  onRetry: () => void;
  dispute: DisputeCase | null;
  /** People who handle this dispute: the signatory is one of them. */
  signatories: { value: string; label: string }[];
  exports: { id: string; ref: string; at: Date; items: number }[];
  onLegalHold: (on: boolean) => Promise<void>;
  onDecide: (input: { decision: 'upheld' | 'not_upheld' | 'rereview'; note: string }) => Promise<void>;
  onExport: (items: string[], signatoryUserId: string) => Promise<{ exportId: string; ref: string }>;
  onDownload: (exportId: string, ref: string) => Promise<void>;
}

const DECISIONS = [
  { value: 'upheld' as const, label: 'Upheld' },
  { value: 'not_upheld' as const, label: 'Not upheld' },
  { value: 'rereview' as const, label: 'Fresh review' },
];

/** PRF-15 record the decision; the rating changes only through a reopened review. */
function DecisionDialog({ open, onOpenChange, onDecide }: { open: boolean; onOpenChange: (o: boolean) => void; onDecide: (input: { decision: 'upheld' | 'not_upheld' | 'rereview'; note: string }) => Promise<void> }) {
  const [decision, setDecision] = useState<'upheld' | 'not_upheld' | 'rereview' | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const { run, busy, error } = useRun();
  const save = () => {
    setTried(true);
    if (!decision) return void document.getElementById('dispute-decision')?.querySelector('button')?.focus();
    if (note.trim().length < 10) return void document.getElementById('dispute-note')?.focus();
    void run('decide', () => onDecide({ decision, note: note.trim() }));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      preventClose={busy === 'decide'}
      title="Record decision"
      description="The decision is shared with the employee. Recording it never changes the rating: a changed rating goes through a reopened review with a reason."
      notice={error ? <InlineAlert tone="danger">{error}</InlineAlert> : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={busy === 'decide'} onClick={save}>
            Record decision
          </Button>
        </>
      }
    >
      <div className="yx-growth-stack">
        <div id="dispute-decision">
          <FormField label="Decision" required error={tried && !decision ? 'Choose the decision.' : null}>
            <Segment label="Decision" value={decision} onChange={setDecision} options={DECISIONS} />
          </FormField>
        </div>
        <FormField label="Decision and reasons" required id="dispute-note" error={tried && decision && note.trim().length < 10 ? 'Write the decision and its reasons, in at least 10 characters.' : null}>
          <TextArea value={note} onChange={setNote} rows={4} maxLength={2000} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** PRF-15 HR dispute record (T3) with legal hold and court-ready evidence export (APX-F #133 / #134, APX-G G-42). */
export function DisputeRecordScreen({ dispute: sample, exportOpen, exported, decideOpen, live }: { dispute: DisputeCase; exportOpen?: boolean; exported?: boolean; /** Story: the record-decision dialog open. */ decideOpen?: boolean; /** The live app's /yx/performance/disputes/[id]. */ live?: LiveDisputeRecord }) {
  const { toast } = useToast();
  const dispute = live?.dispute ?? sample;
  const [sampleHold, setHold] = useState(sample.legalHold);
  const hold = live ? dispute.legalHold : sampleHold;
  const [open, setOpen] = useState(!!exportOpen);
  // Null until changed: every item, and the first signatory (the live record arrives after the first render).
  const [chosenItems, setItems] = useState<string[] | null>(null);
  const items = chosenItems ?? dispute.evidence.map((e) => e.id);
  const [chosenSignatory, setSignatory] = useState<string | null>(null);
  const signatory = chosenSignatory ?? (live ? (live.signatories[0]?.value ?? null) : 'hr1');
  const [confirm, setConfirm] = useState(false);
  const [deciding, setDeciding] = useState(!!decideOpen);
  const [tried, setTried] = useState(false);
  const [sampleDone, setDone] = useState(!!exported);
  const { run, busy, error } = useRun();
  const latest = live?.exports[0];
  const done = live ? Boolean(latest) : sampleDone;
  const cols: TableColumn<DisputeCase['evidence'][number]>[] = [
    { key: 'kind', header: 'Type', value: (r) => r.kind, width: 170 },
    { key: 'label', header: 'Item', value: (r) => r.label, width: 320 },
    { key: 'at', header: 'Recorded', type: 'date', value: (r) => r.at, width: 130 },
    { key: 'hash', header: 'SHA-256', type: 'id', value: (r) => (r.hash.length > 16 ? `${r.hash.slice(0, 4)}…${r.hash.slice(-4)}` : r.hash), width: 180 },
  ];
  const signatories = live ? live.signatories : [{ value: 'hr1', label: 'Lakshmi Venkatesan, HR Business Partner' }, { value: 'hr2', label: 'Anand Rao, Head of People' }];
  const generate = () => {
    setTried(true);
    if (items.length === 0) return void document.getElementById('export-items')?.querySelector('button')?.focus();
    if (!signatory) return void document.getElementById('export-signatory')?.focus();
    setConfirm(true);
  };
  if (live && live.state !== 'ready')
    return (
      <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
        {live.state === 'error' ? <EmptyState title="This dispute did not load" description="It may not exist, or you may not handle disputes for this person." action={<Button onClick={live.onRetry}>Try again</Button>} /> : <Skeleton height={400} />}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
      <ObjectHeader
        name={`Rating dispute · ${dispute.employee}`}
        icon={FileLock2}
        secondary={`${dispute.cycle} · raised ${formatDate(dispute.raised)}`}
        status={
          <>
            <Badge tone={dispute.status === 'Resolved' ? 'success' : 'warning'}>{dispute.status}</Badge> {hold && <Badge tone="info"><Icon icon={Lock} /> Legal hold</Badge>} <ConfidentialTag />
          </>
        }
        facts={
          live
            ? [
                { label: 'Evidence items', value: dispute.evidence.length },
                { label: 'Reference', value: dispute.ref ?? '' },
                { label: 'Decision', value: dispute.decision ?? 'Pending' },
              ]
            : [
                { label: 'Evidence items', value: dispute.evidence.length },
                { label: 'Owner', value: 'Lakshmi Venkatesan' },
                { label: 'Decision due', value: formatDate(new Date(2026, 9, 6)) },
              ]
        }
        actions={
          <>
            {dispute.status !== 'Resolved' && <Button onClick={() => setDeciding(true)}>Record decision</Button>}
            <Button variant="primary" icon={Download} onClick={() => setOpen(true)}>
              Export evidence
            </Button>
          </>
        }
      />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {done && (
        <InlineAlert
          tone="info"
          title="Evidence exported"
          actions={
            live && latest ? (
              <Button size="sm" icon={Download} loading={busy === 'download'} onClick={() => void run('download', () => live.onDownload(latest.id, latest.ref))}>
                Download
              </Button>
            ) : undefined
          }
        >
          {live && latest
            ? `Evidence pack ${latest.ref} (${latest.items} items) with cover sheet and electronic-records certificate, ${formatDate(latest.at)}. The export and its hashes are in the audit log.`
            : 'Evidence pack PRF-D-0412-EXP-01 with cover sheet and electronic-records certificate. The export and its hashes are in the audit log.'}
        </InlineAlert>
      )}
      <SplitLayout
        main={
          <Tabs defaultValue="case">
            <TabsList aria-label="Dispute">
              <TabsTrigger value="case">Case</TabsTrigger>
              <TabsTrigger value="evidence" count={dispute.evidence.length}>
                Evidence
              </TabsTrigger>
            </TabsList>
            <TabsContent value="case">
              <div className="yx-growth-stack">
                <Card title="Employee’s grounds">
                  <p className="yx-growth-p">{dispute.grounds}</p>
                  <Text tone="secondary">Outcome asked for: {dispute.sought}</Text>
                </Card>
                <Card title="Steps">
                  <ApprovalTimeline steps={dispute.steps} now={live ? new Date() : TODAY} />
                </Card>
                <Switch
                  checked={hold}
                  onChange={(on) => {
                    if (!live) return setHold(on);
                    void run('hold', () => live.onLegalHold(on)).then((ok) => ok && toast({ tone: 'success', title: on ? 'Legal hold on' : 'Legal hold off' }));
                  }}
                  label="Legal hold"
                  description="Keeps every review version, comment, calibration change and audit entry for this person and cycle, even past the retention period."
                />
              </div>
            </TabsContent>
            <TabsContent value="evidence">
              <DataTable label="Evidence" columns={cols} rows={dispute.evidence} getRowId={(r) => r.id} />
            </TabsContent>
          </Tabs>
        }
        side={
          <Card title="Activity">
            <Timeline items={dispute.activity} today={live ? new Date() : TODAY} />
          </Card>
        }
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Export evidence"
        subtitle={`${items.length} items · sealed PDF with hashes`}
        footer={
          <div className="yx-growth-foot">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Download} loading={busy === 'export'} onClick={generate}>
              Generate export
            </Button>
          </div>
        }
      >
        <div className="yx-growth-stack">
          <div id="export-items">
            <FormField label="Items to include" error={tried && items.length === 0 ? 'Choose at least one item to export.' : null}>
              <div className="yx-growth-stack" data-gap="sm">
                {dispute.evidence.map((e) => (
                  <Checkbox key={e.id} checked={items.includes(e.id)} onChange={(c) => setItems(c ? [...items, e.id] : items.filter((x) => x !== e.id))} label={e.label} description={`${e.kind} · ${formatDate(e.at)}`} />
                ))}
              </div>
            </FormField>
          </div>
          <FormField label="Authorised signatory" required id="export-signatory" error={tried && !signatory ? 'Choose who signs the certificate.' : null} helper="Signs the electronic-records certificate with the company’s digital signature.">
            <Select value={signatory} onChange={setSignatory} options={signatories} />
          </FormField>
          <InlineAlert tone="warning" title="Certificate format to be confirmed">
            The electronic-records certificate (Bharatiya Sakshya Adhiniyam s.63) follows a format your counsel confirms before first use.
          </InlineAlert>
          <div className="yx-growth-effect">
            <span className="yx-growth-effect__title">The export contains</span>
            <ul>
              <li>Cover sheet: case, items, SHA-256 hash per item, export date, exporter</li>
              <li>Electronic-records certificate for signature</li>
              <li>{items.length} items as recorded, including every review version and calibration change</li>
            </ul>
          </div>
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Export ${items.length} evidence items for ${dispute.employee}?`}
        consequence="The export is logged with your name, the item hashes and the time. Anyone holding the file can read it; share it only with counsel or the tribunal."
        confirmLabel="Export evidence"
        onConfirm={() => {
          setConfirm(false);
          if (!live) {
            setOpen(false);
            return setDone(true);
          }
          void run('export', async () => {
            const out = await live.onExport(items, signatory!);
            setOpen(false);
            await live.onDownload(out.exportId, out.ref);
          }).then((ok) => ok && toast({ tone: 'success', title: 'Evidence exported' }));
        }}
      />
      {deciding && (
        <DecisionDialog
          open
          onOpenChange={setDeciding}
          onDecide={async (input) => {
            if (live) await live.onDecide(input);
            setDeciding(false);
            toast({ tone: 'success', title: 'Decision recorded' });
          }}
        />
      )}
    </GrowthFrame>
  );
}
