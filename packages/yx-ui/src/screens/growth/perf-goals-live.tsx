// The live app's PRF-01 Performance home, PRF-02 My goals and check-in and PRF-03 Company goal map: the designed
// screens with real data (performance builder 1). The designs' parts are reused as they are; only what the real record
// needs is added (adding and changing goals, sending them, the manager's decision, periods, cascading, dropping).
import { useMemo, useState } from 'react';
import { GoalGapsCard, type GoalGaps } from './goal-gaps';
import { Check, Download, Plus, Target, Trash2 } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DashboardGrid, NeedsActionList, type DashboardWidget } from '../../components/dashboard';
import { BarChart, StatCard } from '../../components/charts';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { ErrorSummary, FormField, useSaveErrors } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { useToast } from '../../components/notify';
import { useNarrow } from '../../components/stepper';
import { countText, formatDate } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import type { CheckinInput, Choice, GoalDetail, GoalInput, GoalPeriod } from '../performance/live/types';
import { CoachCard, GoalTree, GrowthFrame, ProgressRing, StageTrack } from './growth-kit';
import { goalProgress, krProgress, reviewStages, weightCheck, type Goal, type GoalConfidence } from './growth-logic';
import { GoalCheckInSheet, type LiveCoach } from './perf-goals';
import { CONFIDENCE, day, toActions, toGoal, type GoalItem, type LoadState, type PerfHome } from './perf-live-data';

/** Where the live pages are (the performance menu). */
export const PERF_LINKS = {
  home: '/yx/performance',
  goals: '/yx/performance/goals',
  goal: (id: string) => `/yx/performance/goals/${encodeURIComponent(id)}`,
  personGoals: (employeeId: string) => `/yx/performance/goals?employee=${encodeURIComponent(employeeId)}`,
  map: '/yx/performance/goal-map',
  newCycle: '/yx/performance/cycles/new',
  cycle: (id: string) => `/yx/performance/cycles/${encodeURIComponent(id)}`,
  review: (id: string) => `/yx/performance/reviews/${encodeURIComponent(id)}`,
  feedback: '/yx/performance/feedback',
  oneOnOne: (id: string) => `/yx/performance/one-on-ones/${encodeURIComponent(id)}`,
  oneOnOnes: '/yx/performance/one-on-ones',
  pips: '/yx/performance/pips',
  inbox: '/yx/approvals',
};

const TO_API: Record<GoalConfidence, CheckinInput['confidence']> = { 'On track': 'on_track', 'At risk': 'at_risk', 'Off track': 'off_track' };
/** The check-in sheet's answer as the API takes it. */
export const checkinInput = (g: Goal, actuals: Record<string, number>, confidence: GoalConfidence, note: string, progress?: number): CheckinInput => ({
  values: g.keyResults.map((k) => ({ keyResultId: k.id, value: actuals[k.id] ?? k.actual })),
  ...(g.keyResults.length ? {} : { progress: progress ?? 0 }),
  confidence: TO_API[confidence],
  note: note.trim() || null,
});

function useDone() {
  const { toast } = useToast();
  return (title: string, description?: string) => toast({ tone: 'success', title, description });
}

/* ================================================================== PRF-01 · Performance home (live) */

export interface LiveHome {
  state: LoadState;
  onRetry: () => void;
  data: PerfHome | null;
  onCheckIn: (goalId: string, input: CheckinInput) => Promise<unknown>;
  /** PRF-16 coach card on the manager home (founder 3 Nov 2026); the same data as /yx/performance/coach. */
  coach?: LiveCoach | null;
  /** Batch F item 30 (answer 2575): my team's people with no goals or goals not updated, with Remind. */
  gaps?: { state: LoadState; data: GoalGaps | null; onRetry?: () => void; onRemind: (employeeId: string, kind: 'no_goals' | 'not_updated') => Promise<unknown> } | null;
}

/** Links to my earlier reviews (the old reviews list is retired, founder 3 Nov 2026). */
export function EarlierReviews({ items }: { items: { id: string; cycle: string }[] }) {
  if (!items.length) return null;
  return (
    <p className="yx-growth-meta">
      Earlier reviews:{' '}
      {items.map((x, i) => (
        <span key={x.id}>
          {i > 0 && ' · '}
          <Link href={PERF_LINKS.review(x.id)}>{x.cycle}</Link>
        </span>
      ))}
    </p>
  );
}

const dateOrNever = (iso: string | null) => (iso ? formatDate(day(iso)) : 'Never');

