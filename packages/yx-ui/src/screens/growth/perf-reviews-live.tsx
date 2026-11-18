// The live app's PRF-04 Cycle set-up and control room, PRF-05 Review workspace and PRF-06 Review acknowledgement: the
// designed screens with real data (performance builder 1). What the record needs beyond the design (who is reviewed,
// HR's answers to disagreements, the skip-level, a reopen, a former manager's input) uses the same parts.
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, CalendarPlus, Check, Download, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { Text } from '../../components/foundations';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { Drawer } from '../../components/drawer';
import { ConfirmDialog } from '../../components/overlay';
import { FieldRow, FormField } from '../../components/field';
import { NumberField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { MultiSelect, Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { Segment } from '../../components/segment';
import { Stepper, useNarrow } from '../../components/stepper';
import { Timeline, type TimelineItem } from '../../components/timeline';
import { useToast } from '../../components/notify';
import { countText, formatDate } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import type { Choice, CycleInput, CycleStage, Disagreement, EligibilityRow, EntryInput, PeerConfig, PeerGroups, Preflight, ReviewCycle, ReviewDetail, ReviewEntry, TemplateKind } from '../performance/live/types';
import { CalibrationPlan, ConfidentialTag, PotentialChoice, GrowthFrame, RatingScale, ScoreBand, SplitLayout, StageTrack, type PlannedSession } from './growth-kit';
import { reviewStages, reviewScore } from './growth-logic';
import { PerfReasonDialog, PERF_LINKS } from './perf-goals-live';
import { day, type LoadState } from './perf-live-data';
import { ReviewAssistantPanel, type LiveReviewAssistant } from './perf-assistant';

function useDone() {
  const { toast } = useToast();
  return { done: (title: string, description?: string) => toast({ tone: 'success', title, description }), say: (title: string) => toast({ title }) };
}
const errorOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Try again.');
const KIND: Record<TemplateKind, string> = { annual: 'Annual', half_yearly: 'Half-yearly', quarterly: 'Quarterly (OKR)', project: 'Project', probation: 'Probation' };
const CYCLE_STATUS: Record<ReviewCycle['status'], { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  launched: { label: 'Running', tone: 'info' },
  calibrating: { label: 'Calibrating', tone: 'warning' },
  released: { label: 'Released', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};
const toDay = (d: Date | null) => (d ? dayKey(d) : null);
/** Whole days from one date to another (calendar days, ignoring the time of day). */
const stageDays = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
const fromDay = (iso: string | undefined | null) => (iso ? day(iso) : null);

/* ================================================================== PRF-04 · Cycle set-up (live) */

export interface LiveCycleSetup {
  state: LoadState;
  onRetry: () => void;
  /** A draft being changed, or null for a new cycle. */
  cycle: ReviewCycle | null;
  /** Active template versions to start from. */
  templates: { id: string; name: string; kind: TemplateKind; templateVersion: number }[];
  departments: Choice[];
  /** People who can run calibration sessions (perf.calibration.facilitate, or a company admin). */
  facilitators?: Choice[];
  /** Days after release the employee may disagree (company setting perf.disagreement.days). */
  disagreeDays?: number | null;
  /** Saves the draft (new or changed); returns it. */
  onSave: (input: CycleInput, id: string | null) => Promise<ReviewCycle>;
  onPeer: (cycleId: string, peer: PeerConfig | null) => Promise<unknown>;
  onCheck: (cycleId: string) => Promise<Preflight>;
  onLaunch: (cycleId: string, version: number) => Promise<unknown>;
  /** After "Save and exit" or a launch. */
  onDone: (cycleId: string, launched: boolean) => void;
}

const departmentsOf = (population: unknown): string[] => {
  const g = population as { items?: { field?: string; value?: unknown }[] } | null;
  const c = g?.items?.find((x) => x.field === 'department_id');
  return Array.isArray(c?.value) ? (c!.value as string[]) : typeof c?.value === 'string' ? [c.value] : [];
};

export function LiveCycleSetupScreen({ live, defaultStep }: { live: LiveCycleSetup; defaultStep?: string }) {
  const { done } = useDone();
  const x = live.cycle;
  const stage = (k: CycleStage['key']) => x?.stages.find((s) => s.key === k);
  const [id, setId] = useState<string | null>(x?.id ?? null);
  const [version, setVersion] = useState<number | null>(x?.version ?? null);
  const [name, setName] = useState(x?.name ?? '');
  const [kind, setKind] = useState<TemplateKind>(x?.kind ?? 'half_yearly');
  const [start, setStart] = useState<Date | null>(fromDay(x?.periodFrom));
  const [end, setEnd] = useState<Date | null>(fromDay(x?.periodTo));
  const [depts, setDepts] = useState<string[]>(departmentsOf(x?.population));
  const [cutoff, setCutoff] = useState<number | null>(x?.eligibilityRules.cutoffMonths ?? 3);
  const [rateLeavers, setRateLeavers] = useState(x?.eligibilityRules.rateLeavers ?? false);
  const [templateId, setTemplateId] = useState<string | null>(x?.templateId ?? null);
  const [withSelf, setWithSelf] = useState(x ? Boolean(stage('self')) : true);
  const [selfDue, setSelfDue] = useState<Date | null>(fromDay(stage('self')?.dueOn));
  const [mgrDue, setMgrDue] = useState<Date | null>(fromDay(stage('manager')?.dueOn));
  const [withSkip, setWithSkip] = useState(Boolean(stage('skip')));
  const [skipDue, setSkipDue] = useState<Date | null>(fromDay(stage('skip')?.dueOn));
  const [with360, setWith360] = useState(Boolean(x?.peerFeedback));
  const [min360, setMin360] = useState<number | null>(x?.peerFeedback?.minNominees ?? 3);
  const [max360, setMax360] = useState<number | null>(x?.peerFeedback?.maxNominees ?? 6);
  const [due360, setDue360] = useState<Date | null>(fromDay(x?.peerFeedback?.dueOn));
  const [withCal, setWithCal] = useState(Boolean(x?.calibration?.length));
  const [sessions, setSessions] = useState<PlannedSession[]>(x?.calibration ?? []);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<'count' | 'launch' | null>(null);
  const [tried, setTried] = useState(false);
  const options = live.templates.filter((t) => t.kind === kind).map((t) => ({ value: t.id, label: `${t.name} (version ${t.templateVersion})` }));
  const errors: { step: string; fieldId: string; message: string }[] = [
    ...(name.trim().length >= 2 ? [] : [{ step: 'basics', fieldId: 'cy-name', message: 'Name the cycle.' }]),
    ...(start && end && dayKey(end) > dayKey(start) ? [] : [{ step: 'basics', fieldId: 'cy-end', message: 'Give the period, ending after it starts.' }]),
    ...(cutoff !== null && cutoff >= 0 && cutoff <= 12 ? [] : [{ step: 'population', fieldId: 'cy-cutoff', message: 'Give the joining cut-off, from 0 to 12 months.' }]),
    ...(templateId && options.some((o) => o.value === templateId) ? [] : [{ step: 'template', fieldId: 'cy-template', message: 'Choose an active template of this type.' }]),
    ...(withSelf && !selfDue ? [{ step: 'stages', fieldId: 'cy-self', message: 'Say when the self review is due.' }] : []),
    ...(mgrDue ? [] : [{ step: 'stages', fieldId: 'cy-mgr', message: 'Say when the manager review is due.' }]),
    ...(withSkip && !skipDue ? [{ step: 'stages', fieldId: 'cy-skip', message: 'Say when the skip-level review is due.' }] : []),
    ...(with360 && (min360 === null || max360 === null || max360 < min360 || max360 < 1) ? [{ step: 'stages', fieldId: 'cy-360', message: 'Give the fewest and most 360° reviewers (most at least the fewest).' }] : []),
    ...(with360 && !due360 ? [{ step: 'stages', fieldId: 'cy-360-due', message: 'Say when 360° feedback is due.' }] : []),
    ...(withCal && !sessions.length ? [{ step: 'stages', fieldId: 'cal-add', message: 'Add a calibration session, or leave calibration out.' }] : []),
  ];
  const err = (f: string) => (tried ? errors.find((e) => e.fieldId === f)?.message : undefined);
  const stopAt = (steps: string[]) => {
    const first = errors.find((e) => steps.includes(e.step));
    if (!first) return false;
    setTried(true);
    window.setTimeout(() => document.getElementById(first.fieldId)?.focus(), 0);
    return true;
  };
  const input = (): CycleInput => ({
    name: name.trim(),
    kind,
    periodFrom: toDay(start)!,
    periodTo: toDay(end)!,
    templateId: templateId!,
    population: depts.length ? { id: 'root', join: 'and', items: [{ id: 'dept', field: 'department_id', operator: 'one_of', value: depts }] } : null,
    stages: [...(withSelf ? [{ key: 'self' as const, dueOn: toDay(selfDue)! }] : []), { key: 'manager' as const, dueOn: toDay(mgrDue)! }, ...(withSkip ? [{ key: 'skip' as const, dueOn: toDay(skipDue)! }] : [])],
    eligibilityRules: { cutoffMonths: cutoff ?? 0, rateLeavers },
    calibration: withCal ? sessions : [],
    ...(version !== null ? { version } : {}),
  });
  /** Saves the draft and its 360° set-up; returns the saved cycle. */
  const save = async () => {
    const saved = await live.onSave(input(), id);
    // Turning 360° on or off bumps the cycle's version; launch with the one the server returned.
    const peer = (await live.onPeer(saved.id, with360 ? { minNominees: min360!, maxNominees: max360!, dueOn: toDay(due360)! } : null)) as { version?: number } | undefined;
    const c = typeof peer?.version === 'number' ? { ...saved, version: peer.version } : saved;
    setId(c.id);
    setVersion(c.version);
    return c;
  };
  const run = async (key: 'count' | 'launch', fn: () => Promise<void>) => {
    setBusy(key);
    setFailed(null);
    try {
      await fn();
    } catch (e) {
      setFailed(errorOf(e));
    } finally {
      setBusy(null);
    }
  };
  const count = () =>
    run('count', async () => {
      if (stopAt(['basics', 'population', 'template', 'stages'])) throw new Error('Fill in the steps first: the count uses the whole set-up.');
      const c = await save();
      setPreflight(await live.onCheck(c.id));
    });
  const launch = () =>
    run('launch', async () => {
      if (stopAt(['basics', 'population', 'template', 'stages'])) throw new Error('Some steps need changes first. They are marked in the step list.');
      const c = await save();
      const pf = await live.onCheck(c.id);
      setPreflight(pf);
      if (pf.problems.length) throw new Error(`Fix ${pf.problems.length === 1 ? 'this' : `these ${pf.problems.length}`} before you launch: ${pf.problems.map((p) => p.text).join(' ')}`);
      await live.onLaunch(c.id, c.version);
      done('Cycle launched', `${countText(pf.reviewed, 'review')} opened; their owners are told.`);
      live.onDone(c.id, true);
    });
  const stepError = (s: string) => (tried && errors.some((e) => e.step === s) ? errors.find((e) => e.step === s)!.message : undefined);

  if (live.state === 'loading') return <GrowthFrame area="performance" active="Reviews & cycles" persona="hr"><PageHeader title={x ? x.name : 'New review cycle'} /><Skeleton height={360} /></GrowthFrame>;
  if (live.state === 'error') return <GrowthFrame area="performance" active="Reviews & cycles" persona="hr"><PageHeader title="Review cycle" /><ErrorState title="The cycle didn’t load" onRetry={live.onRetry} /></GrowthFrame>;
  // The design's "Days": how long each dated stage runs, from the stage before it (the first ones from today).
  const daysFrom = (from: Date | null, to: Date | null) => (from && to ? `${countText(Math.max(0, stageDays(from, to)), 'day')}` : '—');
  const today0 = new Date();
  const selfFrom = withSelf ? selfDue : today0;
  const stageRows = [
    { id: 'self', label: 'Self review', owner: 'Employee', due: withSelf ? (selfDue ? formatDate(selfDue) : 'Not set') : '—', days: withSelf ? daysFrom(today0, selfDue) : '—', include: <Checkbox aria-label="Include Self review" checked={withSelf} onChange={setWithSelf} /> },
    { id: '360', label: '360° feedback', owner: 'Nominated reviewers', due: with360 ? (due360 ? formatDate(due360) : 'Not set') : '—', days: with360 ? daysFrom(today0, due360) : '—', include: <Checkbox aria-label="Include 360° feedback" checked={with360} onChange={setWith360} /> },
    { id: 'mgr', label: 'Manager review', owner: 'Manager', due: mgrDue ? formatDate(mgrDue) : 'Not set', days: daysFrom(selfFrom, mgrDue), include: 'Always' },
    { id: 'skip', label: 'Skip-level review', owner: 'Manager’s manager', due: withSkip ? (skipDue ? formatDate(skipDue) : 'Not set') : '—', days: withSkip ? daysFrom(mgrDue, skipDue) : '—', include: <Checkbox aria-label="Include Skip-level review" checked={withSkip} onChange={setWithSkip} /> },
    { id: 'cal', label: 'Calibration', owner: 'HR', due: withCal ? (sessions.length ? countText(sessions.length, 'session') : 'Add a session below') : 'Not used', days: withCal ? 'Until signed off' : '—', include: <Checkbox aria-label="Include Calibration" checked={withCal} onChange={setWithCal} /> },
    { id: 'rel', label: 'Release', owner: 'HR', due: 'When HR releases', days: '—', include: 'Always' },
    { id: 'ack', label: 'Employee acknowledgement', owner: 'Employee', due: live.disagreeDays ? `Disagree within ${live.disagreeDays} days` : 'After release', days: live.disagreeDays ? countText(live.disagreeDays, 'day') : '—', include: 'Always' },
  ];
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
      <PageHeader title={x ? `Change ${x.name}` : 'New review cycle'} description="Cycles may overlap when their types differ, e.g. a probation review during the half-yearly cycle." />
      {failed && (
        <InlineAlert tone="danger" title="That didn’t work">
          {failed}
        </InlineAlert>
      )}
      <Stepper
        title={x ? `Change ${x.name}` : 'New review cycle'}
        defaultCurrent={defaultStep ?? 'basics'}
        onSaveAndExit={() =>
          void run('count', async () => {
            if (stopAt(['basics', 'population', 'template', 'stages'])) throw new Error('A draft needs every step filled in before it is saved.');
            const c = await save();
            done('Draft saved', 'Nothing is sent until you launch.');
            live.onDone(c.id, false);
          })
        }
        onContinue={(step) => !stopAt([step])}
        review={{ title: 'Review and launch', description: 'The rating scale is frozen once the cycle launches.', note: preflight?.problems.length ? <InlineAlert tone="warning" title="Fix these before you launch">{preflight.problems.map((p) => p.text).join(' ')}</InlineAlert> : undefined }}
        finishLabel="Launch cycle"
        finishing={busy === 'launch'}
        onFinish={() => void launch()}
        steps={[
          {
            id: 'basics',
            title: 'Basics',
            description: 'Name, type and period',
            status: stepError('basics') ? 'error' : undefined,
            statusNote: stepError('basics'),
            content: (
              <div className="yx-growth-stack">
                <FormField id="cy-name" label="Cycle name" required error={err('cy-name')}>
                  <TextField value={name} onChange={setName} maxLength={100} />
                </FormField>
                <FormField id="cy-kind" label="Type" required>
                  <Select aria-label="Type" value={kind} onChange={(k) => k && setKind(k as TemplateKind)} options={(Object.keys(KIND) as TemplateKind[]).map((k) => ({ value: k, label: KIND[k] }))} />
                </FormField>
                <FieldRow>
                  <FormField id="cy-start" label="Period starts" required>
                    <DatePicker value={start} onChange={setStart} aria-label="Period starts" />
                  </FormField>
                  <FormField id="cy-end" label="Period ends" required error={err('cy-end')}>
                    <DatePicker value={end} onChange={setEnd} min={start ?? undefined} aria-label="Period ends" />
                  </FormField>
                </FieldRow>
              </div>
            ),
            summary: <DescriptionList items={[{ label: 'Name', value: name || 'Not set' }, { label: 'Type', value: KIND[kind] }, { label: 'Period', value: start && end ? `${formatDate(start)} – ${formatDate(end)}` : 'Not set' }]} />,
          },
          {
            id: 'population',
            title: 'Population and eligibility',
            description: 'Who is reviewed',
            status: stepError('population') ? 'error' : undefined,
            statusNote: stepError('population'),
            content: (
              <div className="yx-growth-stack">
                <FormField id="cy-depts" label="Include" optional helper="Leave empty for everyone in the company.">
                  <MultiSelect aria-label="Departments in the cycle" value={depts} onChange={setDepts} options={live.departments} placeholder="Everyone" />
                </FormField>
                <FormField id="cy-cutoff" label="Joining cut-off" helper="People who served fewer months than this in the period are not reviewed in this cycle. HR can add them back with a reason." error={err('cy-cutoff')}>
                  <NumberField value={cutoff} onChange={setCutoff} suffix="months" min={0} max={12} />
                </FormField>
                <FormField label="Leavers">
                  <RadioGroup aria-label="Leavers" value={rateLeavers ? 'rate' : 'close'} onChange={(v) => setRateLeavers(v === 'rate')} options={[{ value: 'close', label: 'Closed without a rating' }, { value: 'rate', label: 'Rated like everyone else' }]} />
                </FormField>
                <Text size="sm" tone="secondary">
                  Mid-cycle joiners are reviewed for the months they served, and the increment is prorated. A person who moves team is reviewed by their manager on the day the review starts; the earlier manager can be asked for input.
                </Text>
                <InlineAlert tone="info" title="Protected leave">
                  Maternity and paternity leave count as time served: no one is left out or rated down for it, and it isn’t counted against them.
                </InlineAlert>
                <div className="yx-growth-effect" aria-live="polite">
                  <span className="yx-growth-effect__title">Who this includes today</span>
                  {preflight ? (
                    <ul>
                      <li>{preflight.reviewed} people reviewed</li>
                      <li>{preflight.excluded} left out (served fewer than {cutoff} months, or left)</li>
                      <li>{preflight.protectedLeave} on protected leave (counted as served)</li>
                      <li>{preflight.leavers} leavers {rateLeavers ? 'rated' : 'closed without a rating'}</li>
                    </ul>
                  ) : (
                    <Text size="sm">Count them once the steps are filled in. The draft is saved to count.</Text>
                  )}
                  <Button size="sm" loading={busy === 'count'} onClick={() => void count()}>
                    {preflight ? 'Count again' : 'Count who is included'}
                  </Button>
                </div>
              </div>
            ),
            summary: <Text>{preflight ? countText(preflight.reviewed, 'person', 'people') : depts.length ? countText(depts.length, 'department') : 'Everyone'} · cut-off {countText(cutoff ?? 0, 'month')}</Text>,
          },
          {
            id: 'template',
            title: 'Template and scale',
            description: 'Sections, weights, rating scale',
            status: stepError('template') ? 'error' : undefined,
            statusNote: stepError('template'),
            content: (
              <div className="yx-growth-stack">
                <FormField id="cy-template" label="Template" required error={err('cy-template')} helper="Templates of this type that are active. Each brings its sections, weights and rating scale.">
                  <Select aria-label="Template" value={templateId} onChange={setTemplateId} options={options} placeholder={options.length ? 'Choose a template' : 'No active template of this type'} />
                </FormField>
                <InlineAlert tone="info" title="Weights and the scale come from the template">
                  Section weights, half points and the rating scale are set on the template in Settings › Performance. They are frozen for this cycle once it launches.
                </InlineAlert>
              </div>
            ),
            summary: <Text>{options.find((o) => o.value === templateId)?.label ?? 'Not chosen'}</Text>,
          },
          {
            id: 'stages',
            title: 'Stages and deadlines',
            description: 'Owner and due date per stage',
            status: stepError('stages') ? 'error' : undefined,
            statusNote: stepError('stages'),
            content: (
              <div className="yx-growth-stack">
                <PlainTable
                  label="Stages"
                  columns={[
                    { key: 'stage', header: 'Stage', rowHeader: true, cell: (r) => r.label },
                    { key: 'owner', header: 'Owner', cell: (r) => r.owner },
                    { key: 'due', header: 'Due', date: true, cell: (r) => r.due },
                    { key: 'days', header: 'Days', num: true, cell: (r) => r.days },
                    { key: 'include', header: 'Include', cell: (r) => r.include },
                  ]}
                  rows={stageRows}
                  getRowId={(r) => r.id}
                />
                <FieldRow>
                  {withSelf && (
                    <FormField id="cy-self" label="Self review due" required error={err('cy-self')}>
                      <DatePicker value={selfDue} onChange={setSelfDue} min={new Date()} aria-label="Self review due" />
                    </FormField>
                  )}
                  <FormField id="cy-mgr" label="Manager review due" required error={err('cy-mgr')}>
                    <DatePicker value={mgrDue} onChange={setMgrDue} min={selfDue ?? new Date()} aria-label="Manager review due" />
                  </FormField>
                  {withSkip && (
                    <FormField id="cy-skip" label="Skip-level review due" required error={err('cy-skip')}>
                      <DatePicker value={skipDue} onChange={setSkipDue} min={mgrDue ?? new Date()} aria-label="Skip-level review due" />
                    </FormField>
                  )}
                </FieldRow>
                {with360 && (
                  <FieldRow>
                    <FormField id="cy-360" label="360° reviewers, minimum" error={err('cy-360')}>
                      <NumberField value={min360} onChange={setMin360} min={0} max={20} />
                    </FormField>
                    <FormField id="cy-360-max" label="360° reviewers, maximum">
                      <NumberField value={max360} onChange={setMax360} min={1} max={20} />
                    </FormField>
                    <FormField id="cy-360-due" label="360° feedback due" error={err('cy-360-due')}>
                      <DatePicker value={due360} onChange={setDue360} min={new Date()} aria-label="360° feedback due" />
                    </FormField>
                  </FieldRow>
                )}
                {with360 && (
                  <Text size="sm" tone="secondary">
                    Peers and direct reports stay anonymous and are shown only in groups of 3 or more; the manager is named. 360° feedback is advisory and never scored.
                  </Text>
                )}
                {withCal && <CalibrationPlan sessions={sessions} onChange={setSessions} facilitators={live.facilitators ?? []} departments={live.departments} />}
              </div>
            ),
            summary: <Text>{stageRows.filter((s) => s.include === 'Always' || (s.id === 'self' && withSelf) || (s.id === '360' && with360) || (s.id === 'skip' && withSkip) || (s.id === 'cal' && withCal)).map((s) => s.label).join(' → ')}</Text>,
          },
        ]}
      />
    </GrowthFrame>
  );
}

/* ================================================================== PRF-04 · Control room (live) */

export interface StagePerson {
  reviewId: string;
  employee: string;
  owner: string | null;
  dueOn: string | null;
  overdue: boolean;
}

export interface LiveControlRoom {
  state: LoadState;
  onRetry: () => void;
  cycle: ReviewCycle | null;
  funnel: { stage: string; label: string; count: number }[];
  overdue: { ownerEmployeeId: string; owner: string; stage: string; count: number }[];
  eligibility: EligibilityRow[];
  disagreements: Disagreement[];
  stagePeople: (stage: string) => Promise<StagePerson[]>;
  onOpenReview: (id: string) => void;
  onRemind: (opts: { overdueOnly?: boolean; ownerEmployeeIds?: string[] }) => Promise<{ reminded: number }>;
  onExtend: (stage: CycleStage['key'], dueOn: string) => Promise<unknown>;
  onRelease: () => Promise<{ released: number; notReady: number }>;
  onDecide: (id: string, status: 'answered' | 'upheld' | 'not_upheld', note: string) => Promise<unknown>;
  onOverride: (rowId: string, reviewed: boolean, reason: string) => Promise<unknown>;
  /** Calibration sessions of the cycle (the "Calibration · Sessions list" design). */
  calibration?: ReactNode;
}

const RULE: Record<EligibilityRow['rule'], string> = { included: 'Included', excluded_cutoff: 'Joined after the cut-off', leaver: 'Left', transfer_split: 'Moved team', protected_leave: 'Protected leave (counted as served)', override: 'Changed by HR' };
const DISAGREEMENT: Record<Disagreement['status'], { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = { open: { label: 'Waiting for HR', tone: 'warning' }, answered: { label: 'Answered', tone: 'info' }, upheld: { label: 'Upheld', tone: 'success' }, not_upheld: { label: 'Not upheld', tone: 'neutral' } };
const STAGE_NAME: Record<string, string> = { self: 'Self review', manager: 'Manager review', skip: 'Skip-level review' };

export function LiveCycleControlRoom({ live, defaultTab, defaultStage }: { live: LiveControlRoom; defaultTab?: string; defaultStage?: string }) {
  const { done, say } = useDone();
  const x = live.cycle;
  const [open, setOpen] = useState<string | null>(null);
  const [people, setPeople] = useState<StagePerson[] | null>(null);
  const [peopleFailed, setPeopleFailed] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'extend' } | { kind: 'remind'; overdueOnly: boolean; owners?: string[] } | { kind: 'release' } | { kind: 'decide'; item: Disagreement } | { kind: 'override'; row: EligibilityRow }>(null);
  const top = live.funnel.reduce((a, f) => a + f.count, 0);
  const ready = live.funnel.find((f) => f.stage === 'release')?.count ?? 0;
  const openDis = live.disagreements.filter((d) => d.status === 'open').length;
  const drill = async (stage: string) => {
    setOpen(stage);
    setPeople(null);
    setPeopleFailed(null);
    try {
      setPeople(await live.stagePeople(stage));
    } catch (e) {
      setPeopleFailed(errorOf(e));
    }
  };
  useEffect(() => {
    if (defaultStage && live.state === 'ready') void drill(defaultStage);
    // Stories open a stage once, when the data is there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultStage, live.state]);
  const current = live.funnel.find((f) => f.stage === open);
  const frame = (children: ReactNode) => (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="hr">
      {children}
    </GrowthFrame>
  );
  if (live.state === 'error') return frame(<><PageHeader title="Review cycle" /><ErrorState title="The control room didn’t load" onRetry={live.onRetry} /></>);
  if (live.state === 'loading' || !x) return frame(<><PageHeader title="Review cycle" /><Skeleton height={300} /></>);
  const stages = x.stages;
  const release = () => (ready > 0 ? setDialog({ kind: 'release' }) : say('No review is ready to release yet. Reviews are ready once the manager (and skip-level) stage is done.'));
  return frame(
    <>
      <PageHeader
        title={x.name}
        status={<Badge tone={CYCLE_STATUS[x.status].tone}>{CYCLE_STATUS[x.status].label}</Badge>}
        facts={`${formatDate(day(x.periodFrom))} – ${formatDate(day(x.periodTo))} · ${countText(live.eligibility.filter((r) => r.reviewed).length, 'person', 'people')}${x.launchedAt ? ` · launched ${formatDate(day(x.launchedAt))}` : ''}`}
        actions={
          <>
            {x.status === 'launched' && (
              <>
                <Button icon={CalendarPlus} onClick={() => setDialog({ kind: 'extend' })}>
                  Extend a deadline
                </Button>
                <Button icon={Bell} onClick={() => setDialog({ kind: 'remind', overdueOnly: false })}>
                  Send reminders
                </Button>
              </>
            )}
            {(x.status === 'launched' || x.status === 'released') && (
              <Button variant="primary" onClick={release}>
                Release ratings
              </Button>
            )}
          </>
        }
      />
      <Tabs defaultValue={defaultTab ?? 'progress'}>
        <TabsList aria-label="Cycle">
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="people" count={live.eligibility.length}>
            Who is reviewed
          </TabsTrigger>
          <TabsTrigger value="disagreements" count={openDis || undefined}>
            Disagreements
          </TabsTrigger>
          {live.calibration && <TabsTrigger value="calibration">Calibration</TabsTrigger>}
        </TabsList>
        <TabsContent value="progress">
          <SplitLayout
            main={
              <Card title="Progress by stage">
                <Text size="sm" tone="secondary">
                  Select a stage to see the names.
                </Text>
                <ol className="yx-growth-list">
                  {live.funnel.map((f) => (
                    <li key={f.stage} className="yx-growth-list__item">
                      <span className="yx-growth-grow">
                        <Link
                          href={`#stage-${f.stage}`}
                          onClick={(e) => {
                            e.preventDefault();
                            void drill(f.stage);
                          }}
                        >
                          {f.label}
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
                <Text size="sm" tone="secondary">
                  Due: {stages.map((s) => `${STAGE_NAME[s.key]} ${formatDate(day(s.dueOn))}`).join(' · ')}
                </Text>
              </Card>
            }
            side={
              <Card title="Overdue by owner">
                {live.overdue.length === 0 ? (
                  <Text tone="secondary">Nothing overdue.</Text>
                ) : (
                  <ul className="yx-growth-list">
                    {live.overdue.map((o) => (
                      <li key={o.ownerEmployeeId} className="yx-growth-list__item">
                        <PersonLabel name={o.owner} secondary={o.stage} />
                        <Badge tone="danger">{o.count} overdue</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {x.status === 'launched' && (
                  <Button size="sm" icon={Bell} onClick={() => (live.overdue.length ? setDialog({ kind: 'remind', overdueOnly: true }) : say('Nothing is overdue, so there is no one to remind.'))}>
                    Remind all overdue owners
                  </Button>
                )}
              </Card>
            }
          />
        </TabsContent>
        <TabsContent value="people">
          <DataTable
            label="Who is reviewed"
            columns={[
              { key: 'n', header: 'Employee', value: (r: EligibilityRow) => r.name, width: 220, hideable: false },
              { key: 'r', header: 'Rule', value: (r) => RULE[r.rule], width: 260 },
              { key: 'm', header: 'Months served', type: 'number', value: (r) => r.eligibleMonths, width: 140 },
              { key: 'in', header: 'Reviewed', type: 'status', value: (r) => (r.reviewed ? 'Reviewed' : 'Left out'), statusTone: (v) => (v === 'Reviewed' ? 'success' : 'neutral'), width: 130 },
            ]}
            rows={live.eligibility}
            getRowId={(r) => r.id}
            rowNoun={['person', 'people']}
            cardSummary
            empty={<EmptyState compact title="No one is in this cycle." />}
            rowButtons={(r) =>
              x.status === 'launched' ? (
                <Button size="sm" onClick={() => setDialog({ kind: 'override', row: r })}>
                  {r.reviewed ? 'Leave out' : 'Include'}
                </Button>
              ) : null
            }
          />
        </TabsContent>
        <TabsContent value="disagreements">
          {live.disagreements.length === 0 ? (
            <EmptyState compact title="No disagreements." description="When an employee disagrees with a released review, it shows here for HR to answer." />
          ) : (
            <ul className="yx-growth-list">
              {live.disagreements.map((d) => (
                <li key={d.id} className="yx-growth-list__item">
                  <div className="yx-growth-list__main">
                    <span className="yx-growth-list__title">{d.employee}</span>
                    <p className="yx-growth-p">{d.text}</p>
                    {d.hrNote && <span className="yx-growth-meta">HR: {d.hrNote}</span>}
                  </div>
                  <Badge tone={DISAGREEMENT[d.status].tone}>{DISAGREEMENT[d.status].label}</Badge>
                  <Button size="sm" onClick={() => live.onOpenReview(d.reviewId)}>
                    Open review
                  </Button>
                  {d.status === 'open' && (
                    <Button size="sm" variant="primary" onClick={() => setDialog({ kind: 'decide', item: d })}>
                      Answer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        {live.calibration && <TabsContent value="calibration">{live.calibration}</TabsContent>}
      </Tabs>
      {current && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={current.label} subtitle={countText(current.count, 'person', 'people')}>
          {peopleFailed ? (
            <ErrorState title="The names didn’t load" description={peopleFailed} onRetry={() => void drill(current.stage)} />
          ) : !people ? (
            <Skeleton height={160} />
          ) : people.length === 0 ? (
            <Text tone="secondary">No one is at this stage.</Text>
          ) : (
            <ul className="yx-growth-list">
              {people.map((p) => (
                <li key={p.reviewId} className="yx-growth-list__item">
                  <PersonLabel name={p.employee} secondary={[p.owner && p.owner !== p.employee ? `with ${p.owner}` : null, p.dueOn ? `due ${formatDate(day(p.dueOn))}` : null].filter(Boolean).join(' · ') || undefined} />
                  {p.overdue && <Badge tone="danger">Overdue</Badge>}
                  <Button size="sm" onClick={() => live.onOpenReview(p.reviewId)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Drawer>
      )}
      {dialog?.kind === 'extend' && <ExtendDialog stages={stages} onClose={() => setDialog(null)} onSave={async (k, d) => { await live.onExtend(k, d); done('Deadline moved', `${STAGE_NAME[k]} is now due ${formatDate(day(d))}.`); }} />}
      {dialog?.kind === 'remind' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={dialog.overdueOnly ? 'Remind everyone who is overdue?' : 'Send reminders now?'}
          consequence={dialog.overdueOnly ? `${live.overdue.length === 1 ? '1 person gets' : `${live.overdue.length} people get`} an in-app and email reminder for the stage they owe.` : 'Everyone with a stage still open gets an in-app and email reminder.'}
          confirmLabel="Send reminders"
          onConfirm={async () => {
            const r = await live.onRemind({ overdueOnly: dialog.overdueOnly, ownerEmployeeIds: dialog.owners });
            done('Reminders sent', `${r.reminded === 1 ? '1 person' : `${r.reminded} people`} reminded.`);
          }}
        />
      )}
      {dialog?.kind === 'release' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Release ${ready === 1 ? '1 ready review' : `${ready} ready reviews`}?`}
          consequence="They can then read their rating, band and their manager’s review, and acknowledge it. Reviews still in progress are released later."
          confirmLabel="Release ratings"
          onConfirm={async () => {
            const r = await live.onRelease();
            done('Ratings released', `${r.released} released${r.notReady ? `; ${r.notReady} still in progress` : ''}.`);
          }}
        />
      )}
      {dialog?.kind === 'decide' && <DecideDialog item={dialog.item} onClose={() => setDialog(null)} onSave={async (s, n) => { await live.onDecide(dialog.item.id, s, n); done('Answer sent', `${dialog.item.employee} is notified.`); }} />}
      {dialog?.kind === 'override' && (
        <PerfReasonDialog
          title={dialog.row.reviewed ? `Leave ${dialog.row.name} out of this cycle?` : `Review ${dialog.row.name} in this cycle?`}
          consequence={dialog.row.reviewed ? 'Their review closes without a rating.' : 'Their review opens at the first stage.'}
          label="Reason"
          helper="Recorded with your name."
          confirmLabel={dialog.row.reviewed ? 'Leave out' : 'Include'}
          onClose={() => setDialog(null)}
          onSave={async (reason) => {
            await live.onOverride(dialog.row.id, !dialog.row.reviewed, reason);
            done(dialog.row.reviewed ? `${dialog.row.name} left out` : `${dialog.row.name} included`);
          }}
        />
      )}
    </>,
  );
}

function ExtendDialog({ stages, onClose, onSave }: { stages: CycleStage[]; onClose: () => void; onSave: (k: CycleStage['key'], dueOn: string) => Promise<unknown> }) {
  const [stage, setStage] = useState<CycleStage['key']>(stages[0]?.key ?? 'manager');
  const [due, setDue] = useState<Date | null>(null);
  const [tried, setTried] = useState(false);
  const cur = stages.find((s) => s.key === stage);
  const bad = !due ? 'Choose the new day.' : cur && dayKey(due) <= cur.dueOn ? `Choose a day after ${formatDate(day(cur.dueOn))}; a deadline only moves later.` : null;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Extend a deadline"
      consequence="Reminders start again for the new day. A later stage must still be due after it."
      confirmLabel="Move deadline"
      onConfirm={async () => {
        setTried(true);
        if (bad) {
          document.getElementById('ex-due')?.focus();
          return false;
        }
        await onSave(stage, dayKey(due!));
        onClose();
      }}
    >
      <FormField id="ex-stage" label="Stage">
        <Segment label="Stage" value={stage} onChange={setStage} options={stages.map((s) => ({ value: s.key, label: STAGE_NAME[s.key] }))} />
      </FormField>
      <FormField id="ex-due" label="New due day" required helper={cur ? `Now due ${formatDate(day(cur.dueOn))}.` : undefined} error={tried ? bad : null}>
        <DatePicker value={due} onChange={setDue} min={cur ? day(cur.dueOn) : undefined} aria-label="New due day" />
      </FormField>
    </ConfirmDialog>
  );
}

function DecideDialog({ item, onClose, onSave }: { item: Disagreement; onClose: () => void; onSave: (status: 'answered' | 'upheld' | 'not_upheld', note: string) => Promise<unknown> }) {
  const [status, setStatus] = useState<'answered' | 'upheld' | 'not_upheld'>('answered');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Answer ${item.employee}`}
      confirmLabel="Send answer"
      onConfirm={async () => {
        setTried(true);
        if (note.trim().length < 3) {
          document.getElementById('dd-note')?.focus();
          return false;
        }
        await onSave(status, note.trim());
        onClose();
      }}
    >
      <Text as="p">{item.text}</Text>
      <FormField id="dd-status" label="Outcome">
        <Segment label="Outcome" value={status} onChange={setStatus} options={[{ value: 'answered', label: 'Answered' }, { value: 'upheld', label: 'Upheld' }, { value: 'not_upheld', label: 'Not upheld' }]} />
      </FormField>
      <FormField id="dd-note" label="Note to the employee" required error={tried && note.trim().length < 3 ? 'Enter a note of at least 3 characters.' : null} helper="If upheld, reopen the review so the manager can change the rating.">
        <TextArea value={note} onChange={setNote} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

/* ================================================================== PRF-05 · Review workspace (live) */

export interface LiveReviewWorkspace {
  state: LoadState;
  onRetry: () => void;
  review: ReviewDetail | null;
  /** Grouped 360° answers (advisory), when the cycle has them and the viewer may read them. */
  peer: PeerGroups | null;
  onSave: (stage: 'self' | 'manager' | 'other', input: EntryInput, submit: boolean) => Promise<unknown>;
  onSkip: (agree: boolean, text: string | null) => Promise<unknown>;
  onReopen: (reason: string) => Promise<unknown>;
  onAddOther: (employeeId: string) => Promise<unknown>;
  /** PRF-17: the review assistant for the review's current manager (null for anyone else). */
  assistant?: LiveReviewAssistant | null;
  /** PRF-07: where the employee or manager nominates 360° reviewers, when the cycle has them. */
  nominateHref?: string | null;
  /** PRF-05 "Download PDF" once the review is submitted: the review as this viewer sees it (audited by the API). */
  onDownload?: () => Promise<unknown>;
}

type Answers = Record<string, { rating: number | null; text: string | null }>;
const PEER_GROUP: Record<string, string> = { peer: 'Peers', report: 'Direct reports', others: 'Others' };

/** The score so far, worked out as the server does it (average per rated section, weighted; missing is pending, never 0). */
export function scoreSoFar(r: ReviewDetail, answers: Answers, overall: number | null) {
  if (r.finalScore !== null) return { score: r.finalScore, pending: [] as string[], excluded: r.excludedSections, sections: [] as { title: string; weight: number; score: number | null }[] };
  const sections = r.template.sections
    .filter((s) => s.rated)
    .map((s) => {
      const rs = s.questions.map((q) => answers[q.id]?.rating).filter((x): x is number => typeof x === 'number');
      return { id: s.id, title: s.title, weight: s.weight, score: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 100) / 100 : null };
    });
  if (r.template.scoring === 'manager_overall') return { score: overall, pending: overall === null ? ['Overall rating'] : [], excluded: [], sections };
  return { ...reviewScore(sections), sections };
}

export function LiveReviewWorkspaceScreen({ live }: { live: LiveReviewWorkspace }) {
  const r = live.review;
  const frame = (persona: 'emp' | 'mgr', children: ReactNode) => (
    <GrowthFrame area="performance" active="Reviews & cycles" persona={persona}>
      {children}
    </GrowthFrame>
  );
  if (live.state === 'error') return frame('emp', <><PageHeader title="Review" /><ErrorState title="This review didn’t load" onRetry={live.onRetry} /></>);
  if (live.state === 'loading' || !r) return frame('emp', <><PageHeader title="Review" /><Skeleton height={360} /></>);
  return frame(r.role === 'employee' ? 'emp' : 'mgr', <ReviewBody key={`${r.id}-${r.version}`} live={live} r={r} />);
}

function ReviewBody({ live, r }: { live: LiveReviewWorkspace; r: ReviewDetail }) {
  const { done } = useDone();
  const stage: 'self' | 'manager' | 'other' | null = r.can.self ? 'self' : r.can.manager ? 'manager' : r.can.other ? 'other' : null;
  const mine: ReviewEntry | null = stage === 'self' ? r.self : stage === 'manager' ? r.managerEntry : stage === 'other' ? (r.otherEntry ?? null) : null;
  // What the page shows when the viewer answers nothing: the manager's review (chain, HR) or the employee's own self review.
  const shownEntry = mine ?? (r.role === 'employee' ? r.self : (r.managerEntry ?? r.self));
  const [answers, setAnswers] = useState<Answers>(shownEntry?.answers ?? {});
  const [overall, setOverall] = useState<number | null>(shownEntry?.overallRating ?? null);
  const [potential, setPotential] = useState<1 | 2 | 3 | null>((r.proposedPotential as 1 | 2 | 3 | null | undefined) ?? null);
  const [summary, setSummary] = useState(shownEntry?.comment ?? '');
  const [busy, setBusy] = useState<'save' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState<null | 'submit' | 'agree' | 'send_back' | 'reopen' | 'other'>(null);
  const [downloading, setDownloading] = useState(false);
  const editable = Boolean(stage);
  const set = (id: string, patch: Partial<{ rating: number | null; text: string | null }>) => setAnswers((a) => ({ ...a, [id]: { rating: a[id]?.rating ?? null, text: a[id]?.text ?? null, ...patch } }));
  const levels = r.template.levels;
  const label = (v: number | null | undefined) => (v == null ? 'Not given' : `${v} · ${levels.find((l) => l.value === v)?.label ?? ''}`);
  const sections = r.template.sections.filter((s) => (stage ? s.whoAnswers.includes(stage === 'other' ? 'manager' : stage) : true));
  const score = scoreSoFar(r, answers, overall);
  const input = (): EntryInput => ({ answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, rating: a.rating, text: a.text })), overallRating: overall, comment: summary.trim() || null, ...(stage === 'manager' ? { potential } : {}) });
  const saveDraft = async () => {
    setBusy('save');
    setFailed(null);
    try {
      await live.onSave(stage!, input(), false);
      done('Draft saved', 'Only you can see it until you complete it.');
    } catch (e) {
      setFailed(errorOf(e));
    } finally {
      setBusy(null);
    }
  };
  const stages = reviewStages(r.cycle.stages, { stage: r.next.stage, status: r.status }, { employee: r.employee, manager: r.manager });
  const current = r.cycle.stages.find((s) => s.key === r.next.stage);
  const completeLabel = stage === 'self' ? 'Complete self review' : stage === 'manager' ? 'Complete manager review' : 'Send my input';
  const locked = !editable && (r.role === 'employee' ? r.selfSubmitted : r.status !== 'open');
  const selfLine = (qid: string) => {
    const a = r.self?.answers[qid];
    if (!a || stage === 'self' || shownEntry === r.self) return null;
    return (
      <Text size="sm" tone="secondary">
        Self rating: {label(a.rating)}
        {a.text ? ` · “${a.text}”` : ''}
      </Text>
    );
  };

  const peerPanel = live.peer && (live.peer.shown.length > 0 || live.peer.heldBack > 0 || r.role === 'employee') && (
    <Card title="Peer feedback" actions={<Badge tone="info">Advisory</Badge>}>
      <Text size="sm" tone="secondary">
        Advisory only. It is not averaged into the rating.
      </Text>
      {r.role === 'employee' && !live.peer.released ? (
        <Text tone="secondary">Your peer feedback is shared with you after ratings are released.</Text>
      ) : (
        <>
          <ul className="yx-growth-list">
            {live.peer.shown.map((g) => (
              <li key={g.group} className="yx-growth-list__item">
                <div className="yx-growth-list__main">
                  <strong>{PEER_GROUP[g.group] ?? g.group}</strong>
                  <span className="yx-growth-meta">{g.responses} responses</span>
                  {g.texts.map((t, i) => (
                    <p key={i} className="yx-growth-p">
                      “{t}”
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {live.peer.heldBack > 0 && <InlineAlert tone="info">{live.peer.heldBack} anonymous responses are held back: fewer than 3 in the group, so they can’t be shown without identifying someone.</InlineAlert>}
        </>
      )}
    </Card>
  );

  return (
    <>
      <ObjectHeader
        name={r.employee}
        person
        photoUrl={null}
        secondary={`${r.cycle.name} · ${r.template.name}`}
        status={
          <>
            <Badge tone={locked ? 'success' : 'info'}>{locked ? 'Submitted' : r.next.label}</Badge> <ConfidentialTag />
          </>
        }
        facts={[
          { label: 'Manager', value: r.manager },
          { label: 'Due', value: current ? formatDate(day(current.dueOn)) : '—' },
          { label: r.finalScore !== null ? 'Score' : 'Score so far', value: score.score == null ? 'Pending' : `${score.score.toFixed(2)}${r.band ? ` · ${r.band}` : ''}` },
        ]}
        actions={
          editable ? (
            <>
              <Button loading={busy === 'save'} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button variant="primary" icon={Send} onClick={() => setAsking('submit')}>
                {completeLabel}
              </Button>
            </>
          ) : r.can.skip ? (
            <>
              <Button onClick={() => setAsking('send_back')}>Send back</Button>
              <Button variant="primary" icon={Check} onClick={() => setAsking('agree')}>
                Agree with the review
              </Button>
            </>
          ) : r.can.reopen || (locked && live.onDownload) ? (
            <>
              {locked && live.onDownload && (
                <Button
                  icon={Download}
                  loading={downloading}
                  onClick={() => {
                    setDownloading(true);
                    setFailed(null);
                    live.onDownload!().then(
                      () => setDownloading(false),
                      (e) => {
                        setDownloading(false);
                        setFailed(`The PDF didn’t download. ${errorOf(e)}`);
                      },
                    );
                  }}
                >
                  Download PDF
                </Button>
              )}
              {r.can.reopen && <Button onClick={() => setAsking('reopen')}>Reopen for the manager</Button>}
            </>
          ) : undefined
        }
      />
      <StageTrack stages={stages} nextStep={r.next.owner ? `${r.next.label} by ${r.next.owner}` : r.next.label} />
      {live.nominateHref && (
        <div className="yx-growth-row">
          <Link href={live.nominateHref}>Nominate reviewers</Link>
        </div>
      )}
      {failed && (
        <InlineAlert tone="danger" title="Not saved">
          {failed}
        </InlineAlert>
      )}
      {locked && r.role === 'employee' && (
        <InlineAlert tone="info" title="Submitted">
          Your self review moved to the next stage. You can’t edit it now; HR can reopen it with a reason.
        </InlineAlert>
      )}
      {stage === 'manager' && !r.self && r.selfSubmitted && (
        <InlineAlert tone="info" title="The self review is in">
          Save a draft of your own first; then you can read it.
        </InlineAlert>
      )}
      {stage === 'other' && (
        <InlineAlert tone="info" title="Your input as a former manager">
          {r.manager} now writes the review. Your input is shown to them and HR, not to {r.employee}, and it is not scored.
        </InlineAlert>
      )}
      {r.skipComment && (
        <InlineAlert tone="info" title="Skip-level agreed">
          {r.skipComment}
        </InlineAlert>
      )}
      <SplitLayout
        main={
          <>
            {!shownEntry && !editable ? (
              <EmptyState compact title="Nothing to read yet" description={`${r.next.label}${r.next.owner ? ` is with ${r.next.owner}` : ''}.`} />
            ) : (
              sections.map((s) => (
                <Card key={s.id} title={`${s.title}${s.rated && s.weight ? ` · ${s.weight}%` : ''}`}>
                  {s.kind === 'goals' && r.goals.length > 0 && (
                    <ul className="yx-growth-list" aria-label="Goals in this period">
                      {r.goals.map((g) => (
                        <li key={g.id} className="yx-growth-list__item">
                          <span className="yx-growth-list__title yx-growth-grow">{g.title}</span>
                          <span className="yx-growth-meta">
                            Weight {g.weight}% · progress {Math.round(g.progress)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ul className="yx-growth-list">
                    {s.questions.map((q) => (
                      <li key={q.id} className="yx-growth-list__item">
                        <div className="yx-growth-stack yx-growth-grow" data-gap="sm">
                          {!q.wholeSection && <span className="yx-growth-list__title">{q.text}</span>}
                          {selfLine(q.id)}
                          {q.answer !== 'text' && <RatingScale label={q.wholeSection ? `Rating for ${s.title}` : `Rating for ${q.text}`} value={answers[q.id]?.rating ?? null} onChange={(v) => set(q.id, { rating: v })} disabled={!editable} levels={levels} />}
                          {q.answer !== 'rating' && <TextArea aria-label={q.answer === 'text' ? q.text : `Comment on ${q.wholeSection ? s.title : q.text}`} value={answers[q.id]?.text ?? ''} onChange={(t) => set(q.id, { text: t })} rows={2} maxLength={q.maxChars} disabled={!editable} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))
            )}
            {r.excludedSections.map((t) => (
              <InlineAlert key={t} tone="warning" title={`${t}: no ratings in this section`}>
                It is left out of the score and the other weights are adjusted.
              </InlineAlert>
            ))}
            {(editable || shownEntry) && (
              <Card title={stage === 'manager' || r.role !== 'employee' ? 'Overall rating and summary' : 'Your summary'}>
                {r.template.scoring === 'manager_overall' && (stage === 'manager' || (!editable && shownEntry === r.managerEntry)) && <RatingScale label="Overall rating" value={overall} onChange={setOverall} disabled={!editable} levels={levels} />}
                {stage === 'manager' ? <PotentialChoice value={potential} onChange={setPotential} /> : r.role !== 'employee' && r.proposedPotential ? <PotentialChoice value={r.proposedPotential as 1 | 2 | 3} readOnly /> : null}
                <FormField id="rv-summary" label={stage === 'self' || (r.role === 'employee' && !stage) ? 'What went well, and what you’d like to grow in' : 'Summary for the employee'} optional>
                  <TextArea value={summary} onChange={setSummary} rows={5} maxLength={4000} disabled={!editable} />
                </FormField>
                {stage === 'manager' && live.assistant && <ReviewAssistantPanel assistant={{ enabled: true, live: live.assistant }} summary={summary} rating={overall ?? score.score} onSummary={setSummary} />}
              </Card>
            )}
            {(r.others ?? [])
              .filter((o) => o.status === 'submitted')
              .map((o) => (
                <Card key={o.name} title={`${o.name} (former manager, not scored)`}>
                  {r.template.sections.flatMap((s) =>
                    s.questions
                      .filter((q) => o.answers?.[q.id])
                      .map((q) => (
                        <Text as="p" key={q.id}>
                          {`${q.wholeSection ? s.title : q.text}: ${[o.answers![q.id].rating !== null ? label(o.answers![q.id].rating) : null, o.answers![q.id].text].filter(Boolean).join(' · ')}`}
                        </Text>
                      )),
                  )}
                  {o.comment && <Text as="p">{o.comment}</Text>}
                </Card>
              ))}
          </>
        }
        side={
          <>
            <Card title="Score">
              <ScoreBand score={score.score} band={r.band} pendingText="Pending" />
              {score.pending.length > 0 && <Text size="sm" tone="secondary">Pending: {score.pending.join(', ')}. Pending sections don’t count as 0.</Text>}
              {score.sections.length > 0 && <DescriptionList items={score.sections.map((s) => ({ label: `${s.title} (${s.weight}%)`, value: s.score == null ? 'Pending' : s.score.toFixed(2) }))} />}
            </Card>
            {peerPanel}
            <Card title="History">
              <Timeline today={new Date()} aria-label="Review history" items={r.trail.map<TimelineItem>((t, i) => ({ id: String(i), actor: { name: STAGE_NAME[t.stage] ?? (t.stage === 'release' ? 'Release' : 'Review') }, action: `${t.event.replace('_', ' ')}${t.reason ? ` · ${t.reason}` : ''}`, at: new Date(t.at) }))} />
            </Card>
            {r.can.addOther && (r.formerManagers ?? []).length > 0 && (
              <Card title="Former managers">
                <Text size="sm" tone="secondary">
                  Ask a former manager for advisory input. They see only the questions and their own answers.
                </Text>
                <Button size="sm" onClick={() => setAsking('other')}>
                  Ask a former manager
                </Button>
              </Card>
            )}
          </>
        }
      />
      {asking === 'submit' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAsking(null)}
          title={stage === 'self' ? 'Complete your self review?' : stage === 'other' ? 'Send your input?' : `Complete ${r.employee}’s review?`}
          consequence={stage === 'self' ? `It goes to ${r.manager}. You can’t change it afterwards.` : stage === 'other' ? `It goes to ${r.manager} and HR. You can’t change it afterwards.` : 'The score is worked out from your ratings. You can’t change it afterwards.'}
          confirmLabel={completeLabel}
          onConfirm={async () => {
            await live.onSave(stage!, input(), true);
            done(stage === 'self' ? 'Self review completed' : stage === 'other' ? 'Input sent' : 'Manager review completed', 'It moved to the next stage.');
          }}
        />
      )}
      {asking === 'agree' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAsking(null)}
          title="Agree with the manager’s review?"
          consequence="It moves on to release. You don’t change the rating."
          confirmLabel="Agree"
          onConfirm={async () => {
            await live.onSkip(true, null);
            done('Review agreed', 'It is ready for HR to release.');
          }}
        />
      )}
      {asking === 'send_back' && (
        <PerfReasonDialog title="Send back to the manager?" label="Reason" helper="The manager sees it and completes the review again." confirmLabel="Send back" onClose={() => setAsking(null)} onSave={async (t) => { await live.onSkip(false, t); done('Sent back to the manager'); }} />
      )}
      {asking === 'reopen' && (
        <PerfReasonDialog title="Reopen this review?" consequence="The manager’s review opens again; the employee sees nothing until it is released again." label="Reason" helper="Recorded with your name." confirmLabel="Reopen" onClose={() => setAsking(null)} onSave={async (t) => { await live.onReopen(t); done('Review reopened', `${r.manager} is asked to complete it again.`); }} />
      )}
      {asking === 'other' && <FormerManagerDialog options={r.formerManagers ?? []} onClose={() => setAsking(null)} onSave={async (id) => { await live.onAddOther(id); done('Former manager asked', 'They are notified.'); }} />}
    </>
  );
}

function FormerManagerDialog({ options, onClose, onSave }: { options: Choice[]; onClose: () => void; onSave: (id: string) => Promise<unknown> }) {
  const [who, setWho] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Ask a former manager for input"
      confirmLabel="Ask"
      onConfirm={async () => {
        setTried(true);
        if (!who) {
          document.getElementById('ao-who')?.focus();
          return false;
        }
        await onSave(who);
        onClose();
      }}
    >
      <FormField id="ao-who" label="Former manager" required error={tried && !who ? 'Choose the former manager.' : null} helper="They see only the questions and their own input, never the self review or the rating.">
        <Select aria-label="Former manager" value={who} onChange={setWho} options={options} />
      </FormField>
    </ConfirmDialog>
  );
}

/* ================================================================== PRF-06 · Review acknowledgement (live) */

export interface LiveAcknowledge {
  review: ReviewDetail;
  onAcknowledge: (comment: string | null, disagreement: string | null) => Promise<unknown>;
  onDisagree: (text: string) => Promise<unknown>;
  /** PRF-15: once HR has answered the disagreement, where to escalate it (or see the escalation). */
  escalate?: { href: string; label: string } | null;
  /** PRF-06 "Download review" once it is acknowledged (audited by the API). */
  onDownload?: () => Promise<unknown>;
}

export function LiveReviewAcknowledgeScreen({ live, defaultDisagree }: { live: LiveAcknowledge; defaultDisagree?: boolean }) {
  const phone = useNarrow();
  const { done } = useDone();
  const r = live.review;
  const [comment, setComment] = useState('');
  const [disagree, setDisagree] = useState(Boolean(defaultDisagree));
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const ackAt = r.released?.acknowledgedAt;
  const score = r.finalScore;
  const reasonError = disagree && reason.trim().length < 20 ? 'Say which part you disagree with and why (at least 20 characters).' : null;
  const submit = async () => {
    setTried(true);
    if (reasonError) {
      document.getElementById('ack-reason')?.focus();
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await live.onAcknowledge(comment.trim() || null, disagree ? reason.trim() : null);
      done('Review acknowledged', disagree ? 'Your disagreement went to HR.' : 'You can read it here any time.');
    } catch (e) {
      setFailed(errorOf(e));
    } finally {
      setBusy(false);
    }
  };
  const rating = (
    <Card title="Your released rating">
      <ScoreBand score={score} band={r.band} />
      {r.sectionScores && r.sectionScores.length > 0 && <DescriptionList items={r.sectionScores.map((s) => ({ label: s.title, value: s.score.toFixed(2) }))} />}
      {r.released && (
        <Text size="sm" tone="secondary">
          Released {formatDate(new Date(r.released.at))} by HR{r.excludedSections.length ? `. Not scored: ${r.excludedSections.join(', ')}` : ''}.
        </Text>
      )}
    </Card>
  );
  const managerSummary = r.managerEntry?.comment ? (
    <Card title={`Summary from ${r.manager}`}>
      <p className="yx-growth-p">{r.managerEntry.comment}</p>
    </Card>
  ) : null;
  const body = ackAt ? (
    <div className="yx-growth-stack">
      <InlineAlert tone="info" title={`Acknowledged on ${formatDate(new Date(ackAt))}`}>
        {(r.disagreements ?? []).length ? 'Your rating stays as released while HR looks at your disagreement.' : 'Your review is complete.'}
      </InlineAlert>
      {(r.disagreements ?? []).map((d) => (
        <Card key={d.id} title="Your disagreement" actions={<Badge tone={DISAGREEMENT[d.status].tone}>{DISAGREEMENT[d.status].label}</Badge>}>
          <p className="yx-growth-p">{d.text}</p>
          {d.hrNote && <Text tone="secondary">HR: {d.hrNote}</Text>}
        </Card>
      ))}
      {live.escalate && (
        <div className="yx-growth-row">
          <Link href={live.escalate.href}>{live.escalate.label}</Link>
        </div>
      )}
      {r.can.disagree && (
        <Button onClick={() => setLater(true)}>{`I disagree with this rating${r.released?.disagreeBy ? ` (until ${formatDate(day(r.released.disagreeBy))})` : ''}`}</Button>
      )}
      {rating}
      {managerSummary}
    </div>
  ) : (
    <div className="yx-growth-stack">
      {failed && (
        <InlineAlert tone="danger" title="Not acknowledged">
          {failed}
        </InlineAlert>
      )}
      {rating}
      {managerSummary}
      <FormField id="ack-comment" label="Your comment" optional helper="Your manager and HR see it. It doesn’t change the rating.">
        <TextArea value={comment} onChange={setComment} rows={3} maxLength={2000} />
      </FormField>
      {r.can.disagree && <Checkbox checked={disagree} onChange={setDisagree} label="I disagree with this rating" description={`HR is told and looks at it${r.released?.disagreeBy ? `. You can raise it until ${formatDate(day(r.released.disagreeBy))}` : ''}.`} />}
      {disagree && (
        <FormField id="ack-reason" label="What do you disagree with?" required error={tried ? reasonError : null}>
          <TextArea value={reason} onChange={setReason} rows={3} maxLength={2000} />
        </FormField>
      )}
      <div className="yx-growth-effect" aria-live="polite">
        <span className="yx-growth-effect__title">When you acknowledge</span>
        <ul>
          <li>Your review is marked acknowledged; the rating stays {score == null ? 'as released' : `${score.toFixed(2)}${r.band ? ` · ${r.band}` : ''}`}.</li>
          {disagree ? <li>HR gets your disagreement with your reason, and your manager is told a disagreement was raised.</li> : <li>No one else is notified.</li>}
        </ul>
      </div>
    </div>
  );
  const action = !ackAt && (
    <Button variant="primary" icon={Check} fullWidth={phone} loading={busy} onClick={() => void submit()}>
      {disagree ? 'Acknowledge and send disagreement' : 'Acknowledge review'}
    </Button>
  );
  const laterDialog = later && <PerfReasonDialog title="Disagree with your rating" label="What do you disagree with, and why" min={20} helper="HR reads it and answers. Your rating stays as it is unless HR reopens the review." confirmLabel="Send to HR" onClose={() => setLater(false)} onSave={async (t) => { await live.onDisagree(t); done('Disagreement sent to HR'); }} />;
  if (phone)
    return (
      <GrowthFrame area="performance" active="Reviews & cycles" persona="emp" device="phone" phone={{ title: 'Acknowledge review', back: true }}>
        {body}
        {action && <div className="yx-growth-pinned">{action}</div>}
        {laterDialog}
      </GrowthFrame>
    );
  return (
    <GrowthFrame area="performance" active="Reviews & cycles" persona="emp">
      <PageHeader
        title={ackAt ? 'Your review' : 'Acknowledge your review'}
        description={r.cycle.name}
        status={<ConfidentialTag />}
        actions={
          action ||
          (live.onDownload ? (
            <Button
              icon={Download}
              loading={downloading}
              onClick={() => {
                setDownloading(true);
                setDownloadFailed(null);
                live.onDownload!().then(
                  () => setDownloading(false),
                  (e) => {
                    setDownloading(false);
                    setDownloadFailed(`The review didn’t download. ${errorOf(e)}`);
                  },
                );
              }}
            >
              Download review
            </Button>
          ) : undefined)
        }
      />
      <div className="yx-growth-stack" style={{ maxWidth: 'var(--yx-form-max)' }}>
        {downloadFailed && <InlineAlert tone="danger">{downloadFailed}</InlineAlert>}
        {body}
      </div>
      {laterDialog}
    </GrowthFrame>
  );
}

export { PERF_LINKS };
