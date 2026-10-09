// Performance: home (PRF-01), my goals + check-in (PRF-02), company goal map (PRF-03), manager coach card (PRF-16).
import { useMemo, useState } from 'react';
import { Check, MessageSquarePlus, Plus, Target } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Heading, Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DashboardGrid, NeedsActionList, type ActionItem, type DashboardWidget } from '../../components/dashboard';
import { BarChart, StatCard } from '../../components/charts';
import { DataTable, type TableColumn } from '../../components/table';
import { Drawer } from '../../components/drawer';
import { BottomSheet } from '../../components/overlay';
import { FormField } from '../../components/field';
import { NumberField, TextArea } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { formatDate } from '../../lib/format';
import { TODAY } from '../_kit/data';
import { CoachCard, GoalTree, GrowthFrame, ProgressRing, StageTrack, type CoachNudge, type Device, type StageItem } from './growth-kit';
import { goalProgress, krProgress, weightCheck, type Goal, type GoalConfidence } from './growth-logic';
import './growth.css';

export type LoadState = 'ready' | 'loading' | 'error' | 'empty';

/* ================================================================== PRF-01 · Performance home (+ PRF-16 coach card) */

export interface TeamMemberPerf {
  id: string;
  name: string;
  role: string;
  goalProgress: number | null;
  reviewStage: string;
  lastOneOnOne: Date | null;
  lastFeedback: Date | null;
}

export interface CycleSummary {
  id: string;
  name: string;
  stage: string;
  eligible: number;
  done: number;
  overdue: number;
}

export interface PerformanceHomeProps {
  persona: 'emp' | 'mgr' | 'hr';
  device?: Device;
  state?: LoadState;
  name: string;
  actions: ActionItem[];
  goals: Goal[];
  stages?: StageItem[];
  feedback?: { id: string; from: string; text: string; at: Date; kind: 'Praise' | 'Suggestion' }[];
  nextOneOnOne?: { with: string; at: Date; agenda: number };
  team?: TeamMemberPerf[];
  coach?: { nudges: CoachNudge[]; weekOf: Date; optedOut?: boolean };
  cycles?: CycleSummary[];
  ratingDistribution?: { dept: string; counts: number[]; size: number }[];
}

const dateOrNever = (d: Date | null) => (d ? formatDate(d) : 'Never');

function TeamTable({ team }: { team: TeamMemberPerf[] }) {
  const cols: TableColumn<TeamMemberPerf>[] = [
    { key: 'name', header: 'Team member', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.role }), width: 220 },
    { key: 'goals', header: 'Goal progress', type: 'number', value: (r) => r.goalProgress, render: (r) => (r.goalProgress == null ? 'No goals yet' : `${r.goalProgress}%`), width: 130 },
    { key: 'stage', header: 'Review stage', type: 'status', value: (r) => r.reviewStage, statusTone: (v) => (String(v).includes('overdue') ? 'danger' : String(v).includes('Done') ? 'success' : 'info'), width: 190 },
    { key: 'oneonone', header: 'Last 1:1', type: 'date', value: (r) => r.lastOneOnOne, render: (r) => dateOrNever(r.lastOneOnOne), width: 130 },
    { key: 'feedback', header: 'Last feedback', type: 'date', value: (r) => r.lastFeedback, render: (r) => dateOrNever(r.lastFeedback), width: 140 },
  ];
  return <DataTable label="My team" columns={cols} rows={team} getRowId={(r) => r.id} />;
}