export function LivePerformanceHome({ live }: { live: LiveHome }) {
  const phone = useNarrow();
  const done = useDone();
  const [checkIn, setCheckIn] = useState<Goal | null>(null);
  const h = live.data;
  const persona = h?.persona ?? 'emp';
  const title = persona === 'hr' ? 'Performance' : persona === 'mgr' ? 'Performance · my team' : 'My performance';
  const today = new Date();
  const frame = (children: React.ReactNode) => (
    <GrowthFrame area="performance" active="Performance home" persona={persona} device={phone ? 'phone' : 'desktop'} phone={{ title: 'Performance' }}>
      {children}
    </GrowthFrame>
  );
  if (live.state === 'loading' || (live.state === 'ready' && !h))
    return frame(
      <>
        <PageHeader title={title} />
        <NeedsActionList items={[]} viewAllHref={PERF_LINKS.inbox} loading today={today} />
        <div className="yx-growth-kpis">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      </>,
    );
  if (live.state === 'error' || !h)
    return frame(
      <>
        <PageHeader title={title} />
        <ErrorState title="Your performance home didn’t load" description="Check your connection and try again. Your goals and reviews are safe." onRetry={live.onRetry} />
      </>,
    );

  const goals = h.myGoals.map((g) => toGoal(g, h.period?.name));
  const teamGoals = h.teamGoals.map((g) => toGoal(g, h.period?.name));
  const actions = toActions(h);
  const stages = h.myReview ? reviewStages(h.myReview.stages, { stage: h.myReview.stage, status: h.myReview.status }, { employee: 'You', manager: h.myReview.manager }) : null;
  const sheet = checkIn && (
    <GoalCheckInSheet
      goal={checkIn}
      device={phone ? 'phone' : 'desktop'}
      open
      onOpenChange={(o) => !o && setCheckIn(null)}
      onSave={async (a, c, n, p) => {
        await live.onCheckIn(checkIn.id, checkinInput(checkIn, a, c, n, p));
        done('Check-in saved', 'Your manager is notified.');
      }}
    />
  );
  const hasCycle = persona === 'hr' && (h.hr?.cycles.length ?? 0) > 0;
  // First use: nothing to do and nothing running.
  if (!actions.length && !goals.length && !h.myReview && !(h.earlierReviews ?? []).length && !h.team.length && !hasCycle && !h.feedback.length)
    return frame(
      <>
        <PageHeader title={title} />
        <EmptyState
          title={persona === 'hr' ? 'No review cycle is running' : 'Nothing to do in performance yet'}
          description={persona === 'hr' ? 'Start a cycle to set goals and run reviews. Shipped templates: annual, half-yearly, probation and OKR quarterly.' : 'When your company starts a goal period or review cycle, your goals and reviews appear here.'}
          action={persona === 'hr' ? <Link href={PERF_LINKS.newCycle}>Start a review cycle</Link> : <Link href={PERF_LINKS.feedback}>Give feedback</Link>}
        />
      </>,
    );

  const myGoals =
    goals.length === 0 ? (
      <EmptyState compact title="No goals for this period yet" description="Add your goals and align them to your team’s goals." action={<Link href={PERF_LINKS.goals}>Add goal</Link>} />
    ) : (
      <ul className="yx-growth-list">
        {goals.map((g) => (
          <li key={g.id} className="yx-growth-list__item">
            <ProgressRing value={goalProgress(g, goals)} label={g.title} size="md" tone={g.confidence === 'At risk' ? 'warning' : g.confidence === 'Off track' ? 'danger' : 'default'} />
            <div className="yx-growth-list__main">
              <span className="yx-growth-list__title">{g.title}</span>
              <span className="yx-growth-meta">
                Weight {g.weight}% · last check-in {g.lastCheckIn ? formatDate(g.lastCheckIn) : 'none yet'}
              </span>
            </div>
            {g.confidence && <Badge tone={g.confidence === 'On track' ? 'success' : g.confidence === 'At risk' ? 'warning' : 'danger'}>{g.confidence}</Badge>}
            {g.status === 'Approved' && (
              <Button size="sm" onClick={() => setCheckIn(g)}>
                Check in
              </Button>
            )}
          </li>
        ))}
      </ul>
    );
  const feedback =
    h.feedback.length === 0 ? (
      <EmptyState compact title="No feedback received yet" />
    ) : (
      <ul className="yx-growth-list">
        {h.feedback.map((f) => (
          <li key={f.id} className="yx-growth-list__item">
            <PersonLabel name={f.from} secondary={formatDate(day(f.at))} />
            <Badge tone={f.kind === 'praise' ? 'success' : 'info'}>{f.kind === 'praise' ? 'Praise' : 'Suggestion'}</Badge>
            <p className="yx-growth-p yx-growth-grow">{f.text}</p>
          </li>
        ))}
      </ul>
    );
  const nextStep = h.myReview ? h.myReview.next.label : undefined;

  // PRF-16 coach card on the manager home (founder 3 Nov 2026), desktop and phone.
  const kc = live.coach;
  const coachCard =
    kc && (kc.state === 'ready' || kc.state === 'company-off') ? (
      <CoachCard
        key={`${kc.weekOf.getTime()}:${kc.nudges.map((n) => n.id).join(',')}:${kc.optedOut}`}
        nudges={kc.nudges}
        weekOf={kc.weekOf}
        optedOut={kc.optedOut}
        companyOff={kc.state === 'company-off'}
        onAct={kc.onAct}
        onDismiss={(n) => void kc.onDismiss(n.id).catch(() => undefined)}
        onOptOut={() => void kc.onOptOut(true).catch(() => undefined)}
        onOptIn={() => void kc.onOptOut(false).catch(() => undefined)}
      />
    ) : null;
  if (phone)
    return (
      <GrowthFrame area="performance" active="Performance home" persona={persona} device="phone" phone={{ tab: persona === 'mgr' ? 'home' : 'me', title: persona === 'mgr' ? 'Team performance' : 'Goals & reviews' }}>
        {coachCard}
        <NeedsActionList items={actions} viewAllHref={PERF_LINKS.inbox} today={today} title="To do" />
        {stages && (
          <section className="yx-growth-panel" aria-label="My review">
            <h2 className="yx-growth-h">{h.myReview!.cycle}</h2>
            <StageTrack stages={stages} nextStep={nextStep} />
          </section>
        )}
        <section className="yx-growth-panel" aria-label="My goals">
          <h2 className="yx-growth-h">My goals</h2>
          {myGoals}
        </section>
        {h.team.length > 0 && (
          <section className="yx-growth-panel" aria-label="My team">
            <h2 className="yx-growth-h">My team</h2>
            <ul className="yx-growth-list">
              {h.team.map((t) => (
                <li key={t.id} className="yx-growth-list__item">
                  <PersonLabel name={t.name} secondary={`${t.reviewStage} · goals ${t.goalProgress ?? '—'}${t.goalProgress == null ? '' : '%'}`} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth asChild>
            <a href={PERF_LINKS.feedback}>
              <span className="yx-button__label">Give feedback</span>
            </a>
          </Button>
        </div>
        {sheet}
      </GrowthFrame>
    );

  const widgets: DashboardWidget[] = [{ id: 'actions', title: 'Needs your action', size: 12, pinned: true, bare: true, content: <NeedsActionList items={actions} viewAllHref={PERF_LINKS.inbox} today={today} /> }];
  if (persona !== 'hr' || h.myReview || goals.length) {
    widgets.push(
      { id: 'review', title: h.myReview ? `My review · ${h.myReview.cycle}` : 'My review', size: 12, content: stages ? <>{<StageTrack stages={stages} nextStep={nextStep} />}<EarlierReviews items={h.earlierReviews ?? []} /></> : (h.earlierReviews ?? []).length ? <EarlierReviews items={h.earlierReviews ?? []} /> : null, empty: stages || (h.earlierReviews ?? []).length ? undefined : 'No review running for you', actions: h.myReview ? <Link href={PERF_LINKS.review(h.myReview.id)}>Open my review</Link> : undefined },
      { id: 'goals', title: h.period ? `My goals · ${h.period.name}` : 'My goals', size: persona === 'emp' ? 8 : 12, content: myGoals, actions: <Link href={PERF_LINKS.goals}>View all goals</Link> },
    );
  }
  if (persona === 'emp') {
    widgets.push(
      {
        id: 'oneonone',
        title: 'Next 1:1',
        size: 4,
        content: h.nextOneOnOne ? (
          <div className="yx-growth-stack" data-gap="sm">
            <PersonLabel name={h.nextOneOnOne.with} secondary="Your manager" />
            <Text>{formatDate(day(h.nextOneOnOne.on))}</Text>
            <Text tone="secondary">{`${countText(h.nextOneOnOne.agenda, 'agenda item')} so far`}</Text>
            <Link href={PERF_LINKS.oneOnOne(h.nextOneOnOne.id)}>Add to agenda</Link>
          </div>
        ) : null,
        empty: h.nextOneOnOne ? undefined : 'No 1:1 planned',
      },
      { id: 'feedback', title: 'Feedback received', size: 12, content: feedback, actions: <Link href={PERF_LINKS.feedback}>Give feedback</Link> },
    );
  }
  if (persona === 'mgr' || (persona === 'hr' && h.team.length)) {
    // PRF-16 coach card beside the team (as in the PRF-01 manager design): nudges about my own team, dismiss, opt out.
    const k = live.coach;
    const coachWidget: DashboardWidget | null =
      k && k.state !== 'not-manager'
        ? {
            id: 'coach',
            title: 'Manager coach',
            size: 4,
            bare: k.state === 'ready' || k.state === 'company-off',
            state: k.state === 'loading' ? 'loading' : k.state === 'error' ? 'error' : undefined,
            onRetry: k.onRetry,
            content:
              coachCard,
          }
        : null;
    const cols: TableColumn<PerfHome['team'][number]>[] = [
      { key: 'name', header: 'Team member', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 220 },
      { key: 'goals', header: 'Goal progress', type: 'number', value: (r) => r.goalProgress, render: (r) => (r.goalProgress == null ? 'No goals yet' : `${r.goalProgress}%`), width: 130 },
      { key: 'stage', header: 'Review stage', type: 'status', value: (r) => r.reviewStage, statusTone: (v) => (String(v).includes('overdue') ? 'danger' : String(v).startsWith('Acknowledged') || String(v).startsWith('Released') ? 'success' : 'info'), width: 220 },
      { key: 'oneonone', header: 'Last 1:1', type: 'date', value: (r) => r.lastOneOnOne, render: (r) => dateOrNever(r.lastOneOnOne), width: 130 },
      { key: 'feedback', header: 'Last feedback', type: 'date', value: (r) => r.lastFeedback, render: (r) => dateOrNever(r.lastFeedback), width: 140 },
    ];
    widgets.push(
      ...(coachWidget ? [coachWidget] : []),
      { id: 'team', title: 'My team', size: coachWidget ? 8 : 12, content: <DataTable label="My team" columns={cols} rows={h.team} getRowId={(r) => r.id} rowButtons={(r) => <>{r.reviewId && <Link href={PERF_LINKS.review(r.reviewId)}>Review</Link>} <Link href={PERF_LINKS.personGoals(r.id)}>Goals</Link></>} /> },
      ...(live.gaps && persona === 'mgr'
        ? [{ id: 'gaps', title: 'Goals to chase', size: 12 as const, state: live.gaps.state === 'loading' ? ('loading' as const) : live.gaps.state === 'error' ? ('error' as const) : undefined, onRetry: live.gaps.onRetry, content: live.gaps.data ? <GoalGapsCard gaps={live.gaps.data} onRemind={live.gaps.onRemind} /> : null }]
        : []),
      { id: 'teamgoals', title: 'Team goals', size: 12, content: teamGoals.length ? <GoalTree goals={teamGoals} aria-label="Team goals" compact onOpen={(g) => window.location.assign(PERF_LINKS.goal(g.id))} /> : null, empty: teamGoals.length ? undefined : 'No team goals in this period yet' },
    );
  }
  if (persona === 'hr' && h.hr) {
    const c = h.hr.cycles;
    const overdue = c.reduce((a, x) => a + x.overdue, 0);
    const late = c.find((x) => x.overdue > 0);
    const dist = h.hr.ratingDistribution;
    // Last month's figure from the monthly snapshot, when there is one ("vs last period", founder answer b).
    const prev = h.hr.previous ?? null;
    const vs = (n: number | null | undefined) => (prev && n != null ? { previous: n, previousLabel: prev.label } : {});
    widgets.push(
      { id: 's1', title: 'Cycles running', size: 3, bare: true, content: <StatCard label="Cycles running" value={c.filter((x) => x.status === 'launched' || x.status === 'calibrating').length} {...vs(prev?.cyclesRunning)} drill={{ label: `View ${countText(c.length, 'cycle')}`, href: '#cycles' }} /> },
      { id: 's2', title: 'Overdue stages', size: 3, bare: true, content: <StatCard label="Overdue review stages" value={overdue} {...vs(prev?.overdueStages)} drill={{ label: 'View overdue', href: late ? PERF_LINKS.cycle(late.id) : '#cycles' }} /> },
      ...(h.hr.pipsActive != null ? [{ id: 's3', title: 'PIPs active', size: 3 as const, bare: true, content: <StatCard label="PIPs active" value={h.hr.pipsActive} {...vs(prev?.pipsActive)} drill={{ label: `View ${countText(h.hr.pipsActive, 'PIP')}`, href: PERF_LINKS.pips }} /> }] : []),
      { id: 's4', title: 'Goals aligned', size: 3, bare: true, content: <StatCard label="Goals aligned to a parent" value={h.hr.goalsAligned ?? 0} unit="%" {...vs(prev?.goalsAligned)} drill={{ label: 'Open goal map', href: PERF_LINKS.map }} /> },
      {
        id: 'cycles',
        title: 'Review cycles',
        size: 8,
        content: (
          <ul className="yx-growth-list" id="cycles">
            {c.map((x) => (
              <li key={x.id} className="yx-growth-list__item">
                <div className="yx-growth-list__main">
                  <Link href={PERF_LINKS.cycle(x.id)}>{x.name}</Link>
                  <span className="yx-growth-meta">Stage: {x.stage}</span>
                </div>
                <span className="yx-growth-num">
                  {x.done} of {x.eligible} done
                </span>
                {x.overdue > 0 && <Badge tone="danger">{x.overdue} overdue</Badge>}
              </li>
            ))}
          </ul>
        ),
        empty: c.length ? undefined : 'No review cycles yet. Start one from an active template.',
      },
      {
        id: 'dist',
        title: 'Last released ratings',
        size: 4,
        bare: Boolean(dist && dist.rows.length),
        content: dist && dist.rows.length ? <BarChart title={`Ratings by department, ${dist.cycle}`} xLabel="Department" stacked categories={dist.rows.map((d) => d.dept)} groupSizes={dist.rows.map((d) => d.size)} series={dist.bands.map((name, i) => ({ name, values: dist.rows.map((d) => d.counts[i] ?? 0) }))} /> : null,
        empty: dist && dist.rows.length ? undefined : 'No ratings released yet',
      },
    );
  }
  return (
    <GrowthFrame area="performance" active="Performance home" persona={persona}>
      <PageHeader
        title={title}
        description={persona === 'hr' ? 'Cycles, overdue stages and outcomes across the company.' : persona === 'mgr' ? `Good to see you, ${h.name}. Here is what your team needs this week.` : `Good to see you, ${h.name}.`}
        actions={
          persona === 'hr' ? (
            <>
              <Button asChild>
                <a href={PERF_LINKS.map}>
                  <span className="yx-button__label">Open goal map</span>
                </a>
              </Button>
              <Button variant="primary" asChild>
                <a href={PERF_LINKS.newCycle}>
                  <span className="yx-button__label">Start a review cycle</span>
                </a>
              </Button>
            </>
          ) : (
            <Button variant="primary" asChild>
              <a href={PERF_LINKS.feedback}>
                <span className="yx-button__label">Give feedback</span>
              </a>
            </Button>
          )
        }
      />
      <DashboardGrid label={title} widgets={widgets} />
      {sheet}
    </GrowthFrame>
  );
}

/* ================================================================== dialogs shared by PRF-02 and PRF-03 */

type KrDraft = { title: string; unit: string; direction: 'up' | 'down' | 'hit'; start: number | null; target: number | null; weight: number | null };
const DIRECTION = { up: 'Increase to', down: 'Decrease to', hit: 'Reach' } as const;

/** Add a goal, or change one (an approved goal of a person changes only with a reason the manager approves). */
export function GoalFormDrawer({ goal, periodId, ownerTypes, departments, alignOptions, onClose, onSave }: { goal: GoalDetail | null; periodId: string; ownerTypes: ('person' | 'team' | 'company')[]; departments: Choice[]; alignOptions: { id: string; title: string; owner: string }[]; onClose: () => void; onSave: (g: GoalInput) => Promise<unknown> }) {
  const [ownerType, setOwnerType] = useState(goal?.ownerType ?? ownerTypes[0]);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [kind, setKind] = useState<'okr' | 'kpi'>(goal?.kind ?? 'okr');
  const [weight, setWeight] = useState<number | null>(goal?.weight ?? null);
  const [parentId, setParentId] = useState<string | null>(goal?.parentGoalId ?? null);
  const [deptId, setDeptId] = useState<string | null>(goal?.ownerDepartmentId ?? null);
  const [krs, setKrs] = useState<KrDraft[]>(goal?.keyResults.map((k) => ({ title: k.title, unit: k.unit ?? '', direction: k.direction, start: k.start, target: k.target, weight: k.weight })) ?? [{ title: '', unit: '', direction: 'up', start: 0, target: null, weight: 1 }]);
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const changingActive = goal?.status === 'active' && goal.ownerType === 'person';
  const set = (i: number, patch: Partial<KrDraft>) => setKrs((ks) => ks.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const errors = [
    ...(title.trim().length >= 3 ? [] : [{ fieldId: 'gd-title', message: 'Say what the goal is, in at least 3 characters.' }]),
    ...(ownerType === 'team' && !deptId ? [{ fieldId: 'gd-team', message: 'Choose the team.' }] : []),
    ...(ownerType === 'person' && (weight === null || weight < 0 || weight > 100) ? [{ fieldId: 'gd-weight', message: 'Give the weight, from 0 to 100.' }] : []),
    ...(kind === 'okr' && krs.length === 0 ? [{ fieldId: 'gd-krs', message: 'An objective needs at least one key result.' }] : []),
    ...(krs.every((k) => k.title.trim().length >= 2 && k.start !== null && k.target !== null && (k.direction === 'hit' || (k.direction === 'up' ? k.target > k.start : k.target < k.start))) ? [] : [{ fieldId: 'gd-krs', message: 'Each key result needs a name and a target past its start (above it to increase, below it to decrease).' }]),
    ...(changingActive && reason.trim().length < 3 ? [{ fieldId: 'gd-reason', message: 'Say why the goal changes; your manager approves the change.' }] : []),
  ];
  const v = useSaveErrors(errors);
  const save = async () => {
    if (errors.length) {
      v.reveal();
      document.getElementById(errors[0]!.fieldId)?.focus();
      return;
    }
    setSaving(true);
    setFailed(null);
    try {
      await onSave({ periodId, ownerType, ...(ownerType === 'team' ? { ownerDepartmentId: deptId } : {}), parentGoalId: parentId, kind, title: title.trim(), description: description.trim() || null, weight: ownerType === 'person' ? (weight ?? 0) : 0, keyResults: krs.map((k) => ({ title: k.title.trim(), unit: k.unit.trim() || null, direction: k.direction, start: k.start!, target: k.target!, weight: k.weight ?? 1 })), ...(changingActive ? { reason: reason.trim() } : {}), ...(goal ? { version: goal.version } : {}) });
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={goal ? `Edit goal: ${goal.title}` : ownerType === 'person' ? 'Add goal' : ownerType === 'team' ? 'Add team goal' : 'Add company goal'}
      subtitle={changingActive ? 'This goal is approved. The change goes to your manager; until then the goal stays as it is.' : 'Progress is worked out from the key results and can’t be typed in.'}
      footer={
        <div className="yx-growth-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {changingActive ? 'Send the change' : 'Save goal'}
          </Button>
        </div>
      }
    >
      <div className="yx-growth-stack">
        {v.showErrors && <ErrorSummary errors={v.shownErrors} />}
        {failed && (
          <InlineAlert tone="danger" title="Not saved">
            {failed}
          </InlineAlert>
        )}
        {!goal && ownerTypes.length > 1 && (
          <FormField id="gd-owner" label="Whose goal">
            <Segment label="Whose goal" value={ownerType} onChange={setOwnerType} options={ownerTypes.map((o) => ({ value: o, label: o === 'company' ? 'Company' : o === 'team' ? 'A team' : 'Mine' }))} />
          </FormField>
        )}
        <FormField id="gd-title" label="Goal" required error={v.errorOf('gd-title')}>
          <TextField value={title} onChange={setTitle} maxLength={200} />
        </FormField>
        <FormField id="gd-desc" label="Details" optional>
          <TextArea value={description} onChange={setDescription} rows={2} maxLength={1000} />
        </FormField>
        {ownerType === 'team' && (
          <FormField id="gd-team" label="Team" required error={v.errorOf('gd-team')}>
            <Select aria-label="Team" value={deptId} onChange={setDeptId} options={departments} searchable />
          </FormField>
        )}
        <FormField id="gd-kind" label="Kind of goal">
          <Segment label="Kind of goal" value={kind} onChange={setKind} options={[{ value: 'okr', label: 'Objective with key results (OKR)' }, { value: 'kpi', label: 'Target (KPI)' }]} />
        </FormField>
        {ownerType === 'person' && (
          <FormField id="gd-weight" label="Weight" required helper="Your goals’ weights add up to 100% before your manager approves them." error={v.errorOf('gd-weight')}>
            <NumberField value={weight} onChange={setWeight} min={0} max={100} suffix="%" decimals />
          </FormField>
        )}
        <FormField id="gd-parent" label="Aligned to" optional helper="A company or team goal, or your manager’s goal.">
          <Select aria-label="Aligned to" value={parentId} onChange={setParentId} options={alignOptions.filter((o) => o.id !== goal?.id).map((o) => ({ value: o.id, label: `${o.title} (${o.owner})` }))} clearable searchable />
        </FormField>
        <Card title="Key results" actions={krs.length < 10 ? <Button size="sm" icon={Plus} onClick={() => setKrs((ks) => [...ks, { title: '', unit: '', direction: 'up', start: 0, target: null, weight: 1 }])}>Add key result</Button> : undefined}>
          <div id="gd-krs" tabIndex={-1} className="yx-growth-stack">
            {v.errorOf('gd-krs') && (
              <Text as="p" tone="danger" size="sm">
                {v.errorOf('gd-krs')}
              </Text>
            )}
            {krs.length === 0 && (
              <Text as="p" tone="secondary" size="sm">
                No key results: progress is checked in by hand, or comes from the goals aligned to it.
              </Text>
            )}
            {krs.map((k, i) => (
              <div className="yx-growth-kr-row" key={i}>
                <FormField id={`gd-k${i}`} label={`Key result ${i + 1}`}>
                  <TextField value={k.title} onChange={(x) => set(i, { title: x })} maxLength={200} />
                </FormField>
                <FormField id={`gd-kd${i}`} label="How">
                  <Select aria-label={`Key result ${i + 1}: how`} value={k.direction} onChange={(x) => x && set(i, { direction: x as KrDraft['direction'] })} options={(Object.keys(DIRECTION) as KrDraft['direction'][]).map((d) => ({ value: d, label: DIRECTION[d] }))} />
                </FormField>
                <FormField id={`gd-ks${i}`} label="From">
                  <NumberField value={k.start} onChange={(x) => set(i, { start: x })} decimals />
                </FormField>
                <FormField id={`gd-kt${i}`} label="Target">
                  <NumberField value={k.target} onChange={(x) => set(i, { target: x })} decimals />
                </FormField>
                <FormField id={`gd-ku${i}`} label="Unit" optional>
                  <TextField value={k.unit} onChange={(x) => set(i, { unit: x })} maxLength={20} />
                </FormField>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setKrs((ks) => ks.filter((_, j) => j !== i))} aria-label={`Remove key result ${i + 1}`}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>
        {changingActive && (
          <FormField id="gd-reason" label="Why it changes" required error={v.errorOf('gd-reason')}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

/** A short required text (a reason) before an action; at least 3 characters. */
export function PerfReasonDialog({ title, label, confirmLabel, consequence, helper, destructive, min = 3, onClose, onSave }: { title: string; label: string; confirmLabel: string; consequence?: string; helper?: string; destructive?: boolean; min?: number; onClose: () => void; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      consequence={consequence}
      confirmLabel={confirmLabel}
      destructive={destructive}
      onConfirm={async () => {
        setTried(true);
        if (text.trim().length < min) {
          document.getElementById('rd-text')?.focus();
          return false;
        }
        await onSave(text.trim());
        onClose();
      }}
    >
      <FormField id="rd-text" label={label} required helper={helper} error={tried && text.trim().length < min ? `Enter at least ${min} characters.` : null}>
        <TextArea value={text} onChange={setText} rows={3} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

/** Pick one option before an action (a person to cascade to, a parent to suggest, a goal to align). */
export function PerfPickDialog({ title, label, confirmLabel, consequence, options, onClose, onPick }: { title: string; label: string; confirmLabel: string; consequence?: string; options: Choice[]; onClose: () => void; onPick: (value: string) => Promise<unknown> }) {
  const [value, setValue] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={title}
      consequence={consequence}
      confirmLabel={confirmLabel}
      onConfirm={async () => {
        setTried(true);
        if (!value) {
          document.getElementById('pd-value')?.focus();
          return false;
        }
        await onPick(value);
        onClose();
      }}
    >
      <FormField id="pd-value" label={label} required error={tried && !value ? 'Choose one.' : null}>
        <Select aria-label={label} value={value} onChange={setValue} options={options} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

/** HR opens a goal period. */
export function GoalPeriodDialog({ onClose, onSave }: { onClose: () => void; onSave: (p: { name: string; fromOn: string; toOn: string }) => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [tried, setTried] = useState(false);
  const bad = name.trim().length < 2 ? 'gp-name' : !from ? 'gp-from' : !to || dayKey(to) <= dayKey(from) ? 'gp-to' : null;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Add a goal period"
      consequence="People set goals for an open period, for example H2 FY 2026-27."
      confirmLabel="Add period"
      onConfirm={async () => {
        setTried(true);
        if (bad) {
          document.getElementById(bad)?.focus();
          return false;
        }
        await onSave({ name: name.trim(), fromOn: dayKey(from!), toOn: dayKey(to!) });
        onClose();
      }}
    >
      <FormField id="gp-name" label="Name" required error={tried && name.trim().length < 2 ? 'Enter a name of at least 2 characters.' : null}>
        <TextField value={name} onChange={setName} maxLength={80} />
      </FormField>
      <FormField id="gp-from" label="Starts on" required error={tried && !from ? 'Choose the start date.' : null}>
        <DatePicker value={from} onChange={setFrom} aria-label="Period starts on" />
      </FormField>
      <FormField id="gp-to" label="Ends on" required error={!tried ? null : !to ? 'Choose the end date.' : from && dayKey(to) <= dayKey(from) ? 'Choose an end date after the start date.' : null}>
        <DatePicker value={to} onChange={setTo} min={from ?? undefined} aria-label="Period ends on" />
      </FormField>
    </ConfirmDialog>
  );
}

/* ================================================================== PRF-02 · My goals and check-in (live) */

export interface LiveMyGoals {
  state: LoadState;
  onRetry: () => void;
  /** emp: my goals · mgr: one person of my team (the manager approves, sends back, suggests). */
  persona: 'emp' | 'mgr';
  ownerName: string;
  periods: GoalPeriod[];
  periodId: string | null;
  onPeriod: (id: string) => void;
  goals: GoalItem[];
  totalWeight: number | null;
  canDecide: boolean;
  /** The company and team goals of the period, for the alignment view. */
  companyGoals: GoalItem[];
  alignOptions: { id: string; title: string; owner: string }[];
  /** The open goal (drawer), loaded on its own. */
  openGoalId: string | null;
  onOpenGoal: (id: string | null) => void;
  goal: GoalDetail | null;
  /** People the viewer can cascade a goal to (their team). */
  team: Choice[];
  onCreate: (input: GoalInput) => Promise<unknown>;
  onSave: (id: string, input: GoalInput) => Promise<unknown>;
  onSubmit: () => Promise<unknown>;
  onCheckIn: (id: string, input: CheckinInput) => Promise<unknown>;
  onDrop: (id: string, reason: string) => Promise<unknown>;
  onCascade: (id: string, employeeIds: string[]) => Promise<unknown>;
  onDecide: (decision: 'approve' | 'send_back', reason?: string) => Promise<unknown>;
}

type GoalDialog = { kind: 'add' } | { kind: 'edit' } | { kind: 'drop' } | { kind: 'cascade' } | { kind: 'align' } | { kind: 'suggest' } | { kind: 'send-back' } | { kind: 'submit' };

export function LiveMyGoalsScreen({ live, defaultDialog }: { live: LiveMyGoals; defaultDialog?: GoalDialog['kind'] }) {
  const phone = useNarrow();
  const done = useDone();
  const [dialog, setDialog] = useState<GoalDialog | null>(defaultDialog ? { kind: defaultDialog } : null);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  // "Align to a goal": the chosen goal's form opens once the goal is loaded.
  const [editWhenLoaded, setEditWhenLoaded] = useState(false);
  const [busy, setBusy] = useState<'approve' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const period = live.periods.find((p) => p.id === live.periodId) ?? null;
  const all = useMemo(() => [...live.companyGoals, ...live.goals].map((g) => toGoal(g, period?.name)), [live.companyGoals, live.goals, period?.name]);
  const mine = all.filter((g) => live.goals.some((x) => x.id === g.id));
  const w = weightCheck(mine);
  const drafts = live.goals.filter((g) => g.status === 'draft').length;
  const pending = live.goals.filter((g) => g.status === 'submitted').length;
  const open = live.openGoalId ? (all.find((g) => g.id === live.openGoalId) ?? (live.goal ? toGoal({ ...live.goal, confidence: live.goal.checkins[0]?.confidence ?? null, lastCheckIn: live.goal.checkins[0]?.on ?? null }, period?.name) : null)) : null;
  const checking = checkInId ? (all.find((g) => g.id === checkInId) ?? (live.goal && live.goal.id === checkInId ? toGoal({ ...live.goal, confidence: live.goal.checkins[0]?.confidence ?? null, lastCheckIn: live.goal.checkins[0]?.on ?? null }, period?.name) : null)) : null;
  const heading = live.persona === 'mgr' ? `${live.ownerName}’s goals` : 'My goals';
  const detail = live.goal && live.goal.id === live.openGoalId ? live.goal : null;
  const periodSelect = <Select aria-label="Period" value={live.periodId} onChange={(x) => x && live.onPeriod(x)} options={live.periods.map((p) => ({ value: p.id, label: p.name }))} />;

  const decide = async () => {
    if (!w.ok) {
      setFailed(`${w.message} Send the goals back, or ask ${live.ownerName} to change the weights.`);
      return;
    }
    setBusy('approve');
    setFailed(null);
    try {
      await live.onDecide('approve');
      done('Goals approved', `${live.ownerName} is notified. Check-ins can start now.`);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const content = () => {
    if (live.state === 'loading') return <Skeleton height={320} />;
    if (live.state === 'error') return <ErrorState title="Goals didn’t load" description="Try again. Nothing you entered was lost." onRetry={live.onRetry} />;
    if (!live.periods.length) return <EmptyState title="No goal periods yet" description="HR opens goal periods, for example H2 FY 2026-27. Your goals appear here once one is open." />;
    if (mine.length === 0)
      return (
        <EmptyState
          title="No goals for this period yet"
          description={live.persona === 'mgr' ? `${live.ownerName} has no goals in ${period?.name ?? 'this period'} yet. Suggest one from your own goals.` : 'Add 3–5 goals with measurable key results, then align each one to a team or company goal.'}
          action={live.persona === 'mgr' ? <Button icon={Plus} onClick={() => setDialog({ kind: 'suggest' })}>Suggest a goal</Button> : period?.status === 'open' ? <Button icon={Plus} onClick={() => setDialog({ kind: 'add' })}>Add goal</Button> : undefined}
        />
      );
    return (
      <>
        {failed && (
          <InlineAlert tone="danger" title="That didn’t work">
            {failed}
          </InlineAlert>
        )}
        {!w.ok && (
          <InlineAlert tone="warning" title="Goal weights don’t add up">
            {w.message} {live.persona === 'mgr' ? 'Send the goals back or ask for the weights to be changed before approving.' : 'Your manager can’t approve until they do.'}
          </InlineAlert>
        )}
        {live.persona === 'emp' && drafts > 0 && (
          <InlineAlert
            tone="info"
            title={drafts === 1 ? '1 goal is a draft' : `${drafts} goals are drafts`}
            actions={
              <Button size="sm" variant="primary" onClick={() => setDialog({ kind: 'submit' })}>
                Send to my manager
              </Button>
            }
          >
            Your manager sees them once you send them. They go together, so add all your goals first.
          </InlineAlert>
        )}
        {live.persona === 'emp' && pending > 0 && drafts === 0 && (
          <InlineAlert tone="info" title="With your manager">
            {pending === 1 ? 'Your goal is' : `Your ${pending} goals are`} waiting for your manager’s approval.
          </InlineAlert>
        )}
        {live.persona === 'mgr' && live.canDecide && (
          <InlineAlert
            tone="info"
            title={`${live.ownerName} sent ${pending === 1 ? '1 goal' : `${pending} goals`} for approval`}
            actions={
              <>
                <Button size="sm" onClick={() => setDialog({ kind: 'send-back' })}>
                  Send back
                </Button>
                <Button size="sm" variant="approve" icon={Check} loading={busy === 'approve'} onClick={() => void decide()}>
                  Approve goals
                </Button>
              </>
            }
          >
            Check each goal is measurable and aligned before approving.
          </InlineAlert>
        )}
        <Tabs defaultValue="tree">
          <TabsList aria-label="Goal views">
            <TabsTrigger value="tree" count={mine.length}>
              Goals
            </TabsTrigger>
            <TabsTrigger value="align">Alignment</TabsTrigger>
          </TabsList>
          <TabsContent value="tree">
            <GoalTree goals={mine} aria-label={heading} onOpen={(g) => live.onOpenGoal(g.id)} onCheckIn={(g) => (g.status === 'Approved' ? setCheckInId(g.id) : live.onOpenGoal(g.id))} />
            <p className="yx-growth-meta">Weights total {w.total}% · progress is calculated from key results and can’t be typed in.</p>
          </TabsContent>
          <TabsContent value="align">
            <GoalTree goals={all} aria-label="Alignment from company goals down to these" compact onOpen={(g) => live.onOpenGoal(g.id)} />
          </TabsContent>
        </Tabs>
      </>
    );
  };

  const chain = (() => {
    const out: Goal[] = [];
    let cur = open;
    for (let i = 0; cur?.parentId && i < 20; i++) {
      const parent = all.find((g) => g.id === cur!.parentId);
      if (!parent) break;
      out.unshift(parent);
      cur = parent;
    }
    if (!out.length && detail?.parent) out.push({ id: detail.parent.id, title: detail.parent.title, type: 'okr', owner: { type: 'company', name: '' }, weight: 0, period: '', status: 'Approved', keyResults: [], progress: detail.parent.progress });
    return out;
  })();
  const can = detail?.can;
  const drawer = open && (
    <Drawer
      open
      onOpenChange={(o) => !o && live.onOpenGoal(null)}
      title={open.title}
      subtitle={`${open.owner.name || 'Company'} · ${open.type === 'okr' ? 'OKR' : 'KPI'} · weight ${open.weight}%`}
      meta={<Badge tone={open.status === 'Approved' ? 'success' : 'info'}>{open.status}</Badge>}
      size="lg"
      footer={
        detail ? (
          <div className="yx-growth-foot">
            {can?.drop && (
              <Button variant="danger" onClick={() => setDialog({ kind: 'drop' })}>
                Drop goal
              </Button>
            )}
            {can?.cascade && live.team.length > 0 && <Button onClick={() => setDialog({ kind: 'cascade' })}>Cascade to my team</Button>}
            {can?.edit && <Button onClick={() => setDialog({ kind: 'edit' })}>{detail.status === 'active' && detail.ownerType === 'person' ? 'Ask to change' : 'Edit goal'}</Button>}
            {can?.checkIn && (
              <Button variant="primary" onClick={() => setCheckInId(open.id)}>
                Check in
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {!detail ? (
        <Skeleton height={240} />
      ) : (
        <div className="yx-growth-stack">
          {Boolean(detail.pendingChange) && (
            <InlineAlert tone="info" title="A change is waiting for the manager">
              The goal stays as it is until the change is approved.
            </InlineAlert>
          )}
          {detail.decisionNote && (
            <InlineAlert tone="info" title="Manager’s note">
              {detail.decisionNote}
            </InlineAlert>
          )}
          {chain.length > 0 && (
            <section aria-label="Aligned to">
              <h3 className="yx-growth-h">Aligned to</h3>
              <ol className="yx-growth-list">
                {chain.map((c) => (
                  <li key={c.id} className="yx-growth-list__item">
                    <ProgressRing value={goalProgress(c, all)} label={c.title} size="sm" />
                    <span className="yx-growth-list__main">
                      <span className="yx-growth-list__title">{c.title}</span>
                      <span className="yx-growth-meta">{c.owner.type === 'company' ? 'Company goal' : c.owner.name}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section aria-label="Key results">
            <h3 className="yx-growth-h">Key results</h3>
            {open.keyResults.length === 0 ? (
              <Text tone="secondary">{detail.children.length ? 'No key results: progress comes from the goals aligned to it.' : 'No key results: progress is checked in by hand.'}</Text>
            ) : (
              <ul className="yx-growth-list">
                {open.keyResults.map((kr) => (
                  <li key={kr.id} className="yx-growth-list__item">
                    <ProgressRing value={krProgress(kr)} label={kr.title} size="md" />
                    <span className="yx-growth-list__main">
                      <span className="yx-growth-list__title">{kr.title}</span>
                      <span className="yx-growth-meta">
                        {kr.actual} of {kr.target} {kr.unit} · started at {kr.start} · {kr.direction === 'decrease' ? 'lower is better' : 'higher is better'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {detail.children.length > 0 && (
            <section aria-label="Goals aligned to this one">
              <h3 className="yx-growth-h">Goals aligned to this one</h3>
              <ul className="yx-growth-list">
                {detail.children.map((c) => (
                  <li key={c.id} className="yx-growth-list__item">
                    <ProgressRing value={Math.round(c.progress)} label={c.title} size="sm" />
                    <span className="yx-growth-list__main">
                      <Link
                        href={PERF_LINKS.goal(c.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          live.onOpenGoal(c.id);
                        }}
                      >
                        {c.title}
                      </Link>
                      <span className="yx-growth-meta">{c.owner}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-label="Check-ins">
            <h3 className="yx-growth-h">Check-ins</h3>
            {detail.checkins.length === 0 ? (
              <Text tone="secondary">No check-ins yet.</Text>
            ) : (
              <Timeline today={new Date()} aria-label="Check-ins" items={detail.checkins.map<TimelineItem>((c) => ({ id: c.id, actor: { name: `${Math.round(c.progress)}% · ${CONFIDENCE[c.confidence]}` }, action: c.note ?? 'Checked in', at: day(c.on) }))} />
            )}
          </section>
        </div>
      )}
    </Drawer>
  );

  const dialogs = (
    <>
      {dialog?.kind === 'add' && live.periodId && (
        <GoalFormDrawer
          goal={null}
          periodId={live.periodId}
          ownerTypes={['person']}
          departments={[]}
          alignOptions={live.alignOptions}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            await live.onCreate(input);
            done('Goal added', 'It stays a draft until you send your goals to your manager.');
          }}
        />
      )}
      {(dialog?.kind === 'edit' || editWhenLoaded) && detail && (
        <GoalFormDrawer
          goal={detail}
          periodId={detail.periodId}
          ownerTypes={[detail.ownerType]}
          departments={[]}
          alignOptions={live.alignOptions}
          onClose={() => {
            setDialog(null);
            setEditWhenLoaded(false);
          }}
          onSave={async (input) => {
            await live.onSave(detail.id, input);
            done(detail.status === 'active' && detail.ownerType === 'person' ? 'Change sent to your manager' : 'Goal saved');
          }}
        />
      )}
      {dialog?.kind === 'drop' && detail && (
        <PerfReasonDialog
          title={`Drop “${detail.title}”?`}
          consequence="It stays on record as dropped. Goals aligned to it keep working without a parent."
          label="Why"
          confirmLabel="Drop goal"
          destructive
          onClose={() => setDialog(null)}
          onSave={async (reason) => {
            await live.onDrop(detail.id, reason);
            live.onOpenGoal(null);
            done('Goal dropped');
          }}
        />
      )}
      {dialog?.kind === 'cascade' && detail && (
        <PerfPickDialog
          title={`Cascade “${detail.title}”`}
          consequence="They get a draft copy aligned to this goal, to change and send to you."
          label="To"
          confirmLabel="Cascade"
          options={live.team}
          onClose={() => setDialog(null)}
          onPick={async (id) => {
            await live.onCascade(detail.id, [id]);
            done('Goal cascaded', `${live.team.find((t) => t.value === id)?.label ?? 'They'} has a draft copy to change and send.`);
          }}
        />
      )}
      {dialog?.kind === 'suggest' && (
        <PerfPickDialog
          title={`Suggest a goal to ${live.ownerName}`}
          consequence={`${live.ownerName} gets a draft copy aligned to it, to change and send to you.`}
          label="Goal to suggest"
          confirmLabel="Suggest"
          options={live.alignOptions.map((o) => ({ value: o.id, label: `${o.title} (${o.owner})` }))}
          onClose={() => setDialog(null)}
          onPick={async (goalId) => {
            const who = live.goals[0]?.ownerEmployeeId;
            if (!who) throw new Error(`Open ${live.ownerName}’s goals from your team first.`);
            await live.onCascade(goalId, [who]);
            done('Goal suggested', `${live.ownerName} has a draft copy to change and send.`);
          }}
        />
      )}
      {dialog?.kind === 'align' && (
        <PerfPickDialog
          title="Align to a goal"
          consequence="Choose which of your goals to align. Its form opens with “Aligned to” to fill in."
          label="Your goal"
          confirmLabel="Choose"
          options={live.goals.filter((g) => g.status === 'draft' || g.status === 'active').map((g) => ({ value: g.id, label: g.title }))}
          onClose={() => setDialog(null)}
          onPick={async (id) => {
            live.onOpenGoal(id);
            setEditWhenLoaded(true);
          }}
        />
      )}
      {dialog?.kind === 'send-back' && (
        <PerfReasonDialog
          title={`Send ${live.ownerName}’s goals back?`}
          consequence={`They become drafts again for ${live.ownerName} to change and send.`}
          label="What to change"
          confirmLabel="Send back"
          onClose={() => setDialog(null)}
          onSave={async (reason) => {
            await live.onDecide('send_back', reason);
            done('Goals sent back', `${live.ownerName} is notified with what to change.`);
          }}
        />
      )}
      {dialog?.kind === 'submit' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={drafts === 1 ? 'Send your goal to your manager?' : `Send your ${drafts} goals to your manager?`}
          consequence={w.ok ? 'They go together. You can’t change them while your manager looks at them.' : `${w.message} Your manager can send them back for that.`}
          confirmLabel="Send"
          onConfirm={async () => {
            await live.onSubmit();
            done(drafts === 1 ? 'Goal sent' : 'Goals sent', 'Your manager is notified.');
          }}
        />
      )}
      {checking && (
        <GoalCheckInSheet
          goal={checking}
          device={phone ? 'phone' : 'desktop'}
          open
          onOpenChange={(o) => !o && setCheckInId(null)}
          onSave={async (a, c, n, p) => {
            await live.onCheckIn(checking.id, checkinInput(checking, a, c, n, p));
            done('Check-in saved', live.persona === 'mgr' ? `${live.ownerName} sees it in the goal.` : 'Your manager is notified.');
          }}
        />
      )}
    </>
  );

  if (phone)
    return (
      <GrowthFrame area="performance" active="Goals" persona={live.persona} device="phone" phone={{ title: heading, back: true }}>
        {periodSelect}
        {live.state === 'ready' && mine.length > 0 ? (
          <ul className="yx-growth-list">
            {mine.map((g) => (
              <li key={g.id} className="yx-growth-list__item">
                <ProgressRing value={goalProgress(g)} label={g.title} size="md" tone={g.confidence === 'At risk' ? 'warning' : 'default'} />
                <div className="yx-growth-list__main">
                  <span className="yx-growth-list__title">{g.title}</span>
                  <span className="yx-growth-meta">
                    {g.keyResults.length} key results · {g.confidence ?? 'No check-in yet'}
                  </span>
                </div>
                <Button size="sm" onClick={() => (g.status === 'Approved' ? setCheckInId(g.id) : live.onOpenGoal(g.id))}>
                  {g.status === 'Approved' ? 'Check in' : 'Open'}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          content()
        )}
        {drawer}
        {dialogs}
      </GrowthFrame>
    );

  return (
    <GrowthFrame area="performance" active="Goals" persona={live.persona}>
      <PageHeader
        title={heading}
        description={period ? `${period.name} (${formatDate(day(period.fromOn))} – ${formatDate(day(period.toOn))})` : undefined}
        facts={mine.length ? `${countText(mine.length, 'goal')} · weights ${w.total}% · ${countText(mine.reduce((a, g) => a + g.keyResults.length, 0), 'key result')}` : undefined}
        actions={
          <>
            {live.periods.length > 0 && periodSelect}
            {live.state === 'ready' &&
              period?.status === 'open' &&
              (live.persona === 'emp' ? (
                <>
                  {mine.length > 0 && <Button onClick={() => setDialog({ kind: 'align' })}>Align to a goal</Button>}
                  <Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'add' })}>
                    Add goal
                  </Button>
                </>
              ) : (
                <Button icon={Plus} onClick={() => setDialog({ kind: 'suggest' })}>
                  Suggest a goal
                </Button>
              ))}
          </>
        }
      />
      {content()}
      {drawer}
      {dialogs}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-03 · Company goal map (live) */

export interface LiveGoalMap {
  state: LoadState;
  onRetry: () => void;
  /** hr: manages goals (adds company goals, suggests parents, opens periods) · exec: reads the map. */
  persona: 'hr' | 'exec';
  periods: GoalPeriod[];
  periodId: string | null;
  onPeriod: (id: string) => void;
  departments: Choice[];
  map: { goals: GoalItem[]; unaligned: string[]; offTrack: string[] } | null;
  alignOptions: { id: string; title: string; owner: string }[];
  onOpenGoal: (id: string) => void;
  onCreate: (input: GoalInput) => Promise<unknown>;
  onSuggestParent: (goalId: string, parentGoalId: string) => Promise<unknown>;
  onAddPeriod: (p: { name: string; fromOn: string; toOn: string }) => Promise<unknown>;
}

/** The map as a spreadsheet: every goal with its owner, progress, confidence and parent. */
export function goalMapCsv(goals: GoalItem[]): string {
  const title = new Map(goals.map((g) => [g.id, g.title]));
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = goals.map((g) => [g.title, g.ownerType === 'company' ? 'Company' : g.owner, g.ownerType, g.kind.toUpperCase(), `${Math.round(g.progress)}`, g.confidence ? CONFIDENCE[g.confidence] : '', g.parentGoalId ? (title.get(g.parentGoalId) ?? '') : ''].map(q).join(','));
  return ['Goal,Owner,Owner type,Kind,Progress %,Confidence,Aligned to', ...rows].join('\r\n');
}

export function LiveCompanyGoalMap({ live, defaultDialog }: { live: LiveGoalMap; defaultDialog?: 'add' | 'period' }) {
  const done = useDone();
  const [dept, setDept] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'add' } | { kind: 'period' } | { kind: 'suggest'; goalId: string } | null>(defaultDialog ? { kind: defaultDialog } : null);
  const period = live.periods.find((p) => p.id === live.periodId) ?? null;
  const all = live.map?.goals ?? [];
  // A department shows its own goals and the goals above them, so the tree keeps its roots.
  const shown = useMemo(() => {
    if (!dept) return all;
    const byId = new Map(all.map((g) => [g.id, g]));
    const keep = new Set<string>();
    for (const g of all.filter((x) => x.departmentId === dept)) for (let at: string | null = g.id, i = 0; at && i < 20; i++, at = byId.get(at)?.parentGoalId ?? null) keep.add(at);
    return all.filter((g) => keep.has(g.id));
  }, [all, dept]);
  const goals = shown.map((g) => toGoal(g, period?.name));
  const company = goals.filter((g) => g.owner.type === 'company');
  const unalignedIds = new Set(live.map?.unaligned ?? []);
  const unaligned = goals.filter((g) => unalignedIds.has(g.id));
  const offTrack = goals.filter((g) => g.confidence === 'Off track' || g.confidence === 'At risk');
  const nonCompany = goals.filter((g) => g.owner.type !== 'company');
  const aligned = nonCompany.filter((g) => g.parentId).length;
  const deptName = live.departments.find((d) => d.value === dept)?.label;
  const exportCsv = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([goalMapCsv(shown)], { type: 'text/csv' }));
    a.download = `goal-map-${(period?.name ?? 'period').replace(/\s+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    done('Goal map exported', `${countText(shown.length, 'goal')} in the file.`);
  };
  return (
    <GrowthFrame area="performance" active="Goals" persona={live.persona === 'exec' ? 'mgr' : 'hr'}>
      <PageHeader
        title="Company goal map"
        description={`${period?.name ?? 'Goals'} · company goals and everything aligned to them. Progress rolls up by weight from key results.`}
        actions={
          <>
            {live.periods.length > 0 && <Select aria-label="Period" value={live.periodId} onChange={(x) => x && live.onPeriod(x)} options={live.periods.map((p) => ({ value: p.id, label: p.name }))} />}
            <Select aria-label="Department" placeholder="All departments" clearable value={dept} onChange={setDept} options={live.departments} />
            <Button icon={Download} onClick={exportCsv}>
              Export
            </Button>
            {live.persona === 'hr' && <Button onClick={() => setDialog({ kind: 'period' })}>Add period</Button>}
            {live.persona === 'hr' && period?.status === 'open' && (
              <Button variant="primary" icon={Target} onClick={() => setDialog({ kind: 'add' })}>
                Add company goal
              </Button>
            )}
          </>
        }
      />
      {live.state === 'loading' ? (
        <Skeleton height={360} />
      ) : live.state === 'error' ? (
        <ErrorState title="The goal map didn’t load" onRetry={live.onRetry} />
      ) : !live.periods.length ? (
        <EmptyState title="No goal periods yet" description={live.persona === 'hr' ? 'Add a period, for example H2 FY 2026-27, then add 3–5 company goals.' : 'HR opens goal periods. Check back soon.'} action={live.persona === 'hr' ? <Button onClick={() => setDialog({ kind: 'period' })}>Add period</Button> : undefined} />
      ) : company.length === 0 && goals.length === 0 ? (
        <EmptyState title={`No company goals for ${period?.name ?? 'this period'}`} description="Add 3–5 company goals first. Teams and people then align their goals to them." action={live.persona === 'hr' && period?.status === 'open' ? <Button icon={Target} onClick={() => setDialog({ kind: 'add' })}>Add company goal</Button> : undefined} />
      ) : (
        <>
          <div className="yx-growth-kpis">
            <StatCard label="Company goals" value={company.length} drill={{ label: 'View company goals', href: '#map' }} />
            <StatCard label="Goals aligned" value={nonCompany.length ? Math.round((aligned / nonCompany.length) * 100) : 0} unit="%" drill={{ label: `View ${countText(aligned, 'aligned goal')}`, href: '#map' }} />
            <StatCard label="At risk or off track" value={offTrack.length} drill={{ label: `View ${countText(offTrack.length, 'goal')}`, href: '#risk' }} />
            <StatCard label="Unaligned goals" value={unaligned.length} drill={{ label: `View ${countText(unaligned.length, 'goal')}`, href: '#unaligned' }} />
          </div>
          <div className="yx-growth-split">
            <div className="yx-growth-split__main" id="map">
              <Card title={deptName ? `Goal map · ${deptName}` : 'Goal map'}>
                <GoalTree goals={goals} aria-label="Company goal map" compact onOpen={(g) => live.onOpenGoal(g.id)} />
              </Card>
            </div>
            <aside className="yx-growth-split__side">
              <Card title="Not aligned yet">
                {unaligned.length === 0 ? (
                  <Text tone="secondary">Every goal is aligned.</Text>
                ) : (
                  <ul className="yx-growth-list" id="unaligned">
                    {unaligned.map((g) => (
                      <li key={g.id} className="yx-growth-list__item">
                        <div className="yx-growth-list__main">
                          <span className="yx-growth-list__title">{g.title}</span>
                          <span className="yx-growth-meta">{g.owner.name}</span>
                        </div>
                        {live.persona === 'hr' && (
                          <Button size="sm" onClick={() => setDialog({ kind: 'suggest', goalId: g.id })}>
                            Suggest parent
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="At risk or off track">
                {offTrack.length === 0 ? (
                  <Text tone="secondary">No goal is at risk or off track.</Text>
                ) : (
                  <ul className="yx-growth-list" id="risk">
                    {offTrack.map((g) => (
                      <li key={g.id} className="yx-growth-list__item">
                        <ProgressRing value={goalProgress(g, goals)} label={g.title} size="sm" tone={g.confidence === 'Off track' ? 'danger' : 'warning'} />
                        <div className="yx-growth-list__main">
                          <span className="yx-growth-list__title">{g.title}</span>
                          <span className="yx-growth-meta">
                            {g.owner.name} · {g.confidence}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>
        </>
      )}
      {dialog?.kind === 'add' && live.periodId && (
        <GoalFormDrawer
          goal={null}
          periodId={live.periodId}
          ownerTypes={['company', 'team']}
          departments={live.departments}
          alignOptions={live.alignOptions}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            await live.onCreate(input);
            done(input.ownerType === 'team' ? 'Team goal added' : 'Company goal added', 'People can align their goals to it now.');
          }}
        />
      )}
      {dialog?.kind === 'period' && (
        <GoalPeriodDialog
          onClose={() => setDialog(null)}
          onSave={async (p) => {
            await live.onAddPeriod(p);
            done('Goal period added', `${p.name} is open for goals.`);
          }}
        />
      )}
      {dialog?.kind === 'suggest' && (
        <PerfPickDialog
          title="Suggest a parent goal"
          consequence={`${all.find((g) => g.id === dialog.goalId)?.owner ?? 'The owner'} is told and changes their goal if they agree.`}
          label="Align it to"
          confirmLabel="Send suggestion"
          options={all.filter((g) => g.ownerType !== 'person' && g.id !== dialog.goalId).map((g) => ({ value: g.id, label: `${g.title} (${g.ownerType === 'company' ? 'Company' : g.owner})` }))}
          onClose={() => setDialog(null)}
          onPick={async (parent) => {
            await live.onSuggestParent(dialog.goalId, parent);
            done('Suggestion sent');
          }}
        />
      )}
    </GrowthFrame>
  );
}