function MyGoalsMini({ goals, onCheckIn }: { goals: Goal[]; onCheckIn?: (g: Goal) => void }) {
  const mine = goals.filter((g) => g.owner.type === 'person');
  if (mine.length === 0) return <EmptyState compact title="No goals for this period yet" description="Add your goals and align them to your team’s goals." action={<Button icon={Plus}>Add goal</Button>} />;
  return (
    <ul className="yx-growth-list">
      {mine.map((g) => (
        <li key={g.id} className="yx-growth-list__item">
          <ProgressRing value={goalProgress(g, goals)} label={g.title} size="md" tone={g.confidence === 'At risk' ? 'warning' : g.confidence === 'Off track' ? 'danger' : 'default'} />
          <div className="yx-growth-list__main">
            <span className="yx-growth-list__title">{g.title}</span>
            <span className="yx-growth-meta">
              Weight {g.weight}% · last check-in {g.lastCheckIn ? formatDate(g.lastCheckIn) : 'none yet'}
            </span>
          </div>
          {g.confidence && <Badge tone={g.confidence === 'On track' ? 'success' : g.confidence === 'At risk' ? 'warning' : 'danger'}>{g.confidence}</Badge>}
          {onCheckIn && (
            <Button size="sm" onClick={() => onCheckIn(g)}>
              Check in
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function FeedbackMini({ items }: { items: NonNullable<PerformanceHomeProps['feedback']> }) {
  if (items.length === 0) return <EmptyState compact title="No feedback received this quarter" />;
  return (
    <ul className="yx-growth-list">
      {items.map((f) => (
        <li key={f.id} className="yx-growth-list__item">
          <PersonLabel name={f.from} secondary={formatDate(f.at)} />
          <Badge tone={f.kind === 'Praise' ? 'success' : 'info'}>{f.kind}</Badge>
          <p className="yx-growth-p yx-growth-grow">{f.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** PRF-01 Performance home (T6, role-based). Manager home carries the PRF-16 coach card. */
export function PerformanceHomeScreen(p: PerformanceHomeProps) {
  const { persona, device = 'desktop', state = 'ready' } = p;
  const [checkIn, setCheckIn] = useState<Goal | null>(null);
  const title = persona === 'hr' ? 'Performance' : persona === 'mgr' ? 'Performance · my team' : 'My performance';

  if (state === 'loading')
    return (
      <GrowthFrame area="performance" active="Performance home" persona={persona} device={device} phone={{ title: 'Performance' }}>
        <PageHeader title={title} />
        <NeedsActionList items={[]} viewAllHref="#inbox" loading today={TODAY} />
        <div className="yx-growth-kpis">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      </GrowthFrame>
    );
  if (state === 'error')
    return (
      <GrowthFrame area="performance" active="Performance home" persona={persona} device={device} phone={{ title: 'Performance' }}>
        <PageHeader title={title} />
        <ErrorState title="Your performance home didn’t load" description="Check your connection and try again. Your goals and reviews are safe." onRetry={() => {}} reference="PRF-HOME-5021" />
      </GrowthFrame>
    );
  if (state === 'empty')
    return (
      <GrowthFrame area="performance" active="Performance home" persona={persona} device={device} phone={{ title: 'Performance' }}>
        <PageHeader title={title} />
        <EmptyState
          title={persona === 'hr' ? 'No review cycle is running' : 'Nothing to do in performance yet'}
          description={persona === 'hr' ? 'Start a cycle to set goals and run reviews. Shipped templates: annual, half-yearly, probation and OKR quarterly.' : 'When your company starts a goal period or review cycle, your goals and reviews appear here.'}
          action={persona === 'hr' ? <Button variant="primary">Start a review cycle</Button> : <Button icon={MessageSquarePlus}>Give feedback</Button>}
        />
      </GrowthFrame>
    );

  const checkInSheet = checkIn && <GoalCheckInSheet goal={checkIn} device={device} open onOpenChange={(o) => !o && setCheckIn(null)} />;

  if (device === 'phone') {
    return (
      <GrowthFrame area="performance" active="Performance home" persona={persona} device="phone" phone={{ tab: persona === 'mgr' ? 'home' : 'me', title: persona === 'mgr' ? 'Team performance' : 'Goals & reviews' }}>
        {persona === 'mgr' && p.coach && <CoachCard nudges={p.coach.nudges} weekOf={p.coach.weekOf} optedOut={p.coach.optedOut} />}
        <NeedsActionList items={p.actions} viewAllHref="#inbox" today={TODAY} title="To do" />
        {persona === 'emp' && (
          <>
            {p.stages && (
              <section className="yx-growth-panel" aria-label="My review">
                <h2 className="yx-growth-h">Half-yearly review</h2>
                <StageTrack stages={p.stages} nextStep="360° feedback from your nominated reviewers" />
              </section>
            )}
            <section className="yx-growth-panel" aria-label="My goals">
              <h2 className="yx-growth-h">My goals</h2>
              <MyGoalsMini goals={p.goals} onCheckIn={setCheckIn} />
            </section>
          </>
        )}
        {persona === 'mgr' && p.team && (
          <section className="yx-growth-panel" aria-label="My team">
            <h2 className="yx-growth-h">My team</h2>
            <ul className="yx-growth-list">
              {p.team.map((t) => (
                <li key={t.id} className="yx-growth-list__item">
                  <PersonLabel name={t.name} secondary={`${t.reviewStage} · goals ${t.goalProgress ?? '—'}${t.goalProgress == null ? '' : '%'}`} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="yx-growth-pinned">
          <Button variant="primary" fullWidth icon={MessageSquarePlus}>
            Give feedback
          </Button>
        </div>
        {checkInSheet}
      </GrowthFrame>
    );
  }

  const widgets: DashboardWidget[] = [
    { id: 'actions', title: 'Needs your action', size: 12, pinned: true, bare: true, content: <NeedsActionList items={p.actions} viewAllHref="#inbox" today={TODAY} onReview={() => {}} onApprove={() => {}} /> },
  ];
  if (persona === 'emp') {
    widgets.push(
      { id: 'review', title: 'My review · Half-yearly H1 FY 2026-27', size: 12, content: p.stages ? <StageTrack stages={p.stages} nextStep="360° feedback from your nominated reviewers" /> : null, empty: p.stages ? undefined : 'No review running for you' },
      { id: 'goals', title: 'My goals · Apr–Sep 2026', size: 8, content: <MyGoalsMini goals={p.goals} onCheckIn={setCheckIn} />, actions: <Link href="#goals">View all goals</Link> },
      {
        id: 'oneonone',
        title: 'Next 1:1',
        size: 4,
        content: p.nextOneOnOne ? (
          <div className="yx-growth-stack" data-gap="sm">
            <PersonLabel name={p.nextOneOnOne.with} secondary="Your manager" />
            <Text>{formatDate(p.nextOneOnOne.at)}, 4:00 pm</Text>
            <Text tone="secondary">{p.nextOneOnOne.agenda} agenda items so far</Text>
            <Button size="sm">Add to agenda</Button>
          </div>
        ) : null,
        empty: p.nextOneOnOne ? undefined : 'No 1:1 scheduled',
      },
      { id: 'feedback', title: 'Feedback received', size: 12, content: <FeedbackMini items={p.feedback ?? []} />, actions: <Button size="sm" icon={MessageSquarePlus}>Give feedback</Button> },
    );
  }
  if (persona === 'mgr') {
    widgets.push(
      { id: 'coach', title: 'Manager coach', size: 4, bare: true, content: p.coach ? <CoachCard nudges={p.coach.nudges} weekOf={p.coach.weekOf} optedOut={p.coach.optedOut} /> : null },
      { id: 'team', title: 'My team', size: 8, content: <TeamTable team={p.team ?? []} /> },
      { id: 'teamgoals', title: 'Team goal', size: 12, content: <GoalTree goals={p.goals} aria-label="Team goals" compact /> },
    );
  }
  if (persona === 'hr') {
    const c = p.cycles ?? [];
    widgets.push(
      { id: 's1', title: 'Cycles running', size: 3, bare: true, content: <StatCard label="Cycles running" value={c.length} drill={{ label: `View ${c.length} cycles`, href: '#cycles' }} /> },
      { id: 's2', title: 'Overdue stages', size: 3, bare: true, content: <StatCard label="Overdue review stages" value={c.reduce((a, x) => a + x.overdue, 0)} previous={52} previousLabel="last week" drill={{ label: 'View overdue', href: '#overdue' }} /> },
      { id: 's3', title: 'PIPs active', size: 3, bare: true, content: <StatCard label="PIPs active" value={3} previous={4} previousLabel="August" drill={{ label: 'View 3 PIPs', href: '#pips' }} /> },
      { id: 's4', title: 'Goals aligned', size: 3, bare: true, content: <StatCard label="Goals aligned to a parent" value={82} unit="%" previous={74} previousLabel="last period" drill={{ label: 'Open goal map', href: '#map' }} /> },
      {
        id: 'cycles',
        title: 'Review cycles',
        size: 8,
        content: (
          <ul className="yx-growth-list">
            {c.map((x) => (
              <li key={x.id} className="yx-growth-list__item">
                <div className="yx-growth-list__main">
                  <Link href={`#cycle-${x.id}`}>{x.name}</Link>
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
      },
      {
        id: 'dist',
        title: 'Last released ratings',
        size: 4,
        bare: true,
        content: (
          <BarChart
            title="Ratings by department, FY 2025-26"
            xLabel="Department"
            stacked
            categories={(p.ratingDistribution ?? []).map((d) => d.dept)}
            groupSizes={(p.ratingDistribution ?? []).map((d) => d.size)}
            series={['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'].map((name, i) => ({ name, values: (p.ratingDistribution ?? []).map((d) => d.counts[i]) }))}
          />
        ),
      },
    );
  }

  return (
    <GrowthFrame area="performance" active="Performance home" persona={persona} counts={{ 'Reviews & cycles': persona === 'emp' ? 1 : 4 }}>
      <PageHeader
        title={title}
        description={persona === 'hr' ? 'Cycles, overdue stages and outcomes across Kaveri Foods.' : persona === 'mgr' ? `Good morning, ${p.name}. Here is what your team needs this week.` : `Good morning, ${p.name}.`}
        actions={
          persona === 'hr' ? (
            <>
              <Button>Open goal map</Button>
              <Button variant="primary">Start a review cycle</Button>
            </>
          ) : (
            <Button variant="primary" icon={MessageSquarePlus}>
              Give feedback
            </Button>
          )
        }
      />
      <DashboardGrid label={title} widgets={widgets} />
      {checkInSheet}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-02 · My goals + goal check-in */

export interface CheckIn {
  id: string;
  by: string;
  at: Date;
  text: string;
}

export interface GoalCheckInSheetProps {
  goal: Goal;
  device?: Device;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave?: (actuals: Record<string, number>, confidence: GoalConfidence, note: string) => void;
}

/** PRF-02 goal check-in (T4): new actual per key result, confidence, note; live effect on progress. */
export function GoalCheckInSheet({ goal, device = 'desktop', open, onOpenChange, onSave }: GoalCheckInSheetProps) {
  const [actuals, setActuals] = useState<Record<string, number | null>>(Object.fromEntries(goal.keyResults.map((k) => [k.id, k.actual])));
  const [confidence, setConfidence] = useState<GoalConfidence>(goal.confidence ?? 'On track');
  const [note, setNote] = useState('');
  const before = goalProgress(goal);
  const after = goalProgress({ ...goal, keyResults: goal.keyResults.map((k) => ({ ...k, actual: actuals[k.id] ?? k.actual })) });
  const body = (
    <div className="yx-growth-stack">
      {goal.keyResults.map((kr) => (
        <FormField key={kr.id} label={kr.title} helper={`Start ${kr.start} · target ${kr.target} ${kr.unit} · now ${kr.actual}`}>
          <NumberField value={actuals[kr.id] ?? null} onChange={(v) => setActuals((a) => ({ ...a, [kr.id]: v }))} suffix={kr.unit} decimals />
        </FormField>
      ))}
      <FormField label="How confident are you of reaching this goal?">
        <RadioGroup
          aria-label="Confidence"
          orientation="horizontal"
          value={confidence}
          onChange={(v) => setConfidence(v as GoalConfidence)}
          options={[
            { value: 'On track', label: 'On track' },
            { value: 'At risk', label: 'At risk' },
            { value: 'Off track', label: 'Off track' },
          ]}
        />
      </FormField>
      <FormField label="What happened since the last check-in?" optional helper="Your manager sees this in the goal and in your next 1:1.">
        <TextArea value={note} onChange={setNote} rows={3} />
      </FormField>
      <div className="yx-growth-effect" aria-live="polite">
        <span className="yx-growth-effect__title">What this check-in changes</span>
        <ul>
          <li>
            Goal progress: {before ?? 0}% → <strong>{after ?? 0}%</strong> (calculated from key results)
          </li>
          {goal.keyResults.map((kr) => {
            const a = actuals[kr.id];
            return a != null && a !== kr.actual ? (
              <li key={kr.id}>
                {kr.title}: {krProgress(kr)}% → {krProgress({ ...kr, actual: a })}%
              </li>
            ) : null;
          })}
          <li>Confidence: {confidence}</li>
          <li>{goal.owner.type === 'person' ? 'Your manager is notified in-app.' : 'Goal owners are notified.'}</li>
        </ul>
      </div>
    </div>
  );
  const footer = (
    <div className="yx-growth-foot">
      <Button onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button
        variant="primary"
        icon={Check}
        onClick={() => {
          onSave?.(Object.fromEntries(Object.entries(actuals).map(([k, v]) => [k, v ?? 0])), confidence, note);
          onOpenChange(false);
        }}
      >
        Save check-in
      </Button>
    </div>
  );
  if (device === 'phone')
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} title={`Check in: ${goal.title}`} footer={footer}>
        {body}
      </BottomSheet>
    );
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Goal check-in" subtitle={goal.title} footer={footer} dirty={note.length > 0}>
      {body}
    </Drawer>
  );
}

export interface MyGoalsProps {
  persona: 'emp' | 'mgr';
  device?: Device;
  state?: LoadState;
  /** Whose goals (the viewer for Emp; a report for Mgr). */
  ownerName: string;
  goals: Goal[];
  /** All goals the viewer can see (for the alignment chain). */
  allGoals: Goal[];
  checkIns?: Record<string, CheckIn[]>;
  openGoalId?: string;
  checkInGoalId?: string;
  period?: string;
}

/** PRF-02 My goals (T6): tree and alignment views, progress rings per key result, weights check, check-in (T4). */
export function MyGoalsScreen({ persona, device = 'desktop', state = 'ready', ownerName, goals, allGoals, checkIns = {}, openGoalId, checkInGoalId, period = 'H1 FY 2026-27 (Apr–Sep 2026)' }: MyGoalsProps) {
  const [openId, setOpenId] = useState<string | null>(openGoalId ?? null);
  const [checkInId, setCheckInId] = useState<string | null>(checkInGoalId ?? null);
  const [approved, setApproved] = useState(false);
  const mine = goals.filter((g) => g.owner.type === 'person');
  const w = weightCheck(mine);
  const pendingApproval = mine.some((g) => g.status === 'Pending approval') && !approved;
  const open = allGoals.find((g) => g.id === openId) ?? null;
  const checking = allGoals.find((g) => g.id === checkInId) ?? null;
  const chain = useMemo(() => {
    const out: Goal[] = [];
    let cur = open;
    while (cur?.parentId) {
      const parent = allGoals.find((g) => g.id === cur!.parentId);
      if (!parent) break;
      out.unshift(parent);
      cur = parent;
    }
    return out;
  }, [open, allGoals]);
  const heading = persona === 'mgr' ? `${ownerName}’s goals` : 'My goals';

  const content = () => {
    if (state === 'loading') return <Skeleton height={320} />;
    if (state === 'error') return <ErrorState title="Goals didn’t load" description="Try again. Nothing you entered was lost." onRetry={() => {}} reference="GOAL-4410" />;
    if (state === 'empty' || mine.length === 0)
      return (
        <EmptyState
          title="No goals for this period yet"
          description="Add 3–5 goals with measurable key results, then align each one to a team or company goal."
          action={<Button icon={Plus}>Add goal</Button>}
          help={<Link href="#okr-help">How to write a good key result</Link>}
        />
      );
    return (
      <>
        {!w.ok && (
          <InlineAlert tone="warning" title="Goal weights don’t add up">
            {w.message} {persona === 'mgr' ? 'Send the goals back or edit the weights before approving.' : 'Your manager can’t approve until they do.'}
          </InlineAlert>
        )}
        {pendingApproval && persona === 'mgr' && (
          <InlineAlert
            tone="info"
            title={`${ownerName} sent ${mine.filter((g) => g.status === 'Pending approval').length} goals for approval`}
            actions={
              <>
                <Button size="sm">Send back</Button>
                <Button size="sm" disabled={!w.ok} onClick={() => setApproved(true)}>
                  Approve goals
                </Button>
              </>
            }
          >
            Check each goal is measurable and aligned before approving.
          </InlineAlert>
        )}
        {approved && (
          <InlineAlert tone="success" title="Goals approved">
            {ownerName} is notified. Check-ins can start now.
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
            <GoalTree goals={mine} aria-label={heading} onOpen={(g) => setOpenId(g.id)} onCheckIn={persona === 'emp' ? (g) => setCheckInId(g.id) : undefined} />
            <p className="yx-growth-meta">
              Weights total {w.total}% · progress is calculated from key results and can’t be typed in.
            </p>
          </TabsContent>
          <TabsContent value="align">
            <GoalTree goals={allGoals} aria-label="Alignment from company goals down to mine" compact onOpen={(g) => setOpenId(g.id)} />
          </TabsContent>
        </Tabs>
      </>
    );
  };

  const drawer = open && (
    <Drawer
      open
      onOpenChange={(o) => !o && setOpenId(null)}
      title={open.title}
      subtitle={`${open.owner.name} · ${open.type === 'okr' ? 'OKR' : 'KPI'} · weight ${open.weight}%`}
      meta={<Badge tone={open.status === 'Approved' ? 'success' : 'info'}>{open.status}</Badge>}
      size="lg"
      footer={
        <div className="yx-growth-foot">
          <Button>Edit goal</Button>
          {persona === 'emp' && open.owner.type === 'person' && (
            <Button variant="primary" onClick={() => setCheckInId(open.id)}>
              Check in
            </Button>
          )}
        </div>
      }
    >
      <div className="yx-growth-stack">
        {chain.length > 0 && (
          <section aria-label="Aligned to">
            <h3 className="yx-growth-h">Aligned to</h3>
            <ol className="yx-growth-list">
              {chain.map((c) => (
                <li key={c.id} className="yx-growth-list__item">
                  <ProgressRing value={goalProgress(c, allGoals)} label={c.title} size="sm" />
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
        </section>
        <section aria-label="Check-ins">
          <h3 className="yx-growth-h">Check-ins</h3>
          {(checkIns[open.id] ?? []).length === 0 ? (
            <Text tone="secondary">No check-ins yet.</Text>
          ) : (
            <Timeline
              today={TODAY}
              aria-label="Check-ins"
              items={(checkIns[open.id] ?? []).map<TimelineItem>((c) => ({ id: c.id, actor: { name: c.by }, action: c.text, at: c.at }))}
            />
          )}
        </section>
      </div>
    </Drawer>
  );

  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Goals" persona={persona} device="phone" phone={{ title: heading, back: true }}>
        <Select aria-label="Period" value="h1" onChange={() => {}} options={[{ value: 'h1', label: period }, { value: 'fy', label: 'FY 2026-27' }]} />
        {state === 'ready' && mine.length > 0 ? (
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
                <Button size="sm" onClick={() => setCheckInId(g.id)}>
                  Check in
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          content()
        )}
        {checking && <GoalCheckInSheet goal={checking} device="phone" open onOpenChange={(o) => !o && setCheckInId(null)} />}
      </GrowthFrame>
    );

  return (
    <GrowthFrame area="performance" active="Goals" persona={persona}>
      <PageHeader
        title={heading}
        description={period}
        facts={mine.length ? `${mine.length} goals · weights ${w.total}% · ${mine.reduce((a, g) => a + g.keyResults.length, 0)} key results` : undefined}
        actions={
          <>
            <Select aria-label="Period" value="h1" onChange={() => {}} options={[{ value: 'h1', label: 'H1 FY 2026-27' }, { value: 'h2', label: 'H2 FY 2026-27' }, { value: 'fy', label: 'FY 2026-27' }]} />
            {persona === 'emp' ? (
              <>
                <Button>Align to a goal</Button>
                <Button variant="primary" icon={Plus}>
                  Add goal
                </Button>
              </>
            ) : (
              <Button icon={Plus}>Suggest a goal</Button>
            )}
          </>
        }
      />
      {content()}
      {drawer}
      {checking && <GoalCheckInSheet goal={checking} open onOpenChange={(o) => !o && setCheckInId(null)} />}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-03 · Company goal map */

export interface CompanyGoalMapProps {
  /** exec = leadership: read-only map. */
  persona?: 'hr' | 'exec';
  state?: LoadState;
  goals: Goal[];
  /** Goals with no parent that should have one (person / team goals). */
  unaligned: Goal[];
  departments: string[];
}

/** PRF-03 Company goal map (T6, HR / Exec): company → team → person with calculated progress; unaligned and off-track lists. */
export function CompanyGoalMapScreen({ persona = 'hr', state = 'ready', goals, unaligned, departments }: CompanyGoalMapProps) {
  const [dept, setDept] = useState<string | null>(null);
  const company = goals.filter((g) => g.owner.type === 'company');
  const offTrack = goals.filter((g) => g.confidence === 'Off track' || g.confidence === 'At risk');
  const aligned = goals.filter((g) => g.owner.type !== 'company' && g.parentId).length;
  const nonCompany = goals.filter((g) => g.owner.type !== 'company').length;
  return (
    <GrowthFrame area="performance" active="Goals" persona={persona === 'exec' ? 'mgr' : 'hr'}>
      <PageHeader
        title="Company goal map"
        description="FY 2026-27 · company goals and everything aligned to them. Progress rolls up by weight from key results."
        actions={
          <>
            <Select aria-label="Department" placeholder="All departments" clearable value={dept} onChange={setDept} options={departments.map((d) => ({ value: d, label: d }))} />
            <Button>Export</Button>
            {persona === 'hr' && (
              <Button variant="primary" icon={Target}>
                Add company goal
              </Button>
            )}
          </>
        }
      />
      {state === 'loading' ? (
        <Skeleton height={360} />
      ) : state === 'error' ? (
        <ErrorState title="The goal map didn’t load" onRetry={() => {}} reference="GMAP-2203" />
      ) : state === 'empty' || company.length === 0 ? (
        <EmptyState title="No company goals for FY 2026-27" description="Add 3–5 company goals first. Teams and people then align their goals to them." />
      ) : (
        <>
          <div className="yx-growth-kpis">
            <StatCard label="Company goals" value={company.length} drill={{ label: 'View company goals', href: '#company' }} />
            <StatCard label="Goals aligned" value={nonCompany ? Math.round((aligned / nonCompany) * 100) : 0} unit="%" previous={74} previousLabel="H2 last year" drill={{ label: `View ${aligned} aligned goals`, href: '#aligned' }} />
            <StatCard label="At risk or off track" value={offTrack.length} drill={{ label: `View ${offTrack.length} goals`, href: '#risk' }} />
            <StatCard label="Unaligned goals" value={unaligned.length} drill={{ label: `View ${unaligned.length} goals`, href: '#unaligned' }} />
          </div>
          <div className="yx-growth-split">
            <div className="yx-growth-split__main">
              <Card title={dept ? `Goal map · ${dept}` : 'Goal map'}>
                <GoalTree goals={goals} aria-label="Company goal map" compact />
              </Card>
            </div>
            <aside className="yx-growth-split__side">
              <Card title="Not aligned yet">
                <ul className="yx-growth-list">
                  {unaligned.map((g) => (
                    <li key={g.id} className="yx-growth-list__item">
                      <div className="yx-growth-list__main">
                        <span className="yx-growth-list__title">{g.title}</span>
                        <span className="yx-growth-meta">{g.owner.name}</span>
                      </div>
                      {persona === 'hr' && <Button size="sm">Suggest parent</Button>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="At risk or off track">
                <ul className="yx-growth-list">
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
              </Card>
            </aside>
          </div>
        </>
      )}
    </GrowthFrame>
  );
}

/* ================================================================== PRF-16 · Coach card standalone (manager home widget) */

/** PRF-16 coach card as it sits on the manager's home (T1 card). */
export function ManagerCoachHome({ device = 'desktop', nudges, weekOf, optedOut, state = 'ready' }: { device?: Device; nudges: CoachNudge[]; weekOf: Date; optedOut?: boolean; state?: LoadState }) {
  const [out, setOut] = useState(!!optedOut);
  const card = state === 'loading' ? <Skeleton height={240} /> : <CoachCard nudges={nudges} weekOf={weekOf} optedOut={out} onOptOut={() => setOut(true)} />;
  if (device === 'phone')
    return (
      <GrowthFrame area="performance" active="Performance home" persona="mgr" device="phone" phone={{ tab: 'home', title: 'Home' }}>
        {card}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Performance home" persona="mgr">
      <Heading level={1}>Good morning, Karthik</Heading>
      <div className="yx-growth-cols" data-n="2">
        {card}
        <Card title="What the coach looks at">
          <ul className="yx-growth-list">
            {['No feedback given in 6 weeks', '1:1s due or overdue', 'Unused leave balance above 12 days (counts only)', 'Overtime 3 weeks running', 'Goals off track', 'New joiners’ open onboarding tasks'].map((s) => (
              <li key={s} className="yx-growth-list__item">
                {s}
              </li>
            ))}
          </ul>
          <Text size="sm" tone="secondary">
            Never health, leave reasons, POSH or disciplinary data. Names are hidden from the AI model that writes the wording.
          </Text>
        </Card>
      </div>
    </GrowthFrame>
  );
}
