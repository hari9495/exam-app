// Hiring › Headcount plan, requisitions, rediscovery, jobs, pay range, internal jobs, referrals, recruiting costs.
// HIR-01, HIR-02, HIR-26, HIR-03, HIR-24, HIR-13, HIR-12, HIR-11 (M10 §3, Q1, YX-ATS-01 / 02 / 12 / 23 / 34 / 39 / 42, P09 Q3).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Briefcase, ExternalLink, Plus, Send, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField, FieldRow, useTooEarly } from '../../components/field';
import { Segment } from '../../components/segment';
import { getCountries } from 'libphonenumber-js';
import { useToastIfAny } from '../../components/notify';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { Drawer } from '../../components/drawer';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { toCsv } from '../../lib/table';
import { downloadText } from '../workforce/workforce-kit';
import { DataTable, type TableColumn } from '../../components/table';
import { MenuItem } from '../../components/menu';
import { ApprovalTimeline, Timeline, type ApprovalStep, type TimelineItem } from '../../components/timeline';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FileUpload } from '../../components/upload';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { PhoneFrame } from '../_kit/frames';
import {
  canPublishJob,
  payHistoryAllowed,
  payRangeIssues,
  planBudgetLeft,
  planLineFree,
  referralBonusStatus,
  requisitionRoute,
  type PayLaw,
  type PayRange,
  type PlanLine,
} from './hiring-logic';
import { ConsentBadges, HireFrame, PostingStrip, RecordLayout, SummaryTiles, useListControls, type ConsentValue, type Posting } from './hiring-kit';
import type { Job, Requisition } from './hiring-data';
import { CustomFieldInputs, missingRequired } from './live/fields';
import { JobSettingsPanel, type LiveJobSettings } from './job-settings';
import type { JobCustomField } from './live/types';
import './hiring.css';

export type ListState = 'ready' | 'loading' | 'error';
const L = (n: number) => formatINR(n);

/* ================================================================== HIR-01 · Headcount plan board */

/** hr-only: refused only because the company shows the plan to HR only; no-access: refused for any other reason. */
export type PlanBoardState = ListState | 'no-access' | 'hr-only';

export interface HeadcountPlanScreenProps {
  fy: string;
  lines: PlanLine[];
  persona: 'hr' | 'finance' | 'hm';
  /** Department the hiring manager owns (HM persona sees only this). */
  myDepartment?: string;
  planStatus: 'Approved' | 'Revision pending' | 'Draft';
  version: number;
  revisionSteps?: ApprovalStep[];
  state?: PlanBoardState;
  now?: Date;
  /** Design state: the status of each department's own plan, shown on its column (plans are kept per department). */
  departmentStatus?: Record<string, { label: string; tone: BadgeTone }>;
  /** Design state: the plan sheet open (HR › Revise plan). */
  editorOpen?: boolean;
  /** Design state: the finance "Send back" reason dialog open. */
  sendBackOpen?: boolean;
}

/** A plan line as the API returns it (one department's plan). */
export interface LivePlanLine {
  id: string;
  designationId: string;
  designation: string;
  gradeId: string | null;
  grade: string | null;
  locationId: string | null;
  location: string | null;
  count: number;
  /** Null: no budget set, or hidden from a hiring manager. */
  budget: number | null;
  /** Openings of live requisitions on the line. */
  committed: number;
  committedBudget: number;
  filled: number;
}

/** One department's plan for a financial year (GET hiring/plans). */
export interface LivePlan {
  id: string;
  departmentId: string;
  department: string;
  fyStart: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  note: string | null;
  /** Concurrency check, sent back on every change. */
  version: number;
  /** "v{n}": goes up when a revision is approved. */
  revisionNo: number;
  lines: LivePlanLine[];
  /** The revision of an approved plan, while it is drafted, waiting or sent back. */
  revision: { status: 'draft' | 'submitted' | 'rejected'; note: string | null; lines: (Omit<LivePlanLine, 'id' | 'committed' | 'committedBudget' | 'filled'> & { id: string | null })[] } | null;
  /** The plan's latest request to approvers, while it waits or after it was sent back. */
  approval: {
    kind: 'plan' | 'revision';
    status: string;
    reason: string | null;
    submittedAt: string | null;
    submittedBy: string | null;
    steps: { name: string; state: string; approvers: string[]; at: string | null }[];
    /** The viewer's own open task on the current step: they may decide it here. */
    myTaskId: string | null;
  } | null;
}

export interface PlanInput {
  departmentId: string;
  fyStart: number;
  note: string | null;
  lines: { id: string | null; designationId: string; gradeId: string | null; locationId: string | null; count: number; budget: number | null }[];
  version?: number;
}

export interface PlanChoice {
  value: string;
  label: string;
}

/** The live board: HR (ats.headcount.manage) or a hiring manager (their own department, read-only; decision 11). */
export interface LiveHeadcountPlan {
  persona: 'hr' | 'hm';
  /** hr-only: the company shows the plan to HR only (ats.headcount_plan.manager_view); no-access: any other refusal. */
  state: PlanBoardState;
  onRetry: () => void;
  fy: number;
  years: number[];
  onFy: (fy: number) => void;
  plans: LivePlan[];
  choices: { departments: PlanChoice[]; designations: PlanChoice[]; grades: PlanChoice[]; locations: PlanChoice[] };
  /** Acting for someone else: nothing is changed (the API refuses it too). */
  readOnly?: boolean;
  onSave: (planId: string | null, input: PlanInput) => Promise<LivePlan>;
  onSubmit: (planId: string, version: number) => Promise<void>;
  onDecide: (taskId: string, decision: 'approve' | 'reject', reason: string | null) => Promise<void>;
  /** A hiring manager who may raise requisitions: opens the request sheet on this line (null: choose a line). */
  onRequisition?: (lineId: string | null) => void;
  now?: Date;
}

const fyText = (y: number) => `FY ${y}–${String(y + 1).slice(2)}`;
const PLAN_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Waiting for approval', tone: 'warning' },
  rejected: { label: 'Sent back', tone: 'danger' },
};
const REV_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Revision draft', tone: 'neutral' },
  submitted: { label: 'Revision pending', tone: 'warning' },
  rejected: { label: 'Revision sent back', tone: 'danger' },
};
/** A department's plan as its column shows it. */
export const livePlanBadge = (p: LivePlan) =>
  p.status !== 'approved' ? PLAN_STATE[p.status] : p.revision ? REV_STATE[p.revision.status] : { label: `Approved · v${p.revisionNo}`, tone: 'success' as BadgeTone };
const STEP_STATE: Record<string, ApprovalStep['status']> = { approved: 'done', rejected: 'rejected', skipped: 'skipped', waiting: 'current' };

/** What a waiting revision changes, in words: "Adds 2 positions and ₹12,00,000 budget." */
export function revisionChange(p: LivePlan): string {
  const lines = p.revision?.lines ?? [];
  const dPos = lines.reduce((t, l) => t + l.count, 0) - p.lines.reduce((t, l) => t + l.count, 0);
  const dBudget = lines.reduce((t, l) => t + (l.budget ?? 0), 0) - p.lines.reduce((t, l) => t + (l.budget ?? 0), 0);
  const ps = [dPos ? { dir: dPos < 0 ? 'removes' : 'adds', text: `${Math.abs(dPos)} position${Math.abs(dPos) === 1 ? '' : 's'}` } : null, dBudget ? { dir: dBudget < 0 ? 'removes' : 'adds', text: `${L(Math.abs(dBudget))} budget` } : null].filter((x): x is { dir: string; text: string } => Boolean(x));
  const text = !ps.length ? 'changes lines without changing the totals' : ps.length === 2 && ps[0].dir === ps[1].dir ? `${ps[0].dir} ${ps[0].text} and ${ps[1].text}` : ps.map((x) => `${x.dir} ${x.text}`).join(' and ');
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

interface PlanBoardView {
  fy: string;
  persona: 'hr' | 'finance' | 'hm';
  facts?: string;
  status: ReactNode;
  lines: PlanLine[];
  departmentStatus?: Record<string, { label: string; tone: BadgeTone }>;
  alerts?: ReactNode;
  actions: ReactNode;
  state: PlanBoardState;
  onRetry?: () => void;
  emptyAction?: ReactNode;
  /** Budgets are not shown to hiring managers. */
  budgets: boolean;
  lineAction?: (l: PlanLine) => ReactNode;
  children?: ReactNode;
}

/** The board itself; the design stories and the live page both render it. */
function PlanBoard({ fy, persona, facts, status, lines: shown, departmentStatus, alerts, actions, state, onRetry, emptyAction, budgets, lineAction, children }: PlanBoardView) {
  const depts = Array.from(new Set(shown.map((l) => l.department)));
  const sum = (f: (l: PlanLine) => number) => shown.reduce((s, l) => s + f(l), 0);
  const budget = sum((l) => l.budget);
  const committed = sum((l) => l.committed);
  return (
    <HireFrame active="Headcount plan">
      <PageHeader title="Headcount plan" status={status} description={`${fy} · positions by designation, grade and location, with budget. Requisitions draw it down; replacement hires don't use plan lines.`} facts={state === 'no-access' || state === 'hr-only' ? undefined : facts} actions={actions} />
      {state === 'loading' ? (
        <div className="yx-hire-board" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={240} />
          ))}
        </div>
      ) : state === 'hr-only' ? (
        <EmptyState title="Only HR sees the headcount plan" description="Your company shows the headcount plan to HR only. Ask HR for your department's numbers." />
      ) : state === 'no-access' ? (
        <NoAccessState what="the headcount plan" grantedBy="your System Admin" note="Your System Admin gives this through Roles & access: the Hiring admin role for every plan, or the Hiring manager role for your own department." />
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load the headcount plan" description="Check your connection and try again. Your plan is unchanged." onRetry={onRetry ?? (() => {})} reference="HC-5021" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={`No headcount plan for ${fy} yet`}
          description="Add positions per department with designation, grade, location and budget. HR and finance approve the plan before requisitions can draw it down."
          action={emptyAction}
        />
      ) : (
        <>
          {alerts}
          <SummaryTiles
            label="Plan summary"
            tiles={[
              { label: 'Approved positions', value: sum((l) => l.approved) },
              { label: 'Filled', value: sum((l) => l.filled) },
              { label: 'Open requisitions', value: sum((l) => l.open) },
              { label: 'Free to requisition', value: sum(planLineFree) },
              ...(budget > 0 ? [{ label: 'Budget committed', value: L(committed), sub: `of ${L(budget)} (${Math.round((committed / budget) * 100)}%)`, tone: committed / budget > 0.9 ? ('warning' as const) : ('default' as const) }] : []),
            ]}
          />
          <div className="yx-hire-board" role="list" aria-label="Plan lines by department">
            {depts.map((d) => {
              const ls = shown.filter((l) => l.department === d);
              const ds = departmentStatus?.[d];
              return (
                <section key={d} className="yx-hire-board__col" role="listitem" aria-label={d}>
                  <header className="yx-hire-board__head">
                    <span className="yx-hire-board__title">
                      <Text weight="semibold">{d}</Text>
                      {ds && <Badge tone={ds.tone}>{ds.label}</Badge>}
                    </span>
                    <Text size="sm" tone="secondary">
                      {ls.reduce((s, l) => s + l.filled, 0)} of {ls.reduce((s, l) => s + l.approved, 0)} filled
                    </Text>
                  </header>
                  {ls.map((l) => {
                    const free = planLineFree(l);
                    const left = planBudgetLeft(l);
                    return (
                      <article key={l.id} className="yx-hire-board__card">
                        <Text weight="semibold">{l.designation}</Text>
                        <Text size="sm" tone="secondary">
                          {[l.grade, l.location].filter(Boolean).join(' · ') || 'Any grade and location'}
                        </Text>
                        <dl className="yx-hire-mini">
                          <div>
                            <dt>Approved</dt>
                            <dd>{l.approved}</dd>
                          </div>
                          <div>
                            <dt>Filled</dt>
                            <dd>{l.filled}</dd>
                          </div>
                          <div>
                            <dt>Open</dt>
                            <dd>{l.open}</dd>
                          </div>
                          <div>
                            <dt>Free</dt>
                            <dd>{free}</dd>
                          </div>
                        </dl>
                        {budgets && l.budget > 0 && <Meter value={l.committed} max={l.budget} label={`Budget used, ${l.designation}`} warnAt={90} valueText={`${L(l.committed)} of ${L(l.budget)}`} />}
                        {free === 0 ? <Badge tone="warning">Fully drawn: a new requisition goes outside plan</Badge> : budgets && l.budget > 0 && left < 0 ? <Badge tone="danger">Over budget</Badge> : null}
                        {persona === 'hm' && free > 0 && lineAction?.(l)}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}
      {children}
    </HireFrame>
  );
}

// HIR-01
export function HeadcountPlanScreen(props: HeadcountPlanScreenProps | { live: LiveHeadcountPlan }) {
  return 'live' in props ? <LiveHeadcountPlanBoard live={props.live} /> : <SampleHeadcountPlan {...props} />;
}

function SampleHeadcountPlan(props: HeadcountPlanScreenProps) {
  const { fy, lines, persona, myDepartment, planStatus, version, revisionSteps, state = 'ready', now, departmentStatus, editorOpen = false, sendBackOpen = false } = props;
  const shown = persona === 'hm' && myDepartment ? lines.filter((l) => l.department === myDepartment) : lines;
  const depts = Array.from(new Set(shown.map((l) => l.department)));
  const statusTone: BadgeTone = planStatus === 'Approved' ? 'success' : planStatus === 'Draft' ? 'neutral' : 'warning';
  const [year, setYear] = useState(fy);
  const years = <Segment label="Financial year" options={['FY 2025–26', 'FY 2026–27', 'FY 2027–28'].map((v) => ({ value: v, label: v }))} value={year} onChange={setYear} />;
  const actions =
    persona === 'hr' ? (
      <>
        {years}
        <Button>Export</Button>
        <Button variant="primary">Revise plan</Button>
      </>
    ) : persona === 'finance' ? (
      planStatus === 'Revision pending' ? (
        <>
          <Button>Send back</Button>
          <Button variant="primary">Approve revision</Button>
        </>
      ) : (
        <Button>Export</Button>
      )
    ) : (
      <Button variant="primary" icon={Plus}>
        Open requisition
      </Button>
    );
  return (
    <PlanBoard
      fy={fy}
      persona={persona}
      facts={persona === 'hm' ? `Showing ${myDepartment} only` : `${depts.length} departments · approved by HR and finance`}
      status={<Badge tone={statusTone}>{planStatus} · v{version}</Badge>}
      lines={shown}
      departmentStatus={departmentStatus}
      alerts={
        planStatus === 'Revision pending' &&
        revisionSteps && (
          <InlineAlert tone="warning" title={`Revision v${version} waiting for approval`}>
            Adds 2 Shift Lead positions at Hosur and ₹12,00,000 budget. Requisitions keep drawing on v{version - 1} until it is approved.
            <ApprovalTimeline steps={revisionSteps} now={now} />
          </InlineAlert>
        )
      }
      actions={actions}
      state={state}
      emptyAction={persona === 'hr' ? <Button variant="primary" icon={Plus}>Create plan</Button> : undefined}
      budgets={persona !== 'hm'}
      lineAction={() => (
        <Button size="sm" icon={Plus}>
          Open requisition
        </Button>
      )}
    >
      {editorOpen && <PlanEditorDrawer open onOpenChange={() => {}} fy={2026} plans={SAMPLE_EDITOR_PLANS} choices={SAMPLE_EDITOR_CHOICES} defaultDepartment="d2" />}
      {sendBackOpen && <SendBackDialog open onOpenChange={() => {}} what="Operations revision v3" />}
    </PlanBoard>
  );
}

/** Sample plans and masters for the plan sheet design story. */
const SAMPLE_EDITOR_CHOICES: LiveHeadcountPlan['choices'] = {
  departments: [{ value: 'd1', label: 'Engineering' }, { value: 'd2', label: 'Operations' }, { value: 'd3', label: 'Sales' }],
  designations: [{ value: 'x1', label: 'Shift Lead' }, { value: 'x2', label: 'Machine Operator' }, { value: 'x3', label: 'Software Engineer' }],
  grades: [{ value: 'g3', label: 'G3' }, { value: 'g4', label: 'G4' }],
  locations: [{ value: 'c1', label: 'Hosur plant' }, { value: 'c2', label: 'Chennai office' }],
};
const SAMPLE_EDITOR_PLANS: LivePlan[] = [
  { id: 'p2', departmentId: 'd2', department: 'Operations', fyStart: 2026, status: 'approved', note: null, version: 7, revisionNo: 2, revision: null, approval: null, lines: [{ id: 'l1', designationId: 'x1', designation: 'Shift Lead', gradeId: 'g4', grade: 'G4', locationId: 'c1', location: 'Hosur plant', count: 5, budget: 36_00_000, committed: 2, committedBudget: 14_80_000, filled: 1 }] },
];

type EditRow = { key: number; id: string | null; designationId: string | null; gradeId: string | null; locationId: string | null; count: number | null; budget: number | null; min: number };

export interface PlanEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fy: number;
  /** The year's plans: choosing a department picks up its draft, or revises its approved plan. */
  plans: LivePlan[];
  choices: LiveHeadcountPlan['choices'];
  defaultDepartment?: string | null;
  onSave?: LiveHeadcountPlan['onSave'];
  onSubmit?: LiveHeadcountPlan['onSubmit'];
}

/** HIR-01 plan sheet: a new plan, a draft, or the revision of an approved plan, for one department and year. */
export function PlanEditorDrawer({ open, onOpenChange, fy, plans, choices, defaultDepartment = null, onSave, onSubmit }: PlanEditorDrawerProps) {
  const toast = useToastIfAny();
  const [dept, setDept] = useState<string | null>(defaultDepartment);
  const plan = plans.find((p) => p.departmentId === dept) ?? null;
  const revising = plan?.status === 'approved';
  const locked = plan ? (revising ? plan.revision?.status === 'submitted' : plan.status === 'submitted') : false;
  const seed = (p: LivePlan | null): EditRow[] => {
    const src = p ? (p.status === 'approved' && p.revision ? p.revision.lines : p.lines) : [];
    const used = (id: string | null) => {
      const l = p?.lines.find((x) => x.id === id);
      return l && p?.status === 'approved' ? l.committed + l.filled : 0;
    };
    const rows = src.map((l, i) => ({ key: i, id: p?.status === 'approved' ? l.id : null, designationId: l.designationId, gradeId: l.gradeId, locationId: l.locationId, count: l.count, budget: l.budget, min: used(l.id) }));
    return rows.length ? rows : [{ key: 0, id: null, designationId: null, gradeId: null, locationId: null, count: 1, budget: null, min: 0 }];
  };
  const [rows, setRows] = useState<EditRow[]>(() => seed(plan));
  const [note, setNote] = useState(plan ? ((revising ? plan.revision?.note : plan.note) ?? plan.note ?? '') : '');
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const pick = (v: string | null) => {
    const p = plans.find((x) => x.departmentId === v) ?? null;
    setDept(v);
    setRows(seed(p));
    setNote(p ? ((p.status === 'approved' ? p.revision?.note : p.note) ?? p.note ?? '') : '');
    setFailed(null);
  };
  const set = (key: number, patch: Partial<EditRow>) => {
    setDirty(true);
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };
  const rowError = (r: EditRow) => (!r.designationId ? 'designation' : !r.count || r.count < Math.max(1, r.min) ? 'count' : null);
  const go = async (send: boolean) => {
    setTried(true);
    setFailed(null);
    if (!dept || rows.some(rowError)) {
      // Pressed too early: the first field with an error takes the focus.
      requestAnimationFrame(() => body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!onSave) return;
    setBusy(send ? 'send' : 'save');
    try {
      const saved = await onSave(plan?.id ?? null, { departmentId: dept, fyStart: fy, note: note.trim() || null, lines: rows.map((r) => ({ id: r.id, designationId: r.designationId!, gradeId: r.gradeId, locationId: r.locationId, count: r.count!, budget: r.budget })), ...(plan ? { version: plan.version } : {}) });
      const name = choices.departments.find((d) => d.value === dept)?.label ?? 'The';
      if (send && onSubmit) await onSubmit(saved.id, saved.version);
      toast?.toast({ tone: 'success', title: send ? `${name} ${revising ? 'revision' : 'plan'} sent for approval` : `${name} ${revising ? 'revision' : 'plan'} saved as a draft` });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const total = rows.reduce((t, r) => t + (r.count ?? 0), 0);
  const budget = rows.reduce((t, r) => t + (r.budget ?? 0), 0);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={revising ? `Revise plan · v${(plan?.revisionNo ?? 1) + 1}` : plan ? 'Edit plan' : 'New plan'}
      subtitle={`${fyText(fy)} · ${revising ? `requisitions keep using v${plan?.revisionNo} until the revision is approved` : 'HR and finance approve it before requisitions can use it'}`}
      dirty={dirty}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {!locked && (
            <>
              <Button loading={busy === 'save'} onClick={() => void go(false)}>
                Save draft
              </Button>
              <Button variant="primary" icon={Send} loading={busy === 'send'} onClick={() => void go(true)}>
                Send for approval
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="yx-hire-sheet" ref={body}>
        <div className="yx-hire-sheet__form">
          <FormField label="Department" required error={tried && !dept ? 'Choose the department.' : null}>
            <Select value={dept} onChange={pick} options={choices.departments} searchable />
          </FormField>
          {locked && <InlineAlert tone="info" title="This plan is with the approvers">You can change it again after they answer.</InlineAlert>}
          {!locked &&
            rows.map((r, i) => {
              const err = tried ? rowError(r) : null;
              return (
                <div key={r.key} className="yx-hire-planline" role="group" aria-label={`Line ${i + 1}`}>
                  <Text weight="semibold">Line {i + 1}</Text>
                  <FieldRow>
                    <FormField label="Designation" required error={err === 'designation' ? 'Choose the designation.' : null}>
                      <Select value={r.designationId} onChange={(v) => set(r.key, { designationId: v })} options={choices.designations} searchable disabled={r.min > 0} />
                    </FormField>
                    <FormField label="Grade" optional>
                      <Select value={r.gradeId} onChange={(v) => set(r.key, { gradeId: v })} options={choices.grades} clearable />
                    </FormField>
                    <FormField label="Location" optional>
                      <Select value={r.locationId} onChange={(v) => set(r.key, { locationId: v })} options={choices.locations} clearable />
                    </FormField>
                  </FieldRow>
                  <FieldRow>
                    <FormField label="Positions" required helper={r.min ? `At least ${r.min}: open requisitions and hires` : undefined} error={err === 'count' ? `Enter at least ${Math.max(1, r.min)}.` : null}>
                      <NumberField value={r.count} onChange={(v) => set(r.key, { count: v })} min={1} max={10000} />
                    </FormField>
                    <FormField label="Budget (annual CTC)" optional>
                      <CurrencyField value={r.budget} onChange={(v) => set(r.key, { budget: v })} />
                    </FormField>
                  </FieldRow>
                  {rows.length > 1 && r.min === 0 && (
                    <Button size="sm" icon={Trash2} onClick={() => (setDirty(true), setRows((x) => x.filter((y) => y.key !== r.key)))}>
                      Remove line {i + 1}
                    </Button>
                  )}
                </div>
              );
            })}
          {!locked && (
            <>
              <Button size="sm" icon={Plus} onClick={() => (setDirty(true), setRows((x) => [...x, { key: Math.max(...x.map((y) => y.key)) + 1, id: null, designationId: null, gradeId: null, locationId: null, count: 1, budget: null, min: 0 }]))}>
                Add a line
              </Button>
              <FormField label="Note for the approvers" optional>
                <TextArea value={note} onChange={(v) => (setDirty(true), setNote(v))} rows={2} maxLength={1000} />
              </FormField>
            </>
          )}
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="What happens">
          <Text weight="semibold">What happens</Text>
          <Text as="p" size="sm" tone="secondary">
            {total} position{total === 1 ? '' : 's'}
            {budget ? ` · ${L(budget)} budget` : ''}
          </Text>
          <Text as="p" size="sm" tone="secondary">
            {revising
              ? 'The approvers see what changes. A line with open requisitions or hires keeps its designation and at least that many positions.'
              : 'It goes to the people who approve headcount plans. You follow it in Approvals.'}
          </Text>
        </aside>
      </div>
    </Drawer>
  );
}

/** Finance › Send back: the reason goes to HR with the plan. */
function SendBackDialog({ open, onOpenChange, what, onSend, consequence = 'HR sees your reason and can change it and send it again.', who = 'HR' }: { open: boolean; onOpenChange: (o: boolean) => void; what: string; onSend?: (reason: string) => Promise<void>; consequence?: string; who?: string }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Send back the ${what}?`}
      consequence={consequence}
      confirmLabel="Send back"
      onConfirm={async () => {
        setTried(true);
        if (!reason.trim()) return false;
        await onSend?.(reason.trim());
      }}
    >
      <FormField label="Reason" required error={tried && !reason.trim() ? `Enter a reason so ${who} knows what to change.` : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

function LiveHeadcountPlanBoard({ live }: { live: LiveHeadcountPlan }) {
  const toast = useToastIfAny();
  const [editing, setEditing] = useState<{ dept: string | null } | null>(null);
  const [sendBack, setSendBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const { plans, persona } = live;
  const hm = persona === 'hm';
  const fy = fyText(live.fy);
  const lines: PlanLine[] = plans.flatMap((p) => p.lines.map((l) => ({ id: l.id, department: p.department, designation: l.designation, grade: l.grade ?? '', location: l.location ?? '', approved: l.count, filled: l.filled, open: l.committed, budget: l.budget ?? 0, committed: l.committedBudget })));
  const mine = hm || live.readOnly ? undefined : plans.find((p) => p.approval?.myTaskId && p.approval.status === 'pending');
  const what = (p: LivePlan) => (p.approval?.kind === 'revision' ? `${p.department} revision v${p.revisionNo + 1}` : `${p.department} plan`);
  const decide = async (decision: 'approve' | 'reject', reason: string | null) => {
    if (!mine?.approval?.myTaskId) return;
    setBusy(true);
    try {
      await live.onDecide(mine.approval.myTaskId, decision, reason);
      toast?.toast({ tone: 'success', title: decision === 'approve' ? `Approved: ${what(mine)}` : `Sent back: ${what(mine)}`, description: 'HR is told by email and in their bell.' });
    } catch (e) {
      toast?.toast({ tone: 'error', title: `Could not decide the ${what(mine)}`, description: (e as Error).message });
      if (decision === 'reject') throw e;
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () =>
    downloadText(
      `headcount-plan-${live.fy}.csv`,
      toCsv(
        ['Department', 'Designation', 'Grade', 'Location', 'Approved', 'Filled', 'Open requisitions', 'Free', ...(hm ? [] : ['Budget', 'Budget committed'])],
        lines.map((l) => [l.department, l.designation, l.grade, l.location, String(l.approved), String(l.filled), String(l.open), String(planLineFree(l)), ...(hm ? [] : [String(l.budget), String(l.committed)])]),
      ),
    );
  const pending = plans.filter((p) => p.approval?.status === 'pending');
  const revNos = new Set(plans.map((p) => p.revisionNo));
  const statusLabel = !plans.length ? null : pending.length ? (pending.some((p) => p.approval!.kind === 'revision') ? 'Revision pending' : 'Waiting for approval') : plans.every((p) => p.status === 'approved') ? 'Approved' : 'Draft';
  const years = <Segment label="Financial year" options={live.years.map((y) => ({ value: y, label: fyText(y) }))} value={live.fy} onChange={live.onFy} />;
  const actions = hm ? (
    <>
      {years}
      {live.onRequisition && (
        <Button variant="primary" icon={Plus} onClick={() => live.onRequisition!(null)}>
          Open requisition
        </Button>
      )}
    </>
  ) : mine ? (
    <>
      {years}
      <Button onClick={() => setSendBack(true)} disabled={busy}>
        Send back
      </Button>
      <Button variant="primary" loading={busy} onClick={() => void decide('approve', null).catch(() => undefined)}>
        {mine.approval!.kind === 'revision' ? 'Approve revision' : 'Approve plan'}
      </Button>
    </>
  ) : (
    <>
      {years}
      <Button onClick={exportCsv}>Export</Button>
      {!live.readOnly && (
        <Button variant="primary" onClick={() => setEditing({ dept: null })}>
          {plans.length ? 'Revise plan' : 'Create plan'}
        </Button>
      )}
    </>
  );
  const alerts = plans
    .filter((p) => p.approval)
    .map((p) => {
      const a = p.approval!;
      if (a.status === 'rejected')
        return (
          <InlineAlert key={p.id} tone="danger" title={`${what(p)} sent back`}>
            {a.reason ? `“${a.reason}” ` : ''}Change it with Revise plan and send it again.
          </InlineAlert>
        );
      if (a.status !== 'pending') return null;
      const steps: ApprovalStep[] = [
        { id: 's0', label: 'Submitted', status: 'done', ...(a.submittedBy ? { approver: a.submittedBy } : {}), ...(a.submittedAt ? { at: new Date(a.submittedAt) } : {}) },
        ...a.steps.map((s, i) => ({ id: `s${i + 1}`, label: s.name, status: STEP_STATE[s.state] ?? ('pending' as const), ...(s.approvers.length ? { approver: s.approvers.join(', ') } : {}), ...(s.at && s.state !== 'waiting' ? { at: new Date(s.at) } : {}) })),
      ];
      return (
        <InlineAlert key={p.id} tone="warning" title={`${a.kind === 'revision' ? `Revision v${p.revisionNo + 1} of ${p.department}` : `${p.department} plan`} waiting for approval`}>
          {a.kind === 'revision' ? `${revisionChange(p)} Requisitions keep drawing on v${p.revisionNo} until it is approved.` : 'Requisitions can use it once it is approved.'}
          <ApprovalTimeline steps={steps} now={live.now} />
        </InlineAlert>
      );
    });
  return (
    <PlanBoard
      fy={fy}
      persona={mine ? 'finance' : persona}
      facts={hm ? `Showing ${plans.map((p) => p.department).join(', ') || 'your department'} only · read-only` : `${plans.length} department${plans.length === 1 ? '' : 's'} · approved by HR and finance${live.readOnly ? ' · read-only while acting for someone else' : ''}`}
      status={statusLabel && <Badge tone={statusLabel === 'Approved' ? 'success' : statusLabel === 'Draft' ? 'neutral' : 'warning'}>{revNos.size === 1 ? `${statusLabel} · v${[...revNos][0]}` : statusLabel}</Badge>}
      lines={lines}
      departmentStatus={Object.fromEntries(plans.map((p) => [p.department, livePlanBadge(p)]))}
      alerts={alerts}
      actions={actions}
      state={live.state}
      onRetry={live.onRetry}
      emptyAction={
        hm || live.readOnly ? undefined : (
          <Button variant="primary" icon={Plus} onClick={() => setEditing({ dept: null })}>
            Create plan
          </Button>
        )
      }
      budgets={!hm}
      lineAction={
        live.onRequisition
          ? (l) => (
              <Button size="sm" icon={Plus} onClick={() => live.onRequisition!(l.id)}>
                Open requisition
              </Button>
            )
          : undefined
      }
    >
      {editing && <PlanEditorDrawer open onOpenChange={(o) => !o && setEditing(null)} fy={live.fy} plans={plans} choices={live.choices} defaultDepartment={editing.dept} onSave={live.onSave} onSubmit={live.onSubmit} />}
      {mine && <SendBackDialog open={sendBack} onOpenChange={setSendBack} what={what(mine)} onSend={(r) => decide('reject', r)} />}
    </PlanBoard>
  );
}

/* ================================================================== HIR-26 · Rediscovery panel */

export interface RediscoveryMatch {
  id: string;
  name: string;
  lastRole: string;
  lastStage: string;
  reasons: string[];
  consent: { email: ConsentValue; whatsapp: ConsentValue };
  retentionUntil: Date;
  pool?: string;
  /** The company's AI's short "why" (advice only; it never changes who is listed or the order). */
  aiNote?: string | null;
  /** Answer 255: already suggested to the requisition's recruiter. */
  suggested?: boolean;
}

/** The live panel for one requisition (GET hiring/requisitions/:id/rediscovery); the page shows the toasts. */
export interface LiveRediscovery {
  state: ListState;
  onRetry: () => void;
  /** text: the plain search (AI off, not set up, failed, or acting for someone); ai: plus the AI's notes. */
  mode: 'ai' | 'text';
  ai: 'on' | 'off' | 'not_set_up' | 'failed';
  matches: RediscoveryMatch[];
  /** Recruiting only, signed in as themselves: adds the person to this requisition's pipeline. */
  onAdd?: (m: RediscoveryMatch) => Promise<void>;
  /** Answer 254, recruiting: opens the candidate email, only for someone who opted in to email. */
  onContact?: (m: RediscoveryMatch) => void;
  /** Answer 255, a hiring manager: a bell notice to the requisition's recruiter, once per person. */
  onSuggest?: (m: RediscoveryMatch) => Promise<void>;
}

const AI_TEXT: Record<LiveRediscovery['ai'], string> = {
  on: 'Notes by your company’s AI are advice only: they never change who is listed or the order. You decide.',
  off: 'Plain search: AI notes are off for your company. You decide.',
  not_set_up: 'Plain search: your company has no AI set up. You decide.',
  failed: 'Plain search: the AI did not answer this time. You decide.',
};

// HIR-26
export function RediscoveryPanel({ matches: sample, viewer, onAdd, live }: { matches: RediscoveryMatch[]; viewer: 'recruiter' | 'hm'; onAdd?: (id: string) => void; live?: LiveRediscovery }) {
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const matches = live ? live.matches : sample;
  const suggest = async (m: RediscoveryMatch) => {
    if (!live?.onSuggest) return;
    setBusy(m.id);
    try {
      await live.onSuggest(m);
      setSuggested((x) => [...x, m.id]);
    } catch {
      // The page shows why in a toast.
    } finally {
      setBusy(null);
    }
  };
  // Never greyed out: without an email opt-in the button says why instead.
  const contact = (m: RediscoveryMatch) => (m.consent.email === 'opted-in' ? (setWhy(null), live?.onContact?.(m)) : setWhy(m.id));
  const add = async (m: RediscoveryMatch) => {
    if (!live?.onAdd) return;
    setBusy(m.id);
    try {
      await live.onAdd(m);
      setAdded((a) => [...a, m.id]);
    } catch {
      // The page shows why in a toast; the button stays so it can be tried again.
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Past candidates to consider" actions={live?.state === 'ready' || !live ? <Badge tone="info">{matches.length} suggested</Badge> : undefined}>
      <Text as="p" size="sm" tone="secondary">
        {live
          ? 'Past candidates matched on this requisition’s words: past roles, skills and location. Only people who agreed to be kept for other roles, within their retention period, appear here.'
          : 'Silver medallists and pool members matched on skills and location. Only people whose consent and retention period are still valid appear here.'}
      </Text>
      {live && live.state === 'ready' && (
        <Text as="p" size="sm" tone="secondary">
          {AI_TEXT[live.ai]}
        </Text>
      )}
      {live?.state === 'loading' ? (
        <Skeleton height={120} />
      ) : live?.state === 'error' ? (
        <ErrorState title="Couldn't load past candidates" description="Check your connection and try again." onRetry={live.onRetry} reference="HIR-26" />
      ) : matches.length === 0 ? (
        <EmptyState compact title="No past candidates match this requisition." description={live ? 'Suggestions change when the title, designation or description change, or when new people agree to be kept.' : 'Suggestions refresh when the skills or location change.'} />
      ) : (
        <ul className="yx-hire-list">
          {matches.map((m) => (
            <li key={m.id} className="yx-hire-list__item">
              <div className="yx-hire-list__main">
                <PersonLabel name={m.name} secondary={`${m.lastRole} · reached ${m.lastStage}`} />
                <div className="yx-hire-chips">
                  {m.reasons.map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                  {m.pool && <Badge tone="info">Pool: {m.pool}</Badge>}
                </div>
                {m.aiNote && (
                  <Text as="p" size="sm" tone="secondary">
                    <Sparkles size={14} aria-hidden /> AI note, advice only: {m.aiNote}
                  </Text>
                )}
                <ConsentBadges email={m.consent.email} whatsapp={m.consent.whatsapp} />
                <Text size="xs" tone="muted">
                  Retention until {formatDate(m.retentionUntil)}
                </Text>
              </div>
              {live ? (
                <div className="yx-hire-list__actions">
                  {live.onContact && (
                    <Button size="sm" onClick={() => contact(m)}>
                      Contact
                    </Button>
                  )}
                  {live.onAdd &&
                    (added.includes(m.id) ? (
                      <Badge tone="success">Added to pipeline</Badge>
                    ) : (
                      <Button size="sm" icon={UserPlus} loading={busy === m.id} onClick={() => void add(m)}>
                        Add to pipeline
                      </Button>
                    ))}
                  {live.onSuggest &&
                    (m.suggested || suggested.includes(m.id) ? (
                      <Badge tone="success">Suggested to recruiter</Badge>
                    ) : (
                      <Button size="sm" loading={busy === m.id} onClick={() => void suggest(m)}>
                        Suggest to recruiter
                      </Button>
                    ))}
                  {why === m.id && (
                    <Text as="p" size="sm" tone="secondary" role="status">
                      {m.name} has not agreed to email from us, so you can&apos;t contact them here.
                    </Text>
                  )}
                </div>
              ) : viewer === 'recruiter' ? (
                <div className="yx-hire-list__actions">
                  <Button size="sm" disabled={m.consent.email !== 'opted-in' && m.consent.whatsapp !== 'opted-in'}>
                    Contact
                  </Button>
                  <Button
                    size="sm"
                    icon={added.includes(m.id) ? undefined : UserPlus}
                    disabled={added.includes(m.id)}
                    onClick={() => {
                      setAdded((a) => [...a, m.id]);
                      onAdd?.(m.id);
                    }}
                  >
                    {added.includes(m.id) ? 'Added to pipeline' : 'Add to pipeline'}
                  </Button>
                </div>
              ) : (
                <div className="yx-hire-list__actions">
                  <Button size="sm">Suggest to recruiter</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <span className="yx-visually-hidden" aria-live="polite">
        {added.length ? `${added.length} added to the pipeline` : ''}
      </span>
    </Card>
  );
}

/* ================================================================== HIR-02 · Requisitions */

export interface RequisitionsScreenProps {
  rows: Requisition[];
  planLines: PlanLine[];
  persona: 'hm' | 'recruiter';
  me?: string;
  openId?: string | null;
  sheetOpen?: boolean;
  rediscovery?: RediscoveryMatch[];
  state?: ListState;
  now?: Date;
  live?: LiveRequisitions;
  /** Design state: the viewer holds the open requisition's approval task (Approve / Send back in the drawer). */
  approver?: boolean;
  /** Design state: the Cancel requisition dialog open for this row. */
  cancelId?: string | null;
  /** Design state: the Assign recruiter dialog open. */
  assignOpen?: boolean;
}

/** A requisition as the live list reads it (GET hiring/requisitions). */
export type LiveRequisitionRow = Omit<Requisition, 'proposedMax' | 'planLineId'> & {
  proposedMax: number | null;
  /** The approved plan line it draws on (budget 0 when it is not shown to the viewer). */
  line: PlanLine | null;
  outsidePlan: boolean;
  outsidePlanReason: string | null;
  /** Why the approvers sent it back. */
  sentBackReason: string | null;
  /** The route: submitted, then each step as the approvals engine ran it. */
  steps: ApprovalStep[];
  /** Answer 257: the viewer holds the approval task on its current step. */
  canDecide: boolean;
  /** Answer 252: the viewer's own requisition (a hiring manager changes it when sent back). */
  mine: boolean;
  cancelReason: string | null;
};

/** The live list (HIR-02): recruiting and HR see every requisition; a hiring manager their own, read-only (decision 11). */
export interface LiveRequisitions {
  persona: 'recruiter' | 'hm';
  rows: LiveRequisitionRow[];
  state: ListState;
  onRetry: () => void;
  /** pipeline:manage, signed in as themselves: send for approval and withdraw. */
  canManage: boolean;
  /** Opens the requisition's job (recruiting). */
  onOpenJob?: (row: LiveRequisitionRow) => void;
  onSubmit: (row: LiveRequisitionRow) => Promise<void>;
  onWithdraw: (row: LiveRequisitionRow) => Promise<void>;
  /** ats.requisition.raise, signed in as themselves: opens the request sheet. */
  onNew?: () => void;
  /** Tells the page which requisition is open, so it can load its past candidates. */
  onOpenRow?: (id: string | null) => void;
  /** The open requisition's past candidates; absent when the viewer may not see candidates. */
  rediscovery?: LiveRediscovery;
  /** Answer 257: the task holder approves or sends back (reason required) here; the sender never holds the task. */
  onDecide?: (row: LiveRequisitionRow, decision: 'approve' | 'reject', reason: string | null) => Promise<void>;
  /** Answer 252: the hiring manager changes their own sent-back requisition (opens the request sheet filled in). */
  onEdit?: (row: LiveRequisitionRow) => void;
  /** Answer 253: opens the request sheet filled in from this one. */
  onDuplicate?: (row: LiveRequisitionRow) => void;
  /** Answer 253, recruiting: cancel with a reason (refused once filled). */
  onCancel?: (row: LiveRequisitionRow, reason: string) => Promise<void>;
  /** Answer 253, recruiting: sets the recruiter of the chosen requisitions. */
  assign?: { recruiters: { value: string; label: string }[]; onAssign: (rows: LiveRequisitionRow[], userId: string) => Promise<void> };
  now?: Date;
}

const REQ_TONE: Record<Requisition['status'], BadgeTone> = { Draft: 'neutral', 'Pending approval': 'warning', Approved: 'success', 'Sent back': 'danger', Filled: 'info', Closed: 'neutral', Cancelled: 'neutral' };
const ENDED: Requisition['status'][] = ['Filled', 'Closed', 'Cancelled'];

// HIR-02
export function RequisitionsScreen({ rows: sample, planLines, persona: samplePersona, me = 'Karthik Subramanian', openId = null, sheetOpen = false, rediscovery = [], state = 'ready', now, live, approver = false, cancelId = null, assignOpen = false }: RequisitionsScreenProps) {
  type Row = Requisition | LiveRequisitionRow;
  const persona = live ? live.persona : samplePersona;
  // Live: the API already returns only what the viewer may see.
  const base: Row[] = live ? live.rows : persona === 'hm' ? sample.filter((r) => r.hiringManager === me) : sample;
  const [open, setOpenState] = useState<string | null>(openId);
  const setOpen = (id: string | null) => {
    setOpenState(id);
    live?.onOpenRow?.(id);
  };
  const [sheet, setSheet] = useState(sheetOpen);
  const [busy, setBusy] = useState(false);
  const [sendBack, setSendBack] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(cancelId);
  const [assigning, setAssigning] = useState<Row[] | null>(assignOpen ? sample.slice(0, 2) : null);
  const isLive = (r: Row): r is LiveRequisitionRow => Boolean(live) && 'steps' in r;
  const planText = (r: Row) => (r.replacementFor ? 'Replacement' : isLive(r) ? (r.line ? 'In plan' : r.outsidePlan ? 'Outside plan' : 'No plan line') : (r as Requisition).planLineId ? 'In plan' : 'Outside plan');
  const statuses = live ? ['Draft', 'Pending approval', 'Approved', 'Sent back', 'Filled', 'Closed', 'Cancelled'] : ['Draft', 'Pending approval', 'Approved', 'Sent back', 'Filled'];
  const list = useListControls<Row>({
    rows: base,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: statuses.map((v) => ({ value: v, label: v })) },
      { key: 'plan', label: 'Plan', type: 'multi', options: (live ? ['In plan', 'Outside plan', 'Replacement', 'No plan line'] : ['In plan', 'Outside plan', 'Replacement']).map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.code} ${r.title} ${r.department}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : planText(r)),
    views: [
      { id: 'all', name: persona === 'hm' ? 'My requisitions' : 'All requisitions' },
      { id: 'pending', name: 'Waiting for approval', shared: true },
    ],
    searchPlaceholder: 'Search requisitions',
  });
  const cols: TableColumn<Row>[] = [
    { key: 'code', header: 'Requisition', type: 'id', value: (r) => r.code, width: 120 },
    { key: 'title', header: 'Position', value: (r) => r.title, render: (r) => <PersonLabel name={r.title} secondary={[r.department, r.location].filter(Boolean).join(' · ')} size={24} /> },
    { key: 'plan', header: 'Plan', type: 'status', value: planText, statusTone: (v) => (v === 'Outside plan' ? 'warning' : v === 'Replacement' ? 'info' : v === 'No plan line' ? 'neutral' : 'success') },
    { key: 'max', header: 'Pay up to', type: 'money', value: (r) => r.proposedMax },
    { key: 'positions', header: 'Positions', type: 'number', value: (r) => r.positions, total: 'sum' },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => REQ_TONE[v as Requisition['status']] },
    { key: 'waiting', header: 'Waiting on', value: (r) => r.waitingOn ?? '—' },
    { key: 'hm', header: 'Hiring manager', type: 'person', value: (r) => r.hiringManager, person: (r) => ({ name: r.hiringManager }) },
    { key: 'raised', header: 'Raised', type: 'date', value: (r) => r.raised },
  ];
  const current = base.find((r) => r.id === open) ?? null;
  const can = Boolean(live?.canManage);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // The page shows why in a toast.
    } finally {
      setBusy(false);
    }
  };
  const newButton = (!live || live.onNew) && (
    <Button variant="primary" icon={Plus} onClick={() => (live ? live.onNew?.() : setSheet(true))}>
      New requisition
    </Button>
  );
  // Answer 293: a hiring manager cancels their own requisition while it waits for approval (the API checks it again).
  const hmCancel = (r: LiveRequisitionRow) => !can && r.mine && r.status === 'Pending approval';
  const liveActions = (r: LiveRequisitionRow) =>
    can || live?.onDuplicate || (live?.onCancel && hmCancel(r)) ? (
      <>
        {can && live?.onOpenJob && <MenuItem onSelect={() => live.onOpenJob?.(r)}>Open job</MenuItem>}
        {can && (r.status === 'Draft' || r.status === 'Sent back') && <MenuItem onSelect={() => void act(() => live!.onSubmit(r))}>Send for approval</MenuItem>}
        {can && r.status === 'Pending approval' && <MenuItem onSelect={() => void act(() => live!.onWithdraw(r))}>Withdraw from approval</MenuItem>}
        {live?.onDuplicate && <MenuItem onSelect={() => live.onDuplicate?.(r)}>Duplicate</MenuItem>}
        {live?.onCancel && !ENDED.includes(r.status) && (can || hmCancel(r)) && (
          <MenuItem destructive onSelect={() => setCancelling(r.id)}>
            Cancel requisition
          </MenuItem>
        )}
      </>
    ) : null;
  const cancelRow = base.find((r) => r.id === cancelling) ?? null;
  const decide = (decision: 'approve' | 'reject', reason: string | null) => act(() => live!.onDecide!(current as LiveRequisitionRow, decision, reason));

  return (
    <HireFrame active="Jobs & requisitions">
      <PageHeader
        title="Requisitions"
        description={
          live && persona === 'hm'
            ? 'Your requests to hire and where each one is. Read-only: recruiting and HR change them.'
            : 'Requests to hire against the headcount plan. Outside plan or above the plan budget adds an extra approval.'
        }
        actions={newButton || undefined}
      />
      <DataTable
        label="Requisitions"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={live ? live.state : state}
        onRetry={live ? live.onRetry : () => {}}
        errorReference="REQ-4410"
        filtered={list.filtered}
        onClearFilters={list.clear}
        toolbar={list.toolbar}
        views={live ? undefined : list.views}
        onRowClick={(r) => setOpen(r.id)}
        activeRowId={open}
        selectable={live ? can && Boolean(live.assign) : persona === 'recruiter'}
        selectedIds={picked}
        onSelectedChange={setPicked}
        bulkActions={(ids) => (
          <Button size="sm" onClick={() => setAssigning(base.filter((r) => ids.includes(r.id)))}>
            Assign recruiter
          </Button>
        )}
        rowActions={
          live
            ? (r) => liveActions(r as LiveRequisitionRow)
            : () => (
                <>
                  <MenuItem>Open job</MenuItem>
                  <MenuItem>Duplicate</MenuItem>
                  <MenuItem destructive>Cancel requisition</MenuItem>
                </>
              )
        }
        empty={
          <EmptyState
            title="No requisitions yet."
            description={live && persona === 'hm' ? 'Ask for a hire with New requisition, or from a free position on the headcount plan.' : 'Open one from a free position on the headcount plan, or outside the plan with a reason.'}
            action={newButton || undefined}
          />
        }
        onExport={
          live
            ? (_format, keys) => {
                const shown = cols.filter((c) => keys.includes(c.key));
                const text = (c: TableColumn<Row>, r: Row) => {
                  const v = c.value(r);
                  return v instanceof Date ? formatDate(v) : v == null ? '' : String(v);
                };
                downloadText(`requisitions-${formatDate(live.now ?? new Date()).replace(/ /g, '-')}.csv`, toCsv(shown.map((c) => String(c.header)), list.rows.map((r) => shown.map((c) => text(c, r)))));
              }
            : () => {}
        }
      />
      {current && (
        <Drawer
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="lg"
          title={`${current.code} · ${current.title}`}
          subtitle={[current.department, current.location, current.grade].filter(Boolean).join(' · ')}
          meta={<Badge tone={REQ_TONE[current.status]}>{current.status}</Badge>}
          footer={
            live && (current as LiveRequisitionRow).canDecide && live.onDecide ? (
              <>
                <Button onClick={() => setSendBack(true)} disabled={busy}>
                  Send back
                </Button>
                <Button variant="primary" loading={busy} onClick={() => void decide('approve', null)}>
                  Approve
                </Button>
              </>
            ) : !live && approver ? (
              <>
                <Button>Send back</Button>
                <Button variant="primary">Approve</Button>
              </>
            ) : live ? (
              <>
                <Button onClick={() => setOpen(null)}>Close</Button>
                {live.onEdit && (current as LiveRequisitionRow).mine && current.status === 'Sent back' && (
                  <Button variant="primary" onClick={() => live.onEdit?.(current as LiveRequisitionRow)}>
                    Edit and resubmit
                  </Button>
                )}
                {can && current.status === 'Approved' && live.onOpenJob && (
                  <Button variant="primary" onClick={() => live.onOpenJob?.(current as LiveRequisitionRow)}>
                    Open job
                  </Button>
                )}
                {can && (current.status === 'Draft' || current.status === 'Sent back') && (
                  <Button variant="primary" icon={Send} loading={busy} onClick={() => void act(() => live.onSubmit(current as LiveRequisitionRow))}>
                    Send for approval
                  </Button>
                )}
              </>
            ) : persona === 'hm' && current.status === 'Sent back' ? (
              <>
                <Button onClick={() => setOpen(null)}>Close</Button>
                <Button variant="primary">Edit and resubmit</Button>
              </>
            ) : (
              <>
                <Button onClick={() => setOpen(null)}>Close</Button>
                {current.status === 'Approved' && persona === 'recruiter' && <Button variant="primary">Create job</Button>}
              </>
            )
          }
        >
          <RequisitionDetail req={current} line={isLive(current) ? current.line : (planLines.find((l) => l.id === current.planLineId) ?? null)} now={live ? live.now : now} />
          {live ? live.rediscovery && <RediscoveryPanel matches={[]} viewer={persona === 'hm' ? 'hm' : 'recruiter'} live={live.rediscovery} /> : <RediscoveryPanel matches={rediscovery} viewer={persona === 'hm' ? 'hm' : 'recruiter'} />}
        </Drawer>
      )}
      {!live && <RequisitionSheet open={sheet} onOpenChange={setSheet} planLines={planLines} />}
      {current && sendBack && (
        <SendBackDialog
          open
          onOpenChange={setSendBack}
          what={`requisition ${current.code || current.title}`}
          consequence="The hiring manager sees your reason. Recruiting or the hiring manager changes it and sends it again."
          who="the hiring manager"
          onSend={async (reason) => {
            await live?.onDecide?.(current as LiveRequisitionRow, 'reject', reason);
          }}
        />
      )}
      {cancelRow && <CancelRequisitionDialog row={cancelRow} hm={persona === 'hm'} onClose={() => setCancelling(null)} onCancel={live?.onCancel ? (reason) => live.onCancel!(cancelRow as LiveRequisitionRow, reason) : undefined} />}
      {assigning && <AssignRecruiterDialog rows={assigning} recruiters={live?.assign?.recruiters ?? SAMPLE_RECRUITERS} onClose={() => (setAssigning(null), setPicked([]))} onAssign={live?.assign ? (userId) => live.assign!.onAssign(assigning as LiveRequisitionRow[], userId) : undefined} />}
    </HireFrame>
  );
}

const SAMPLE_RECRUITERS = [{ value: 'u1', label: 'Neha Joshi' }, { value: 'u2', label: 'Imran Qureshi' }];

/** HIR-02 answer 253: why the requisition is cancelled (required); it closes the job. */
function CancelRequisitionDialog({ row, hm, onClose, onCancel }: { row: { code: string; title: string }; hm?: boolean; onClose: () => void; onCancel?: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Cancel requisition ${row.code || row.title}?`}
      consequence={hm ? 'The request is withdrawn from approval and closed. Recruiting sees your reason. To hire later, raise a new request.' : 'The job closes and its board postings close. A waiting approval is withdrawn. Candidates stay in your candidate list.'}
      confirmLabel="Cancel requisition"
      destructive
      onConfirm={async () => {
        setTried(true);
        if (reason.trim().length < 3) return false;
        await onCancel?.(reason.trim());
      }}
    >
      <FormField label="Reason" required error={tried && reason.trim().length < 3 ? (hm ? 'Say why it is cancelled, so recruiting knows.' : 'Say why it is cancelled, so the hiring manager knows.') : null}>
        <TextArea value={reason} onChange={setReason} rows={3} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

/** HIR-02 answer 253: the recruiter of the chosen requisitions (the job's recruiter field). */
function AssignRecruiterDialog({ rows, recruiters, onClose, onAssign }: { rows: { id: string }[]; recruiters: { value: string; label: string }[]; onClose: () => void; onAssign?: (userId: string) => Promise<void> }) {
  const [who, setWho] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={rows.length === 1 ? 'Assign a recruiter' : `Assign a recruiter to ${rows.length} requisitions`}
      consequence="They see the requisition's candidates and get its suggestions."
      confirmLabel="Assign"
      onConfirm={async () => {
        setTried(true);
        if (!who) return false;
        await onAssign?.(who);
      }}
    >
      <FormField label="Recruiter" required error={tried && !who ? 'Choose the recruiter.' : null}>
        <Select value={who} onChange={setWho} options={recruiters} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

/** The live detail: the plan facts and the route the approvals engine ran (the company's own approvers). */
function LiveRequisitionDetail({ req, now }: { req: LiveRequisitionRow; now?: Date }) {
  const line = req.line;
  return (
    <div className="yx-hire-stack">
      {req.status === 'Cancelled' ? (
        <InlineAlert tone="info" title="Cancelled">
          {req.cancelReason ? `“${req.cancelReason}”` : 'This requisition was cancelled.'}
        </InlineAlert>
      ) : req.status === 'Sent back' ? (
        <InlineAlert tone="danger" title="Sent back">
          {req.sentBackReason ? `“${req.sentBackReason}” ` : ''}Recruiting can change it and send it again.
        </InlineAlert>
      ) : req.replacementFor ? (
        <InlineAlert tone="info" title="Replacement hire">
          Replacement for {req.replacementFor}; no new plan line used.
        </InlineAlert>
      ) : req.outsidePlan ? (
        <InlineAlert tone="warning" title="Extra approval needed">
          Outside the approved headcount plan{req.outsidePlanReason ? `: “${req.outsidePlanReason}”` : ''}. The people who approve headcount plans approve it too.
        </InlineAlert>
      ) : line ? (
        <InlineAlert tone="success" title="Inside the approved plan">
          It goes through your company&apos;s requisition approvers.
        </InlineAlert>
      ) : null}
      <DescriptionList
        columns={2}
        items={[
          { label: 'Plan line', value: line ? [line.designation, line.grade, line.location].filter(Boolean).join(' · ') : req.outsidePlan ? 'Outside plan' : '—' },
          { label: 'Free on line', value: line ? `${planLineFree(line)} of ${line.approved}` : '—' },
          { label: 'Budget left on line', value: line && line.budget > 0 ? formatINR(planBudgetLeft(line)) : '—' },
          { label: 'Pay up to', value: req.proposedMax == null ? '—' : formatINR(req.proposedMax) },
          { label: 'Recruiter', value: req.recruiter || '—' },
          { label: 'Raised', value: formatDate(req.raised) },
        ]}
      />
      {req.steps.length > 0 && <ApprovalTimeline steps={req.steps} now={now} />}
    </div>
  );
}

function RequisitionDetail({ req, line, now }: { req: Requisition | LiveRequisitionRow; line: PlanLine | null; now?: Date }) {
  // Live: the route the approvals engine ran, not the drawn sample chain.
  if ('steps' in req) return <LiveRequisitionDetail req={req} now={now} />;
  const route = requisitionRoute({ planLine: line, proposedMax: req.proposedMax, replacementFor: req.replacementFor });
  const done = req.status === 'Approved' || req.status === 'Filled';
  const waitingIdx = req.waitingOn ? route.steps.indexOf(req.waitingOn) : -1;
  const steps: ApprovalStep[] = route.steps.map((s, i) => ({
    id: s,
    label: s,
    status: done ? 'done' : req.status === 'Sent back' && i === 0 ? 'rejected' : waitingIdx === -1 ? (i === 0 ? 'current' : 'pending') : i < waitingIdx ? 'done' : i === waitingIdx ? 'current' : 'pending',
    approver: s === 'Hiring manager' ? req.hiringManager : s === 'HR business partner' ? 'Lakshmi Venkatesan' : s === 'Finance' ? 'Ravi Shankar' : 'Meenakshi Sundaram',
    comment: req.status === 'Sent back' && i === 0 ? 'Add the client territory and confirm the grade.' : undefined,
  }));
  return (
    <div className="yx-hire-stack">
      {route.extra ? (
        <InlineAlert tone="warning" title="Extra approval needed">
          {route.reasons.join('. ')}. The CFO approves after finance.
        </InlineAlert>
      ) : req.replacementFor ? (
        <InlineAlert tone="info" title="Replacement hire">
          {route.reasons[0]}.
        </InlineAlert>
      ) : (
        <InlineAlert tone="success" title="Inside the approved plan">
          Short approval chain: hiring manager, HR business partner, finance.
        </InlineAlert>
      )}
      <DescriptionList
        columns={2}
        items={[
          { label: 'Plan line', value: line ? `${line.designation} · ${line.grade} · ${line.location}` : 'Outside plan' },
          { label: 'Free on line', value: line ? `${planLineFree(line)} of ${line.approved}` : '—' },
          { label: 'Budget left on line', value: line ? formatINR(planBudgetLeft(line)) : '—' },
          { label: 'Pay up to', value: formatINR(req.proposedMax) },
          { label: 'Recruiter', value: req.recruiter },
          { label: 'Raised', value: formatDate(req.raised) },
        ]}
      />
      <ApprovalTimeline steps={steps} now={now} />
    </div>
  );
}

/** The live "Request a hire" (PPL-08, HIR-02 sheet): what the manager sends; the API names the route and decides. */
export interface LiveRequisitionSheet {
  /** "Hiring manager request · Quality". */
  subtitle: string;
  /** The people who may leave and be replaced (the manager's team). */
  team: { value: string; label: string }[];
  onSend: (input: RequisitionInput) => Promise<void>;
  /** Answers 252, 253: the sheet opens filled in (change a sent-back requisition, or Duplicate one). */
  initial?: RequisitionInput;
  /** Drawer title; "New requisition" by default. */
  title?: string;
}

export interface RequisitionInput {
  title: string;
  requisitionReason: 'new' | 'replacement';
  headcountPlanLineId: string | null;
  outsidePlan: boolean;
  outsidePlanReason: string | null;
  replacementOfEmployeeId: string | null;
  headcount: number;
  budgetAmount: number | null;
  targetStart: Date | null;
}

export function RequisitionSheet({ open, onOpenChange, planLines, defaultLine = 'pl3', defaultMax = 8_40_000, live }: { open: boolean; onOpenChange: (o: boolean) => void; planLines: PlanLine[]; defaultLine?: string | null; defaultMax?: number | null; live?: LiveRequisitionSheet }) {
  const init = live?.initial;
  const [lineId, setLineId] = useState<string | null>(init ? init.headcountPlanLineId : defaultLine);
  const [outside, setOutside] = useState(init ? init.outsidePlan : !live && defaultLine == null);
  const [max, setMax] = useState<number | null>(init ? init.budgetAmount : defaultMax);
  const [positions, setPositions] = useState<number | null>(init ? init.headcount : 1);
  const [reason, setReason] = useState(init?.outsidePlanReason ?? '');
  const [replacement, setReplacement] = useState(init?.requisitionReason === 'replacement');
  const [leaver, setLeaver] = useState<string | null>(init?.replacementOfEmployeeId ?? null);
  const [title, setTitle] = useState(init && !init.headcountPlanLineId ? init.title : '');
  const [start, setStart] = useState<Date | null>(init ? init.targetStart : live ? null : new Date(2026, 11, 1));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Live: Send is never greyed out; pressed too early it shows each missing field and focuses the first.
  const [tried, setTried] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const line = outside || (live && replacement) ? null : planLines.find((l) => l.id === lineId) ?? null;
  const leaverName = live ? live.team.find((t) => t.value === leaver)?.label ?? 'a leaver' : 'Rohit Bhat';
  const route = requisitionRoute({ planLine: line, proposedMax: max ?? 0, replacementFor: replacement ? leaverName : null });
  const needReason = outside && !(live && replacement) && !reason.trim();
  // Live: a position without a plan line (outside the plan, or a replacement) needs its name.
  const needTitle = Boolean(live) && !line && !title.trim();
  const liveIncomplete = Boolean(live) && (!positions || needTitle || (replacement ? !leaver : !outside && !line));
  const send = async () => {
    setTried(true);
    if (live && (needReason || !max || liveIncomplete)) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!live) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onSend({ title: line ? line.designation : title.trim(), requisitionReason: replacement ? 'replacement' : 'new', headcountPlanLineId: line?.id ?? null, outsidePlan: !replacement && outside, outsidePlanReason: !replacement && outside ? reason.trim() : null, replacementOfEmployeeId: replacement ? leaver : null, headcount: positions!, budgetAmount: max, targetStart: start });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={live?.title ?? 'New requisition'}
      subtitle={live ? live.subtitle : 'Hiring manager request · Engineering'}
      dirty={reason.length > 0 || title.length > 0}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {/* Live: a manager's request is not kept as a draft yet (left out). */}
          {!live && <Button>Save draft</Button>}
          <Button variant="primary" icon={Send} disabled={!live && (needReason || !max)} loading={busy} onClick={live ? () => void send() : undefined}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="yx-hire-sheet">
        <div className="yx-hire-sheet__form" ref={form}>
          {failed && <InlineAlert tone="danger" title={failed} />}
          <Switch className="yx-hire-switch" label="Replacement for a leaver" description="Linked to the exit; doesn't use a new plan line." checked={replacement} onChange={setReplacement} />
          {live && replacement ? (
            <FormField label="Who is leaving" required error={tried && !leaver ? 'Choose who is leaving.' : null}>
              <Select value={leaver} onChange={setLeaver} options={live.team} />
            </FormField>
          ) : (
            <>
              <FormField label="Plan line" required helper="Only lines with a free position are listed." error={live && tried && !outside && !line ? 'Choose a plan line, or tick that the hire is outside the plan.' : null}>
                <Select
                  value={outside ? null : lineId}
                  onChange={(v) => {
                    setLineId(v);
                    setOutside(false);
                  }}
                  disabled={outside}
                  options={planLines.map((l) => ({ value: l.id, label: `${l.designation} · ${l.grade} · ${l.location}`, description: `${planLineFree(l)} free · ${formatINR(planBudgetLeft(l))} budget left`, disabled: planLineFree(l) === 0 }))}
                />
              </FormField>
              <Checkbox label="This hire is outside the approved plan" checked={outside} onChange={setOutside} />
              {outside && (
                <FormField label="Why is this needed outside the plan?" required error={needReason && (!live || reason.length > 0 || tried) ? 'Enter a reason so the CFO can decide.' : null}>
                  <TextArea value={reason} onChange={setReason} rows={3} />
                </FormField>
              )}
            </>
          )}
          {live && !line && (
            <FormField label="Position" required helper="The job title, for example Quality Analyst." error={tried && needTitle ? 'Enter the position.' : null}>
              <TextField value={title} onChange={setTitle} maxLength={200} />
            </FormField>
          )}
          <FieldRow>
            <FormField label="Positions" required error={live && tried && !positions ? 'Enter at least 1.' : null}>
              <NumberField value={positions} onChange={setPositions} min={1} max={20} />
            </FormField>
            <FormField label="Pay up to (annual CTC)" required helper="From the grade pay range" error={live && tried && !max ? 'Enter the most you can pay.' : null}>
              <CurrencyField value={max} onChange={setMax} />
            </FormField>
          </FieldRow>
          <FormField label="Target joining date" optional>
            <DatePicker value={start} onChange={setStart} />
          </FormField>
        </div>
        <aside className="yx-hire-sheet__effect" aria-live="polite" aria-label="What happens">
          <Text weight="semibold">What happens</Text>
          {live && !line && !outside && !replacement ? null : route.extra ? <Badge tone="warning">{live ? 'Extra approval' : 'Extra approval: CFO'}</Badge> : <Badge tone="success">Short chain</Badge>}
          {live ? (
            <Text as="p" size="sm" tone="secondary">
              It goes to your company&apos;s requisition approvers. You follow it in Approvals.
            </Text>
          ) : (
            <ol className="yx-hire-steps">
              {route.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {(live && !line && !outside && !replacement ? [] : route.reasons).map((r) => (
            <Text key={r} as="p" size="sm" tone="secondary">
              {r}
            </Text>
          ))}
          {line && (
            <Text as="p" size="sm" tone="secondary">
              After approval: {Math.max(0, planLineFree(line) - (positions ?? 0))} positions stay free on this line.
            </Text>
          )}
        </aside>
      </div>
    </Drawer>
  );
}

/* ================================================================== HIR-24 · Job pay range panel */

export type PayPeriod = 'year' | 'month' | 'hour';

export interface PayRangeInput {
  min: number | null;
  max: number | null;
  currency: string;
  period: PayPeriod;
  show: boolean;
  askHistory: boolean;
  /** Publish the job as well (careers page and public applications). */
  publish: boolean;
}

/** The live pay range (HIR-24): the job's saved values, the company's choice and the save. The API checks the law again. */
export interface LivePayRange {
  currency: string;
  period: PayPeriod;
  show: boolean;
  askHistory: boolean;
  /** The company's choice for new jobs where no law decides (setting hiring.pay_range.show). */
  companyShows: boolean;
  /** Already on the careers page: the button saves instead of publishing. */
  published: boolean;
  /** pipeline:manage; without it the panel is read-only. */
  canManage: boolean;
  onSave: (input: PayRangeInput) => Promise<void>;
}

export interface JobPayRangePanelProps {
  location: string;
  law: PayLaw;
  defaultRange?: PayRange;
  defaultShowRange?: boolean;
  defaultHistoryQuestion?: boolean;
  onPublish?: () => void;
  live?: LivePayRange;
}

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const CURRENCY_LABEL: Record<string, string> = { INR: 'INR (₹)', USD: 'USD ($)', EUR: 'EUR (€)', GBP: 'GBP (£)' };

// HIR-24
export function JobPayRangePanel({ location, law, defaultRange = { min: null, max: null }, defaultShowRange = true, defaultHistoryQuestion = false, onPublish, live }: JobPayRangePanelProps) {
  const [range, setRange] = useState<PayRange>(defaultRange);
  const [show, setShow] = useState((live ? live.show : defaultShowRange) || law.rangeRequired);
  const [period, setPeriod] = useState<string | null>(live?.period ?? 'year');
  const [currency, setCurrency] = useState<string | null>(live?.currency ?? 'INR');
  const [history, setHistory] = useState((live ? live.askHistory : defaultHistoryQuestion) && payHistoryAllowed(law));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [tried, setTried] = useState(!live);
  const minRef = useRef<HTMLDivElement>(null);
  const issues = payRangeIssues(range, law, show);
  const ok = canPublishJob(range, law, show);
  const readOnly = Boolean(live && !live.canManage);
  // Live: the button is never disabled; pressed too early it shows what to fix and moves to the minimum.
  const save = async () => {
    if (!live) return;
    setTried(true);
    if (!ok) {
      minRef.current?.querySelector('input')?.focus();
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      await live.onSave({ min: range.min, max: range.max, currency: currency ?? 'INR', period: (period ?? 'year') as PayPeriod, show, askHistory: history, publish: !live.published });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const currencies = live && !CURRENCIES.includes(live.currency) ? [...CURRENCIES, live.currency] : CURRENCIES;
  return (
    <Card
      title="Pay range"
      actions={law.rangeRequired ? <Badge tone="info">Set by law · {location}</Badge> : <Badge>Company setting</Badge>}
      footer={
        readOnly ? undefined : (
          <div className="yx-hire-row">
            <Text size="sm" tone={ok ? 'secondary' : 'danger'}>
              {ok ? (live?.published ? 'The job is published. Changes show at once.' : 'Ready to publish.') : 'Publishing is blocked until the pay range is fixed.'}
            </Text>
            <Button variant="primary" disabled={!live && !ok} loading={busy} onClick={live ? () => void save() : onPublish}>
              {live?.published ? 'Save pay range' : 'Publish job'}
            </Button>
          </div>
        )
      }
    >
      {law.rangeRequired && (
        <InlineAlert tone="info">
          {location} has a pay-transparency law ({law.source}). A pay range is required on the job ad and careers page.
        </InlineAlert>
      )}
      {failed && <InlineAlert tone="danger" title={failed} />}
      {tried && issues.length > 0 && (
        <InlineAlert tone="danger" title="Fix before publishing">
          <ul className="yx-hire-plainlist">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <FieldRow>
        <div ref={minRef}>
          <FormField label="Minimum" required={law.rangeRequired || show}>
            <CurrencyField value={range.min} onChange={(v) => setRange((r) => ({ ...r, min: v }))} disabled={readOnly} />
          </FormField>
        </div>
        <FormField label="Maximum" required={law.rangeRequired || show}>
          <CurrencyField value={range.max} onChange={(v) => setRange((r) => ({ ...r, max: v }))} disabled={readOnly} />
        </FormField>
      </FieldRow>
      <FieldRow>
        <FormField label="Currency">
          {live ? (
            <Select value={currency} onChange={setCurrency} disabled={readOnly} options={currencies.map((c) => ({ value: c, label: CURRENCY_LABEL[c] ?? c }))} />
          ) : (
            <Select value="INR" onChange={() => {}} options={[{ value: 'INR', label: 'INR (₹)' }]} />
          )}
        </FormField>
        <FormField label="Period">
          <Select value={period} onChange={setPeriod} disabled={readOnly} options={[{ value: 'year', label: 'Per year (CTC)' }, { value: 'month', label: 'Per month' }, { value: 'hour', label: 'Per hour' }]} />
        </FormField>
      </FieldRow>
      <Switch
        className="yx-hire-switch"
        label="Show pay range on the careers page and job boards"
        description={law.rangeRequired ? 'Required by law for this location.' : live ? `Company setting: ${live.companyShows ? 'shown' : 'hidden'} on new jobs. You can change it for this job.` : 'YukthiX starter: on. You can switch it off for this job.'}
        checked={show}
        disabled={law.rangeRequired || readOnly}
        onChange={setShow}
      />
      <Switch className="yx-hire-switch"
        label="Ask applicants about their current or past pay"
        description={law.historyBanned ? `Not allowed: the law for ${location} bans pay-history questions.` : 'Off by default. Switch on only if your company needs it.'}
        checked={history}
        disabled={law.historyBanned || readOnly}
        onChange={setHistory}
      />
    </Card>
  );
}

/* ================================================================== HIR-03 · Create job sheet */

export interface NewJob {
  title: string;
  description?: string;
  departmentId?: string;
  department?: string;
  locationId?: string;
  location?: string;
  /** Answer 244: the country of a typed place (ISO); outside India the API wants a company location instead. */
  locationCountry?: string;
  designationId?: string;
  hiringManagerId?: string;
  headcount?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: PayPeriod;
  /** Sent only when changed: otherwise the company's choice for the location (and its law) decides. */
  showSalary?: boolean;
  pipelineId?: string;
  customFields?: Record<string, string | number | null>;
  headcountPlanLineId?: string;
  outsidePlan?: boolean;
  outsidePlanReason?: string;
  requisitionReason?: 'new' | 'replacement';
  replacementOfEmployeeId?: string;
  budgetAmount?: number;
  /** YYYY-MM-DD. */
  targetStart?: string;
}

export interface CreateJobChoice {
  value: string;
  label: string;
}

/** What the create-job sheet offers: the company's masters (empty list: free text), people and plan lines. */
export interface CreateJobChoices {
  departments: CreateJobChoice[];
  locations: CreateJobChoice[];
  designations: CreateJobChoice[];
  managers: CreateJobChoice[];
  pipelines: (CreateJobChoice & { isDefault?: boolean })[];
  planLines: { id: string; departmentId: string; label: string }[];
  employees: CreateJobChoice[];
  customFields: JobCustomField[];
  /** The company's choice for new jobs (setting hiring.pay_range.show). */
  showRangeByDefault: boolean;
}

const SAMPLE_CHOICES: CreateJobChoices = {
  departments: [{ value: 'd1', label: 'Engineering' }, { value: 'd2', label: 'Operations' }],
  locations: [{ value: 'l1', label: 'Chennai office' }, { value: 'l2', label: 'Hosur plant' }],
  designations: [{ value: 'x1', label: 'Senior QA Engineer' }],
  managers: [{ value: 'u1', label: 'Karthik Subramanian' }],
  pipelines: [{ value: 'p1', label: 'Engineering, 6 stages', isDefault: true }],
  planLines: [{ id: 'pl3', departmentId: 'd1', label: 'Engineering · Senior QA Engineer · Chennai office · 2 left' }],
  employees: [{ value: 'e1', label: 'Rohit Bhat' }],
  customFields: [{ id: 'cf1', label: 'Cost centre', fieldType: 'text', options: null, required: false }],
  showRangeByDefault: false,
};

const pad = (n: number) => String(n).padStart(2, '0');
const REGION_NAME = new Intl.DisplayNames(['en'], { type: 'region' });
const COUNTRY_CHOICES = getCountries()
  .map((x) => ({ value: x as string, label: REGION_NAME.of(x) ?? x }))
  .sort((a, b) => a.label.localeCompare(b.label));

// HIR-03 (create): a new job, or a requisition when the company's approval chain is on (the API decides).
export function CreateJobSheet({ open, onOpenChange, choices = SAMPLE_CHOICES, onCreate, onDraftDescription }: { open: boolean; onOpenChange: (o: boolean) => void; choices?: CreateJobChoices; onCreate?: (input: NewJob) => Promise<void>; onDraftDescription?: (title: string) => Promise<string> }) {
  const c = choices;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [department, setDepartment] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState<string | null>('IN');
  const [designationId, setDesignationId] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState<number | null>(1);
  const [min, setMin] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string | null>('INR');
  const [period, setPeriod] = useState<string | null>('year');
  const [show, setShow] = useState<boolean | null>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(c.pipelines.find((x) => x.isDefault)?.value ?? c.pipelines[0]?.value ?? null);
  const [custom, setCustom] = useState<Record<string, string | number | null>>({});
  const [reason, setReason] = useState<'new' | 'replacement'>('new');
  const [lineId, setLineId] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  const [outsideWhy, setOutsideWhy] = useState('');
  const [replaces, setReplaces] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [start, setStart] = useState<Date | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<'save' | 'draft' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const lines = c.planLines.filter((l) => !departmentId || l.departmentId === departmentId);
  const missing = missingRequired(c.customFields, custom);
  const rangeBad = min !== null && max !== null && min > max;
  const replacesBad = reason === 'replacement' && !replaces;
  const outsideBad = reason === 'new' && outside && outsideWhy.trim().length < 3;
  // Answer 244: a typed place abroad is refused (the API checks it too); India keeps typed places.
  const abroadBad = !c.locations.length && location.trim() !== '' && (country ?? 'IN') !== 'IN';
  const opt = <T,>(v: T | null | '') => (v === null || v === '' ? undefined : v);
  const create = async () => {
    setTried(true);
    if (!title.trim() || missing.length || rangeBad || replacesBad || outsideBad || abroadBad) {
      titleRef.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      if (!title.trim()) titleRef.current?.querySelector('input')?.focus();
      return;
    }
    if (!onCreate) return;
    setBusy('save');
    setFailed(null);
    try {
      await onCreate({
        title: title.trim(),
        description: opt(description.trim()),
        departmentId: opt(departmentId),
        department: c.departments.length ? undefined : opt(department.trim()),
        locationId: opt(locationId),
        location: c.locations.length ? undefined : opt(location.trim()),
        locationCountry: !c.locations.length && location.trim() ? (country ?? 'IN') : undefined,
        designationId: opt(designationId),
        hiringManagerId: opt(managerId),
        headcount: opt(headcount),
        salaryMin: opt(min),
        salaryMax: opt(max),
        salaryCurrency: min !== null || max !== null ? opt(currency) : undefined,
        salaryPeriod: min !== null || max !== null ? ((period ?? 'year') as PayPeriod) : undefined,
        showSalary: show ?? undefined,
        pipelineId: opt(pipelineId),
        customFields: Object.keys(custom).length ? custom : undefined,
        requisitionReason: reason,
        headcountPlanLineId: reason === 'new' && !outside ? opt(lineId) : undefined,
        outsidePlan: reason === 'new' && outside ? true : undefined,
        outsidePlanReason: reason === 'new' && outside ? outsideWhy.trim() : undefined,
        replacementOfEmployeeId: reason === 'replacement' ? opt(replaces) : undefined,
        budgetAmount: opt(budget),
        targetStart: start ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : undefined,
      });
      onOpenChange(false);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const draft = async () => {
    if (!onDraftDescription) return;
    setTried(true);
    if (!title.trim()) {
      titleRef.current?.querySelector('input')?.focus();
      return;
    }
    setBusy('draft');
    try {
      setDescription(await onDraftDescription(title.trim()));
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The description could not be drafted. Write it yourself or try again.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Create job"
      subtitle="Goes for approval first when your company's requisition approval is on."
      dirty={title.length > 0 || description.length > 0}
      notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" icon={Plus} loading={busy === 'save'} onClick={() => void create()}>
            Create job
          </Button>
        </>
      }
    >
      <div className="yx-hire-stack">
        <div ref={titleRef}>
          <FormField label="Job title" required error={tried && !title.trim() ? 'Enter the job title.' : null}>
            <TextField value={title} onChange={setTitle} maxLength={200} />
          </FormField>
        </div>
        <FieldRow>
          <FormField label="Department" optional>
            {c.departments.length ? <Select aria-label="Department" value={departmentId} onChange={setDepartmentId} options={c.departments} searchable clearable /> : <TextField value={department} onChange={setDepartment} maxLength={200} />}
          </FormField>
          <FormField label="Location" optional helper="The location's law decides whether the pay range must be shown.">
            {c.locations.length ? <Select aria-label="Location" value={locationId} onChange={setLocationId} options={c.locations} searchable clearable /> : <TextField value={location} onChange={setLocation} maxLength={200} />}
          </FormField>
        </FieldRow>
        {!c.locations.length && (
          <FormField label="Country of the place" error={tried && abroadBad ? 'This place is outside India. Add it in Settings › Locations first, then choose it.' : null}>
            <Select aria-label="Country of the place" value={country} onChange={setCountry} options={COUNTRY_CHOICES} searchable />
          </FormField>
        )}
        <FieldRow>
          {c.designations.length > 0 && (
            <FormField label="Designation" optional>
              <Select aria-label="Designation" value={designationId} onChange={setDesignationId} options={c.designations} searchable clearable />
            </FormField>
          )}
          <FormField label="Hiring manager" optional>
            <Select aria-label="Hiring manager" value={managerId} onChange={setManagerId} options={c.managers} searchable clearable />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Openings" optional>
            <NumberField value={headcount} onChange={setHeadcount} min={1} />
          </FormField>
          <FormField label="Pipeline">
            <Select aria-label="Pipeline" value={pipelineId} onChange={setPipelineId} options={c.pipelines} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Pay from" optional>
            <CurrencyField value={min} onChange={setMin} />
          </FormField>
          <FormField label="Pay up to" optional error={rangeBad ? 'Must be at least the minimum.' : null}>
            <CurrencyField value={max} onChange={setMax} />
          </FormField>
        </FieldRow>
        <FieldRow>
          <FormField label="Currency">
            <Select aria-label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((x) => ({ value: x, label: CURRENCY_LABEL[x] }))} />
          </FormField>
          <FormField label="Period">
            <Select aria-label="Period" value={period} onChange={setPeriod} options={[{ value: 'year', label: 'Per year (CTC)' }, { value: 'month', label: 'Per month' }, { value: 'hour', label: 'Per hour' }]} />
          </FormField>
        </FieldRow>
        <Switch
          className="yx-hire-switch"
          label="Show pay range on the careers page and job boards"
          description={`Company setting: ${c.showRangeByDefault ? 'shown' : 'hidden'}. Where the law requires it, the range is always shown.`}
          checked={show ?? c.showRangeByDefault}
          onChange={setShow}
        />
        <FormField label="Why this hire">
          <Segment label="Why this hire" value={reason} onChange={setReason} options={[{ value: 'new', label: 'New position' }, { value: 'replacement', label: 'Replacement' }]} />
        </FormField>
        {reason === 'replacement' ? (
          <FormField label="Replaces" required helper="A replacement does not use the headcount plan." error={tried && replacesBad ? 'Choose who this hire replaces.' : null}>
            <Select aria-label="Replaces" value={replaces} onChange={setReplaces} options={c.employees} searchable />
          </FormField>
        ) : (
          <>
            {lines.length > 0 && !outside && (
              <FormField label="Headcount plan line" optional>
                <Select aria-label="Headcount plan line" value={lineId} onChange={setLineId} options={lines.map((l) => ({ value: l.id, label: l.label }))} clearable />
              </FormField>
            )}
            <Checkbox label="Outside the headcount plan" description="Adds a finance approval." checked={outside} onChange={setOutside} />
            {outside && (
              <FormField label="Why outside the plan" required error={tried && outsideBad ? 'Enter a reason of at least 3 characters.' : null}>
                <TextArea value={outsideWhy} onChange={setOutsideWhy} rows={2} maxLength={1000} />
              </FormField>
            )}
          </>
        )}
        <FieldRow>
          <FormField label="Budget for this hire (a year)" optional>
            <CurrencyField value={budget} onChange={setBudget} />
          </FormField>
          <FormField label="Wanted from" optional>
            <DatePicker aria-label="Wanted from" value={start} onChange={setStart} />
          </FormField>
        </FieldRow>
        <FormField label="Description" optional>
          <TextArea value={description} onChange={setDescription} rows={5} maxLength={5000} />
        </FormField>
        {onDraftDescription && (
          <div>
            <Button size="sm" icon={Sparkles} loading={busy === 'draft'} onClick={() => void draft()}>
              Draft the description
            </Button>
          </div>
        )}
        <CustomFieldInputs fields={c.customFields} values={custom} onChange={setCustom} idPrefix="cj" tried={tried} />
      </div>
    </Drawer>
  );
}

/* ================================================================== HIR-03 · Jobs list + job workspace */

const JOB_TONE: Record<Job['status'], BadgeTone> = { Open: 'success', Draft: 'neutral', 'On hold': 'warning', Closed: 'neutral', 'Waiting for approval': 'warning' };

/** A live jobs row: the designed row plus what the actions need. */
export type LiveJobRow = Job & { careersUrl: string | null };

/** The live jobs list (HIR-03): rows from GET jobs, the actions the API allows; the page shows the toasts. */
export interface LiveJobs {
  rows: LiveJobRow[];
  state: ListState;
  onRetry: () => void;
  /** pipeline:manage: create, close, reopen, delete, send for approval. */
  canManage: boolean;
  onOpen: (id: string) => void;
  create: { choices: CreateJobChoices; onCreate: (input: NewJob) => Promise<void>; onDraftDescription?: (title: string) => Promise<string> };
  onCopyLink: (row: LiveJobRow) => void;
  /** open: reopen or resume; on_hold: hidden from careers and boards, candidates stay (answer 223). */
  onStatus: (row: LiveJobRow, to: 'open' | 'closed' | 'on_hold') => void;
  onSubmit: (row: LiveJobRow) => void;
  onWithdraw: (row: LiveJobRow) => void;
  onDelete: (row: LiveJobRow) => Promise<void>;
}

// HIR-03
export function JobsScreen({ rows: sample, state = 'ready', createOpen = false, live, now }: { rows: Job[]; state?: ListState; createOpen?: boolean; live?: LiveJobs; now?: Date }) {
  const rows: Job[] = live ? live.rows : sample;
  const [creating, setCreating] = useState(createOpen);
  const [deleting, setDeleting] = useState<LiveJobRow | null>(null);
  const statuses = live ? ['Open', 'On hold', 'Draft', 'Waiting for approval', 'Closed'] : ['Open', 'Draft', 'On hold', 'Closed'];
  const types = live ? [...new Set(rows.map((r) => r.type).filter(Boolean))].sort() : ['Full time', 'Contract', 'Campus'];
  const list = useListControls({
    rows,
    fields: [
      { key: 'status', label: 'Status', type: 'multi', options: statuses.map((v) => ({ value: v, label: v })) },
      { key: 'type', label: 'Type', type: 'multi', options: types.map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.code} ${r.title} ${r.department} ${r.location} ${r.client ?? ''}`,
    fieldValue: (r, k) => (k === 'status' ? r.status : r.type),
    views: [
      { id: 'mine', name: 'My open jobs' },
      { id: 'all', name: 'All jobs', shared: true },
    ],
    searchPlaceholder: 'Search jobs',
  });
  const cols: TableColumn<Job>[] = [
    { key: 'code', header: 'Job', type: 'id', value: (r) => r.code, width: 110 },
    { key: 'title', header: 'Title', value: (r) => r.title, render: (r) => <PersonLabel name={r.title} secondary={[r.client ?? r.department, r.location].filter(Boolean).join(' · ')} /> },
    { key: 'type', header: 'Type', value: (r) => r.type, groupable: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => JOB_TONE[v as Job['status']] },
    { key: 'applicants', header: 'Applicants', type: 'number', value: (r) => r.applicants, total: 'sum' },
    { key: 'pipeline', header: 'In pipeline', type: 'number', value: (r) => r.inPipeline },
    { key: 'recruiter', header: 'Recruiter', type: 'person', value: (r) => r.recruiter, person: (r) => ({ name: r.recruiter }) },
    { key: 'posted', header: 'Posted', type: 'date', value: (r) => r.posted },
  ];
  const can = Boolean(live?.canManage);
  const createButton = (!live || can) && (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      Create job
    </Button>
  );
  const liveActions = (r: LiveJobRow) => (
    <>
      {r.careersUrl && <MenuItem onSelect={() => live!.onCopyLink(r)}>Copy careers link</MenuItem>}
      {can && r.status === 'Draft' && <MenuItem onSelect={() => live!.onSubmit(r)}>Send for approval</MenuItem>}
      {can && r.status === 'Waiting for approval' && <MenuItem onSelect={() => live!.onWithdraw(r)}>Withdraw from approval</MenuItem>}
      {can && r.status === 'Closed' && <MenuItem onSelect={() => live!.onStatus(r, 'open')}>Reopen job</MenuItem>}
      {can && r.status === 'Open' && <MenuItem onSelect={() => live!.onStatus(r, 'on_hold')}>Put on hold</MenuItem>}
      {can && r.status === 'On hold' && <MenuItem onSelect={() => live!.onStatus(r, 'open')}>Resume job</MenuItem>}
      {can && (r.status === 'Open' || r.status === 'On hold') && (
        <MenuItem destructive onSelect={() => live!.onStatus(r, 'closed')}>
          Close job
        </MenuItem>
      )}
      {can && (
        <MenuItem destructive onSelect={() => setDeleting(r)}>
          Delete job
        </MenuItem>
      )}
    </>
  );
  return (
    <HireFrame active="Jobs & requisitions">
      <PageHeader title="Jobs" description="Jobs link to departments, designations, grades and locations. Filling or closing the requisition closes every live board posting." actions={createButton || undefined} />
      <DataTable
        label="Jobs"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={live ? live.state : state}
        onRetry={live ? live.onRetry : () => {}}
        filtered={list.filtered}
        onClearFilters={list.clear}
        toolbar={list.toolbar}
        views={live ? undefined : list.views}
        onRowClick={live ? (r) => live.onOpen(r.id) : () => {}}
        rowActions={
          live
            ? (r) => (can || (r as LiveJobRow).careersUrl ? liveActions(r as LiveJobRow) : null)
            : () => (
                <>
                  <MenuItem>Copy careers link</MenuItem>
                  <MenuItem>Put on hold</MenuItem>
                  <MenuItem destructive>Close job</MenuItem>
                </>
              )
        }
        empty={<EmptyState title="No jobs yet." description={live && !can ? 'Jobs your company opens show here.' : 'Create a job from an approved requisition.'} action={createButton || undefined} />}
        onExport={
          live
            ? (_format, keys) => {
                // Answer 225: the visible columns as CSV (Excel opens it too); dates as "3 Nov 2026".
                const shown = cols.filter((c) => keys.includes(c.key));
                const text = (c: TableColumn<Job>, r: Job) => {
                  const v = c.value(r);
                  return v instanceof Date ? formatDate(v) : v == null ? '' : String(v);
                };
                downloadText(`jobs-${formatDate(now ?? new Date()).replace(/ /g, '-')}.csv`, toCsv(shown.map((c) => String(c.header)), list.rows.map((r) => shown.map((c) => text(c, r)))));
              }
            : () => {}
        }
        exportFormats={['csv']}
      />
      {creating && <CreateJobSheet open onOpenChange={(o) => !o && setCreating(false)} choices={live?.create.choices} onCreate={live?.create.onCreate} onDraftDescription={live?.create.onDraftDescription} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          size="sm"
          title={`Delete job ${deleting.title}?`}
          consequence="The job and its pipeline are removed. Candidates stay in your candidate list."
          confirmLabel="Delete job"
          destructive
          onConfirm={async () => {
            await live!.onDelete(deleting);
            setDeleting(null);
          }}
        />
      )}
    </HireFrame>
  );
}

export interface LivePosting extends Posting {
  boardId: string;
}

/** The live job workspace (HIR-03, HIR-24): the job, its board postings and pay range; the page shows the toasts. */
export interface LiveJobWorkspace {
  state: ListState;
  onRetry: () => void;
  /** pipeline:manage. */
  canManage: boolean;
  /** The careers page link when the job is listed. */
  careersUrl: string | null;
  overview: { label: string; value: string; mono?: boolean }[];
  postings: LivePosting[];
  onPosting: (posting: LivePosting, action: 'post' | 'refresh' | 'close') => Promise<void>;
  pay: LivePayRange;
  onOpenPipeline: () => void;
  onViewCareers: () => void;
  onStatus: (to: 'open' | 'closed' | 'on_hold') => Promise<void>;
  /** Answer 222: the recruiter and who it can be changed to (job-manage key); the API audits the change. */
  recruiter: { id: string | null; choices: { value: string; label: string }[]; onChange: (userId: string) => Promise<void> };
  /** Answer 261: the job settings moved here from the old candidates list (tests, scorecard, applying, boards, fit, stage targets). */
  settings?: LiveJobSettings;
}

export interface JobWorkspaceScreenProps {
  job: Job;
  postings: Posting[];
  law: PayLaw;
  range: PayRange;
  activity: TimelineItem[];
  defaultTab?: 'overview' | 'postings' | 'pay' | 'sharing' | 'settings';
  now?: Date;
  live?: LiveJobWorkspace;
  /** The Change recruiter dialog open (story). */
  recruiterOpen?: boolean;
}

// HIR-03 (workspace)
export function JobWorkspaceScreen({ job, postings: initial, law, range, activity, defaultTab = 'overview', now, live, recruiterOpen = false }: JobWorkspaceScreenProps) {
  const [own, setPostings] = useState(initial);
  const [changing, setChanging] = useState(recruiterOpen);
  const [msg, setMsg] = useState('');
  const postings = live ? live.postings : own;
  const act = (board: string, action: 'post' | 'refresh' | 'close') => {
    const done = `${board}: ${action === 'close' ? 'closed' : action === 'refresh' ? 'refreshed' : 'posted'}`;
    if (live) {
      const p = live.postings.find((x) => x.board === board);
      if (p) void live.onPosting(p, action).then(() => setMsg(done), () => undefined);
      return;
    }
    setPostings((ps) => ps.map((p) => (p.board === board ? { ...p, status: action === 'close' ? 'closed' : action === 'refresh' ? 'refreshed' : 'live', error: undefined } : p)));
    setMsg(done);
  };
  const liveCount = postings.filter((p) => p.status === 'live' || p.status === 'refreshed').length;
  if (live && live.state !== 'ready')
    return (
      <HireFrame active="Jobs & requisitions">
        {live.state === 'loading' ? <div className="yx-hire-stack" aria-busy="true" aria-label="Loading the job"><Skeleton height={56} /><Skeleton height={240} /></div> : <ErrorState title="This job could not be loaded." onRetry={live.onRetry} />}
      </HireFrame>
    );
  const can = Boolean(live?.canManage);
  return (
    <HireFrame active="Jobs & requisitions">
      <RecordLayout
        header={
          <ObjectHeader
            name={job.title}
            icon={Briefcase}
            secondary={[job.code, job.department, job.location].filter(Boolean).join(' · ')}
            status={<Badge tone={JOB_TONE[job.status]}>{job.status}</Badge>}
            facts={[
              { label: 'Applicants', value: job.applicants },
              { label: 'In pipeline', value: job.inPipeline },
              { label: 'Live postings', value: liveCount },
              { label: 'Hiring manager', value: job.hiringManager || 'Not set' },
              { label: 'Careers URL', value: live ? (live.careersUrl ? `/careers/${live.careersUrl.split('/careers/')[1] ?? ''}` : 'Not listed') : `/careers/kaveri-foods/${job.slug}` },
            ]}
            actions={
              <>
                {(!live || live.careersUrl) && (
                  <Button icon={ExternalLink} onClick={live?.onViewCareers}>
                    View careers page
                  </Button>
                )}
                <Button variant="primary" onClick={live?.onOpenPipeline}>
                  Open pipeline
                </Button>
              </>
            }
            menu={
              live ? (
                can ? (
                  <>
                    <MenuItem onSelect={() => setChanging(true)}>Change recruiter</MenuItem>
                    {job.status === 'Open' && <MenuItem onSelect={() => void live.onStatus('on_hold').catch(() => undefined)}>Put on hold</MenuItem>}
                    {job.status === 'On hold' && <MenuItem onSelect={() => void live.onStatus('open').catch(() => undefined)}>Resume job</MenuItem>}
                    {job.status === 'Closed' && <MenuItem onSelect={() => void live.onStatus('open').catch(() => undefined)}>Reopen job</MenuItem>}
                    {(job.status === 'Open' || job.status === 'On hold') && (
                      <MenuItem destructive onSelect={() => void live.onStatus('closed').catch(() => undefined)}>
                        Close job and all postings
                      </MenuItem>
                    )}
                  </>
                ) : undefined
              ) : (
                <>
                  <MenuItem onSelect={() => setChanging(true)}>Change recruiter</MenuItem>
                  <MenuItem>Share with vendors</MenuItem>
                  <MenuItem>Put on hold</MenuItem>
                  <MenuItem destructive>Close job and all postings</MenuItem>
                </>
              )
            }
          />
        }
        aside={
          <>
            <Text weight="semibold">Activity</Text>
            <Timeline items={activity} today={now} />
          </>
        }
      >
        <Tabs defaultValue={defaultTab === 'sharing' && live ? 'overview' : defaultTab}>
          <TabsList aria-label="Job sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="postings" count={postings.length}>
              Job-board postings
            </TabsTrigger>
            <TabsTrigger value="pay">Pay range</TabsTrigger>
            {(!live || live.settings) && <TabsTrigger value="settings">Settings</TabsTrigger>}
            {/* Live: internal jobs (HIR-13) and referral settings per job are not built yet (founder question). */}
            {!live && <TabsTrigger value="sharing">Referrals & internal</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview">
            <DescriptionList
              columns={2}
              items={
                live
                  ? live.overview
                  : [
                      { label: 'Department', value: job.department },
                      { label: 'Designation · grade', value: `${job.title} · G6` },
                      { label: 'Location', value: job.location },
                      { label: 'Legal entity', value: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
                      { label: 'Requisition', value: 'REQ-0142 · in plan', mono: true },
                      { label: 'Pipeline template', value: 'Engineering, 6 stages' },
                      { label: 'Scorecard', value: 'QA engineering (4 skills, pass bar 3 of 5)' },
                      { label: 'Employment type', value: job.type },
                    ]
              }
            />
          </TabsContent>
          <TabsContent value="postings">
            <div className="yx-hire-stack">
              <Text as="p" size="sm" tone="secondary">
                Posted through your company&rsquo;s own board accounts. Board fees are your contract with the board; costs flow into recruiting costs.
              </Text>
              {live && postings.length === 0 ? (
                <EmptyState compact title="No job boards yet." description="An admin adds your company's boards in Hiring › Job boards." />
              ) : (
                <PostingStrip postings={postings} onAction={!live || can ? act : undefined} />
              )}
              <span className="yx-visually-hidden" aria-live="polite">
                {msg}
              </span>
            </div>
          </TabsContent>
          <TabsContent value="pay">
            <JobPayRangePanel location={job.location} law={law} defaultRange={range} live={live?.pay} />
          </TabsContent>
          {(!live || live.settings) && (
            <TabsContent value="settings">
              <JobSettingsPanel live={live?.settings ?? SAMPLE_JOB_SETTINGS} />
            </TabsContent>
          )}
          {!live && (
            <TabsContent value="sharing">
              <div className="yx-hire-stack">
                <Switch className="yx-hire-switch" label="Show on internal jobs" description="Employees can apply; tests taken are hidden from their current manager." defaultChecked={job.internal} />
                <Switch className="yx-hire-switch" label="Open for referrals" description="Referral bonus ₹25,000 after the hire completes 90 days." defaultChecked />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </RecordLayout>
      {changing && (
        <RecruiterDialog
          current={live ? live.recruiter.id : null}
          choices={live ? live.recruiter.choices : [{ value: 'u1', label: 'Neha Joshi' }, { value: 'u2', label: 'Imran Qureshi' }]}
          name={job.recruiter}
          onClose={() => setChanging(false)}
          onSave={live ? live.recruiter.onChange : async () => undefined}
        />
      )}
    </HireFrame>
  );
}

const SAMPLE_STAGES = ['Applied', 'Screening', 'Assessment', 'Panel', 'Offer'];
/** The design's settings tab (stories): sample values, actions that only answer. */
const SAMPLE_JOB_SETTINGS: LiveJobSettings = {
  canManage: true,
  canConfigure: true,
  job: { status: 'open', publicApplyEnabled: true, listOnCareers: true, applyUrl: 'https://kaveri-foods.yukthix.in/apply/qa-0311', boardIds: ['b1'], fitCriteria: 'Five or more years in QA with test automation (Playwright or Selenium) and API testing.', fitRubric: [{ label: 'Test automation', weight: 60 }, { label: 'API testing', weight: 40 }] },
  settings: { scorecardTemplateId: 's1', exams: [{ examId: 'e1', title: 'QA aptitude', sendOnStageId: 'Assessment' }] },
  pipelineName: 'Engineering, 6 stages',
  stages: SAMPLE_STAGES.map((n) => ({ id: n, name: n, daysTarget: n === 'Applied' ? 3 : n === 'Screening' ? 5 : n === 'Panel' ? 7 : null, limit: n === 'Panel' ? 6 : null })),
  sendStages: SAMPLE_STAGES.map((n) => ({ value: n, label: n })),
  exams: [{ value: 'e1', label: 'QA aptitude' }, { value: 'e2', label: 'SQL basics' }],
  scorecardTemplates: [{ value: 's1', label: 'QA engineering (4 skills, pass bar 3 of 5)' }],
  jobBoards: [{ value: 'b1', label: 'Naukri' }, { value: 'b2', label: 'LinkedIn' }],
  onLinkExam: async () => undefined,
  onUnlinkExam: async () => undefined,
  onSendOn: async () => undefined,
  onScorecard: async () => undefined,
  onUpdateJob: async () => undefined,
  onScreenAll: async () => ({ queued: 12 }),
  onCopy: async () => undefined,
  onOpenSettings: () => undefined,
};

/** HIR-03 answer 222: change the job's recruiter (pressed with no change: a field error, never a disabled button). */
function RecruiterDialog({ current, choices, name, onClose, onSave }: { current: string | null; choices: { value: string; label: string }[]; name: string; onClose: () => void; onSave: (userId: string) => Promise<void> }) {
  const [to, setTo] = useState<string | null>(current);
  const [tried, setTried] = useState(false);
  const bad = !to || to === current;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title="Change recruiter"
      consequence={`${name || 'Nobody'} is the recruiter now. The change is recorded with your name.`}
      confirmLabel="Change recruiter"
      onConfirm={async () => {
        setTried(true);
        if (bad) return false;
        await onSave(to!);
      }}
    >
      <FormField label="New recruiter" required error={tried && bad ? 'Choose someone other than the current recruiter.' : null}>
        <Select aria-label="New recruiter" value={to} onChange={setTo} options={choices} searchable />
      </FormField>
    </ConfirmDialog>
  );
}

/* ================================================================== HIR-13 · Internal jobs */

export interface InternalApplication {
  id: string;
  job: string;
  applied: Date;
  status: 'Applied' | 'Assessment' | 'Interview' | 'Offer' | 'Not selected';
}

export interface InternalJobsProps {
  jobs: Job[];
  applications: InternalApplication[];
  applyFor?: string | null;
  eligible?: boolean;
}

function InternalJobCards({ jobs, onApply }: { jobs: Job[]; onApply: (id: string) => void }) {
  if (jobs.length === 0) return <EmptyState title="No internal openings right now." description="New internal jobs appear here and in your notifications." />;
  return (
    <ul className="yx-hire-cards" aria-label="Internal openings">
      {jobs.map((j) => (
        <li key={j.id} className="yx-hire-cards__card">
          <Text weight="semibold">{j.title}</Text>
          <Text size="sm" tone="secondary">
            {j.department} · {j.location} · {j.type}
          </Text>
          <Text size="sm">Posted {j.posted ? formatDate(j.posted) : '—'}</Text>
          <Button size="sm" onClick={() => onApply(j.id)}>
            Apply
          </Button>
        </li>
      ))}
    </ul>
  );
}

function InternalApplyForm({ job, eligible }: { job: Job; eligible: boolean }) {
  return (
    <div className="yx-hire-stack">
      {!eligible && (
        <InlineAlert tone="warning" title="You can apply after 12 months in your current role">
          You moved roles on 1 Jan 2026. Internal applications open for you on 1 Jan 2027 (company rule).
        </InlineAlert>
      )}
      <InlineAlert tone="info">
        Your manager, Karthik Subramanian, is told when you reach the offer stage. Test results for this job are visible only to its hiring manager and HR, not to your current manager.
      </InlineAlert>
      <FormField label="Why are you interested?" required>
        <TextArea rows={4} placeholder={`What you would bring to ${job.title}`} />
      </FormField>
      <FormField label="Updated résumé" optional helper="Your profile is used if you don't add one.">
        <FileUpload upload={async () => {}} accept={['.pdf', '.docx']} multiple={false} />
      </FormField>
    </div>
  );
}

const APP_TONE: Record<InternalApplication['status'], BadgeTone> = { Applied: 'neutral', Assessment: 'info', Interview: 'info', Offer: 'success', 'Not selected': 'neutral' };

// HIR-13
export function InternalJobsScreen({ jobs, applications, applyFor = null, eligible = true }: InternalJobsProps) {
  const [apply, setApply] = useState<string | null>(applyFor);
  const job = jobs.find((j) => j.id === apply);
  return (
    <HireFrame active="Jobs & requisitions">
      <PageHeader title="Internal jobs" description="Openings at Kaveri Foods you can apply for. Applying doesn't affect your current role." />
      <InternalJobCards jobs={jobs} onApply={setApply} />
      <Card title="My applications">
        {applications.length === 0 ? (
          <EmptyState compact title="You haven't applied to any internal job yet." />
        ) : (
          <ul className="yx-hire-list">
            {applications.map((a) => (
              <li key={a.id} className="yx-hire-list__item">
                <div className="yx-hire-list__main">
                  <Text weight="medium">{a.job}</Text>
                  <Text size="sm" tone="secondary">
                    Applied {formatDate(a.applied)}
                  </Text>
                </div>
                <Badge tone={APP_TONE[a.status]}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {job && (
        <Drawer
          open
          onOpenChange={(o) => !o && setApply(null)}
          title={`Apply for ${job.title}`}
          subtitle={`${job.department} · ${job.location}`}
          footer={
            <>
              <Button onClick={() => setApply(null)}>Cancel</Button>
              <Button variant="primary" disabled={!eligible}>
                Send application
              </Button>
            </>
          }
        >
          <InternalApplyForm job={job} eligible={eligible} />
        </Drawer>
      )}
    </HireFrame>
  );
}

// HIR-13 (phone)
export function InternalJobsPhone({ jobs, applications, applyFor = null, eligible = true }: InternalJobsProps) {
  const [apply, setApply] = useState<string | null>(applyFor);
  const job = jobs.find((j) => j.id === apply);
  return (
    <PhoneFrame tab="me" title="Internal jobs">
      <InternalJobCards jobs={jobs} onApply={setApply} />
      <Text weight="semibold">My applications</Text>
      {applications.map((a) => (
        <div key={a.id} className="yx-hire-row">
          <Text>{a.job}</Text>
          <Badge tone={APP_TONE[a.status]}>{a.status}</Badge>
        </div>
      ))}
      {job && (
        <BottomSheet
          open
          onOpenChange={(o) => !o && setApply(null)}
          title={`Apply for ${job.title}`}
          footer={
            <Button variant="primary" fullWidth disabled={!eligible}>
              Send application
            </Button>
          }
        >
          <InternalApplyForm job={job} eligible={eligible} />
        </BottomSheet>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== HIR-12 · Referrals */

export interface Referral {
  id: string;
  name: string;
  job: string;
  referred: Date;
  stage: 'Applied' | 'In process' | 'Hired' | 'Not selected';
  joined: Date | null;
  bonus: number;
  paid?: boolean;
  /** Left (People exit) before completing the qualifying days: no bonus (founder answer 205). */
  leftEarly?: boolean;
  /** Their resignation waits for approval: the bonus is on hold (answer 234). */
  onHold?: boolean;
}

/** A job one can refer to (the design's Job, only what the form shows). */
export type ReferJob = Pick<Job, 'id' | 'title' | 'location'>;

/** What the live page sends when someone refers a friend (the résumé as base64 PDF). */
export interface ReferInput {
  jobId: string;
  name: string;
  email: string;
  phone: string;
  resumeBase64: string | null;
  consentGiven: true;
}

/** HIR-12 live: the company's bonus policy (settings) and the refer action; rows and jobs come in as props. */
export interface LiveReferrals {
  /** Bonus (₹) for a referred hire, from the company setting. */
  bonus: number;
  /** Days the hire completes before the bonus is due, from the company setting. */
  qualifyDays: number;
  state: ListState;
  onRetry: () => void;
  /** Rejects with an Error; `status: 409` means this person was already referred for this job. */
  onRefer: (input: ReferInput) => Promise<void>;
}

function ReferralRows({ rows, today, days = 90 }: { rows: Referral[]; today: Date; days?: number }) {
  if (rows.length === 0) return <EmptyState compact title="You haven't referred anyone yet." description={`Refer a friend to an open job. You get a bonus when they complete ${days} days.`} />;
  return (
    <ul className="yx-hire-list">
      {rows.map((r) => {
        const b = referralBonusStatus(r.stage === 'Hired' ? r.joined : null, today, days);
        const bonusText = r.leftEarly && !r.paid
          ? `No bonus: they left before completing ${days} days`
          : r.onHold && !r.paid
            ? `${formatINR(r.bonus)} bonus on hold while their resignation is decided`
          : r.stage === 'Not selected' || (r.bonus === 0 && !r.paid)
            ? 'No bonus'
            : r.stage !== 'Hired'
              ? `Bonus after they join and complete ${days} days`
              : r.paid
                ? `${formatINR(r.bonus)} paid in payroll`
                : b.state === 'eligible'
                  ? `${formatINR(r.bonus)} eligible · paid in the next payroll`
                  : b.state === 'waiting'
                    ? `${formatINR(r.bonus)} on ${formatDate(b.eligibleOn!)} (${b.daysLeft} days to go)`
                    : `${formatINR(r.bonus)} after they join and complete ${days} days`;
        return (
          <li key={r.id} className="yx-hire-list__item">
            <div className="yx-hire-list__main">
              <PersonLabel name={r.name} secondary={`${r.job} · referred ${formatDate(r.referred)}`} />
              <Text size="sm" tone="secondary">
                {bonusText}
              </Text>
            </div>
            <Badge tone={r.stage === 'Hired' ? 'success' : r.stage === 'Not selected' ? 'neutral' : 'info'}>{r.stage}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('That file could not be read. Try another.'));
    r.readAsDataURL(file);
  });

/** The live refer form: controlled, checked when Send is pressed, then sent. */
function useReferForm(jobs: ReferJob[], live: LiveReferrals | undefined, close: () => void) {
  const [job, setJob] = useState<string | null>(jobs[0]?.id ?? null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [resume, setResume] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ duplicate: boolean; text: string } | null>(null);
  const toaster = useToastIfAny();
  const chosenJob = job && jobs.some((j) => j.id === job) ? job : jobs[0]?.id ?? null;
  const early = useTooEarly([
    ...(!chosenJob ? [{ fieldId: 'rf-job', message: 'Choose the job.' }] : []),
    ...(!name.trim() ? [{ fieldId: 'rf-name', message: "Enter your friend's full name." }] : []),
    ...(!EMAIL.test(email.trim()) ? [{ fieldId: 'rf-email', message: 'Enter an email address like name@example.com.' }] : []),
    ...(!/^[6-9]\d{9}$/.test(phone.replace(/\s/g, '')) ? [{ fieldId: 'rf-phone', message: 'Enter a 10-digit mobile number.' }] : []),
    ...(!consent ? [{ fieldId: 'rf-consent', message: 'Tick this once your friend has agreed.' }] : []),
  ]);
  const send = async () => {
    if (!live || early.stop()) return;
    setBusy(true);
    setProblem(null);
    try {
      await live.onRefer({ jobId: chosenJob!, name: name.trim(), email: email.trim(), phone: `+91${phone.replace(/\s/g, '')}`, resumeBase64: resume, consentGiven: true });
      toaster?.toast({ tone: 'success', title: `${name.trim()} referred`, description: 'You can follow them here as they move through hiring.' });
      early.reset();
      setName('');
      setEmail('');
      setPhone('');
      setResume(null);
      setConsent(false);
      close();
    } catch (e) {
      setProblem({ duplicate: (e as { status?: number }).status === 409, text: e instanceof Error && e.message ? e.message : 'That did not work. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return { job: chosenJob, setJob, name, setName, email, setEmail, phone, setPhone, setResume, consent, setConsent, busy, problem, early, send };
}

function ReferForm({ jobs, duplicate, form }: { jobs: ReferJob[]; duplicate?: boolean; form?: ReturnType<typeof useReferForm> }) {
  const [sampleJob, setSampleJob] = useState<string | null>(jobs[0]?.id ?? null);
  const f = form;
  return (
    <div className="yx-hire-stack">
      <FormField id="rf-job" label="Job" required error={f?.early.errorOf('rf-job')}>
        <Select value={f ? f.job : sampleJob} onChange={f ? f.setJob : setSampleJob} options={jobs.map((j) => ({ value: j.id, label: j.title, description: j.location }))} />
      </FormField>
      <FormField id="rf-name" label="Friend's full name" required error={f?.early.errorOf('rf-name')}>
        {f ? <TextField value={f.name} onChange={f.setName} maxLength={200} autoComplete="off" /> : <TextField defaultValue={duplicate ? 'Ananya Iyer' : ''} />}
      </FormField>
      <FieldRow>
        <FormField id="rf-email" label="Email" required error={f?.early.errorOf('rf-email')}>
          {f ? <TextField type="email" value={f.email} onChange={f.setEmail} maxLength={320} autoComplete="off" /> : <TextField type="email" defaultValue={duplicate ? 'ananya.iyer@mailbox.in' : ''} />}
        </FormField>
        <FormField id="rf-phone" label="Mobile" required error={f?.early.errorOf('rf-phone')}>
          {f ? <TextField type="tel" prefix="+91" value={f.phone} onChange={f.setPhone} maxLength={11} autoComplete="off" /> : <TextField type="tel" prefix="+91" />}
        </FormField>
      </FieldRow>
      <FormField label="Résumé" optional helper={f ? 'A PDF, up to 5 MB.' : undefined}>
        <FileUpload
          upload={f ? async (file) => f.setResume(await asBase64(file)) : async () => {}}
          onItemsChange={f ? (items) => void (items.length === 0 && f.setResume(null)) : undefined}
          accept={f ? ['.pdf'] : ['.pdf', '.docx']}
          maxSize={f ? 5 * 1024 * 1024 : undefined}
          multiple={false}
        />
      </FormField>
      {(duplicate || f?.problem?.duplicate) && (
        <InlineAlert tone="warning" title="Already in our system">
          {f?.problem ? `${f.problem.text}. You can still refer them to another job.` : <>This person applied for this job in the last 90 days, so the referral can&rsquo;t be credited. You can still refer them to another job.</>}
        </InlineAlert>
      )}
      {f?.problem && !f.problem.duplicate && <InlineAlert tone="danger" title={f.problem.text} />}
      <FormField id="rf-consent-field" label="Consent" hideLabel error={f?.early.errorOf('rf-consent')}>
        {f ? <Checkbox id="rf-consent" label="My friend agreed that I can share their details" required checked={f.consent} onChange={f.setConsent} /> : <Checkbox label="My friend agreed that I can share their details" required />}
      </FormField>
    </div>
  );
}

// HIR-12
export function ReferralsScreen({ jobs, referrals, today, referOpen = false, duplicate = false, live }: { jobs: ReferJob[]; referrals: Referral[]; today: Date; referOpen?: boolean; duplicate?: boolean; live?: LiveReferrals }) {
  const [open, setOpen] = useState(referOpen);
  const form = useReferForm(jobs, live, () => setOpen(false));
  const days = live?.qualifyDays ?? 90;
  const bonus = live?.bonus ?? 25_000;
  const pending = referrals.filter((r) => r.stage === 'Hired' && !r.paid).reduce((s, r) => s + r.bonus, 0);
  const state = live?.state ?? 'ready';
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader
        title="Referrals"
        description={bonus > 0 ? `Refer people you know. The bonus is paid through payroll once they complete ${days} days.` : 'Refer people you know for our open jobs.'}
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setOpen(true)}>Refer someone</Button>}
      />
      {state === 'loading' ? (
        <Skeleton height={240} />
      ) : state === 'error' ? (
        <ErrorState title="Couldn't load your referrals" description="Check your connection and try again." onRetry={live?.onRetry} />
      ) : (
        <>
          <SummaryTiles
            label="My referrals"
            tiles={[
              { label: 'Referred', value: referrals.length },
              { label: 'Hired', value: referrals.filter((r) => r.stage === 'Hired').length },
              { label: 'Bonus pending', value: formatINR(pending) },
              { label: 'Bonus paid', value: formatINR(referrals.filter((r) => r.paid).reduce((s, r) => s + r.bonus, 0)) },
            ]}
          />
          <Card title="My referrals">
            <ReferralRows rows={referrals} today={today} days={days} />
          </Card>
        </>
      )}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Refer someone"
        subtitle={bonus > 0 ? `Referral bonus up to ${formatINR(bonus)}` : undefined}
        dirty={live ? Boolean(form.name || form.email || form.phone) : undefined}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            {/* Live: never disabled; pressed too early, it shows what is missing (founder rule). */}
            <Button variant="primary" disabled={!live && duplicate} loading={form.busy} onClick={live ? () => void form.send() : undefined}>
              Send referral
            </Button>
          </>
        }
      >
        {live && jobs.length === 0 ? <EmptyState compact title="No open jobs right now." description="Come back when a job opens. You can refer people to any open job." /> : <ReferForm jobs={jobs} duplicate={duplicate} form={live ? form : undefined} />}
      </Drawer>
    </HireFrame>
  );
}

// HIR-12 (phone)
export function ReferralsPhone({ jobs, referrals, today, referOpen = false }: { jobs: ReferJob[]; referrals: Referral[]; today: Date; referOpen?: boolean }) {
  const [open, setOpen] = useState(referOpen);
  return (
    <PhoneFrame tab="me" title="Referrals">
      <Button variant="primary" icon={UserPlus} fullWidth onClick={() => setOpen(true)}>
        Refer someone
      </Button>
      <ReferralRows rows={referrals} today={today} />
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Refer someone"
        footer={
          <Button variant="primary" fullWidth>
            Send referral
          </Button>
        }
      >
        <ReferForm jobs={jobs} />
      </BottomSheet>
    </PhoneFrame>
  );
}

/* ================================================================== HIR-11 · Recruiting costs */

export interface CostEntry {
  id: string;
  period: string;
  job: string | null;
  source: string;
  type: 'Job board' | 'Agency fee' | 'Referral bonus' | 'Assessment' | 'Event' | 'Other';
  amount: number;
  origin: 'Manual' | 'Payroll one-time pay' | 'Assessment cost' | 'Paid outside payroll';
  enteredBy: string;
  note?: string;
  /** Live: the job's id and the month (YYYY-MM), so Edit opens with them. */
  jobId?: string | null;
  month?: string;
}

/** What Add cost / Edit sends: rupees (two decimals at most) and the first day of the month. */
export interface CostInput {
  costType: 'job_board' | 'agency_fee' | 'event' | 'other';
  source: string;
  jobId: string | null;
  amount: number;
  currency: 'INR';
  period: string;
  note: string | null;
}

/** HIR-11 live: the quarter (India time) the tiles add up, the months to enter, the jobs to pick, and the actions. */
export interface LiveRecruitingCosts {
  /** e.g. "Oct–Dec 2026" and its months as YYYY-MM. */
  quarter: { label: string; months: string[] };
  /** Months a cost can be entered for: the months of this quarter, oldest first (value YYYY-MM, label e.g. "Oct"). */
  months: { value: string; label: string }[];
  /** The month the Segment starts on (this month); defaults to the last one offered. */
  defaultMonth?: string;
  jobs: { value: string; label: string }[];
  onRetry: () => void;
  /** `id` null = a new cost. */
  onSave: (input: CostInput, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onExport: (rows: CostEntry[]) => void;
}

const ENTERED_TYPES = [
  { value: 'job_board', label: 'Job board' },
  { value: 'agency_fee', label: 'Agency fee' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
] as const;
const typeValue = (label: string) => ENTERED_TYPES.find((t) => t.label === label)?.value ?? 'other';
const SAMPLE_MONTHS = [
  { value: 'jul', label: 'Jul' },
  { value: 'aug', label: 'Aug' },
  { value: 'sep', label: 'Sep' },
];

// HIR-11
export function RecruitingCostsScreen({ rows, hires, state = 'ready', addOpen = false, live }: { rows: CostEntry[]; hires: number; state?: ListState; addOpen?: boolean; live?: LiveRecruitingCosts }) {
  const months = live?.months ?? SAMPLE_MONTHS;
  const lastMonth = live?.defaultMonth ?? months[months.length - 1]?.value ?? '';
  const [open, setOpen] = useState(addOpen);
  const [editing, setEditing] = useState<CostEntry | null>(null);
  const [deleting, setDeleting] = useState<CostEntry | null>(null);
  const [type, setType] = useState<string | null>('job_board');
  const [source, setSource] = useState('');
  const [job, setJob] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [month, setMonth] = useState<string>(lastMonth);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const toaster = useToastIfAny();
  const early = useTooEarly([
    ...(!source.trim() ? [{ fieldId: 'rc-source', message: 'Say where the money went, for example Naukri.' }] : []),
    ...(!amount || amount <= 0 ? [{ fieldId: 'rc-amount', message: 'Enter the amount in rupees.' }] : []),
  ]);
  const inQuarter = live ? rows.filter((r) => r.month && live.quarter.months.includes(r.month)) : rows;
  const total = inQuarter.reduce((s, r) => s + r.amount, 0);
  const list = useListControls({
    rows,
    fields: [
      { key: 'type', label: 'Cost type', type: 'multi', options: ['Job board', 'Agency fee', 'Referral bonus', 'Assessment', 'Event', 'Other'].map((v) => ({ value: v, label: v })) },
      { key: 'origin', label: 'Origin', type: 'multi', options: ['Manual', 'Payroll one-time pay', 'Paid outside payroll', 'Assessment cost'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.source} ${r.job ?? ''} ${r.note ?? ''}`,
    fieldValue: (r, k) => (k === 'type' ? r.type : r.origin),
    views: [{ id: 'q', name: 'This quarter' }],
  });
  const cols: TableColumn<CostEntry>[] = useMemo(
    () => [
      { key: 'period', header: 'Month', value: (r) => r.period, width: 100 },
      { key: 'type', header: 'Cost type', value: (r) => r.type, groupable: true },
      { key: 'source', header: 'Source', value: (r) => r.source },
      { key: 'job', header: 'Job', value: (r) => r.job ?? 'General spend' },
      { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount, total: 'sum' },
      { key: 'origin', header: 'Origin', type: 'status', value: (r) => r.origin, statusTone: (v) => (v === 'Manual' ? 'neutral' : 'info') },
      { key: 'by', header: 'Entered by', value: (r) => r.enteredBy },
    ],
    [],
  );
  const openSheet = (r: CostEntry | null) => {
    setEditing(r);
    setType(r ? typeValue(r.type) : 'job_board');
    setSource(r?.source ?? '');
    setJob(r?.jobId ?? null);
    setAmount(r?.amount ?? null);
    setMonth(r?.month ?? lastMonth);
    setNote(r?.note ?? '');
    setFailed(null);
    early.reset();
    setOpen(true);
  };
  const save = async () => {
    if (!live || early.stop()) return;
    setBusy(true);
    setFailed(null);
    try {
      await live.onSave({ costType: (type ?? 'other') as CostInput['costType'], source: source.trim(), jobId: job, amount: amount!, currency: 'INR', period: `${month}-01`, note: note.trim() || null }, editing?.id ?? null);
      toaster?.toast({ tone: 'success', title: editing ? 'Cost saved' : 'Cost added', description: `${formatINR(amount!)} · ${source.trim()}` });
      setOpen(false);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  // Live: an older cost keeps its own month (it is not one of the months offered for new costs).
  const monthOptions = editing?.month && !months.some((m) => m.value === editing.month) ? [{ value: editing.month, label: editing.period }, ...months] : months;
  const add = () => (live ? openSheet(null) : setOpen(true));
  return (
    <HireFrame active="Recruiting costs">
      <PageHeader title="Recruiting costs" description="Costs behind cost per hire. Referral bonuses post from payroll and assessment costs from the test settings, so they're never entered twice." actions={<Button variant="primary" icon={Plus} onClick={add}>Add cost</Button>} />
      <SummaryTiles
        label={`Cost summary, ${live?.quarter.label ?? 'Jul–Sep 2026'}`}
        tiles={[
          { label: 'Total spend', value: formatINR(total) },
          { label: 'Hires this quarter', value: hires },
          { label: 'Cost per hire', value: hires ? formatINR(Math.round(total / hires)) : '—', sub: 'Total spend ÷ hires this quarter' },
        ]}
      />
      <DataTable
        label="Recruiting costs"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={live?.onRetry ?? (() => {})}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        defaultGroupBy="type"
        rowActions={(r) =>
          r.origin === 'Manual' ? (
            <>
              <MenuItem onSelect={live ? () => openSheet(r) : undefined}>Edit</MenuItem>
              <MenuItem destructive onSelect={live ? () => setDeleting(r) : undefined}>
                Delete
              </MenuItem>
            </>
          ) : (
            <MenuItem disabled>Posted automatically: edit at source</MenuItem>
          )
        }
        empty={<EmptyState title="No recruiting costs this quarter." description="Add job-board fees, agency fees and events here." action={<Button variant="primary" icon={Plus} onClick={add}>Add cost</Button>} />}
        onExport={() => live?.onExport(list.rows)}
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Edit recruiting cost' : 'Add recruiting cost'}
        dirty={live ? Boolean(source || amount || note) : undefined}
        notice={failed ? <InlineAlert tone="danger" title={failed} /> : undefined}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            {/* Never disabled (founder rule): pressed too early, it shows what is missing. */}
            <Button variant="primary" loading={busy} onClick={live ? () => void save() : undefined}>
              {editing ? 'Save cost' : 'Add cost'}
            </Button>
          </>
        }
      >
        <div className="yx-hire-stack">
          <FormField label="Cost type" required helper="Referral bonuses and assessment costs are added automatically.">
            <Select value={type} onChange={setType} options={ENTERED_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </FormField>
          <FormField id="rc-source" label="Source" required error={early.errorOf('rc-source')}>
            <TextField value={source} onChange={setSource} maxLength={120} placeholder="e.g. Naukri, campus fair at Hosur" />
          </FormField>
          <FormField label="Job" optional helper="Leave empty for general spend.">
            <Select value={job} onChange={setJob} clearable options={live?.jobs ?? [{ value: 'j1', label: 'Senior QA Engineer' }, { value: 'j3', label: 'Accountant' }]} />
          </FormField>
          <FieldRow>
            <FormField id="rc-amount" label="Amount" required error={early.errorOf('rc-amount')}>
              <CurrencyField value={amount} onChange={setAmount} allowPaise max={1_000_000_000} />
            </FormField>
            <FormField label="Month" required>
              <Segment label="Month" value={month} onChange={setMonth} options={monthOptions} />
            </FormField>
          </FieldRow>
          <FormField label="Note" optional>
            <TextArea rows={2} value={note} onChange={setNote} maxLength={500} />
          </FormField>
        </div>
      </Drawer>
      {deleting && live && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete the ${formatINR(deleting.amount)} cost for ${deleting.source}?`}
          consequence="It comes off the totals and the cost per hire. This can't be undone."
          confirmLabel="Delete cost"
          onConfirm={async () => {
            await live.onDelete(deleting.id);
            toaster?.toast({ tone: 'success', title: 'Cost deleted', description: `${formatINR(deleting.amount)} · ${deleting.source}` });
            setDeleting(null);
          }}
        />
      )}
    </HireFrame>
  );
}

/* ================================================================== HIR-12 · All referrals (HR) */

/** One referral as HR sees it (founder answer 204). Dates are calendar days (India time). */
export interface AllReferral {
  id: string;
  name: string;
  job: string;
  referrer: string;
  referred: Date;
  stage: Referral['stage'];
  /** not-hired, waiting (due on `dueOn`), due, paid, left (exited before the qualifying day), none, on-hold (resignation pending, answer 234). */
  bonus: 'not-hired' | 'waiting' | 'due' | 'paid' | 'left' | 'none' | 'on-hold';
  dueOn: Date | null;
  amount: number;
  /** Answer 285: a paid bonus went through payroll or was paid outside payroll. */
  paidVia?: 'payroll' | 'outside' | null;
  /** The referrer has an employee record (payroll can pay them). Unknown = yes. */
  referrerIsEmployee?: boolean;
}

/** How a bonus is marked paid (answer 285). */
export type PaidVia = 'payroll' | 'outside';

/**
 * HIR-12 All referrals live: mark paid through payroll or outside it (409 with the reason when it is not due), undo paid
 * (answer 283: refused with the reason once an approved pay run has it), and retry.
 */
export interface LiveAllReferrals {
  onMarkPaid: (id: string, via: PaidVia) => Promise<void>;
  onUndoPaid?: (id: string) => Promise<void>;
  onRetry: () => void;
}

const BONUS_LABEL: Record<AllReferral['bonus'], string> = { 'not-hired': 'Not hired yet', waiting: 'Waiting', due: 'Due', 'on-hold': 'Bonus on hold', paid: 'Paid', left: 'No bonus: left early', none: 'No bonus' };
const BONUS_TONE: Record<AllReferral['bonus'], BadgeTone> = { 'not-hired': 'neutral', waiting: 'info', due: 'warning', 'on-hold': 'warning', paid: 'success', left: 'neutral', none: 'neutral' };

// HIR-12 · All referrals (HR)
export function AllReferralsScreen({ rows, state = 'ready', confirmId = null, undoId = null, live }: { rows: AllReferral[]; state?: ListState; confirmId?: string | null; undoId?: string | null; live?: LiveAllReferrals }) {
  const [paying, setPaying] = useState<AllReferral | null>(rows.find((r) => r.id === confirmId) ?? null);
  const [undoing, setUndoing] = useState<AllReferral | null>(rows.find((r) => r.id === undoId) ?? null);
  const [via, setVia] = useState<PaidVia>(rows.find((r) => r.id === confirmId)?.referrerIsEmployee === false ? 'outside' : 'payroll');
  const [failed, setFailed] = useState<string | null>(null);
  const pay = (r: AllReferral) => {
    setFailed(null);
    setVia(r.referrerIsEmployee === false ? 'outside' : 'payroll');
    setPaying(r);
  };
  const toaster = useToastIfAny();
  const list = useListControls({
    rows,
    fields: [
      { key: 'bonus', label: 'Bonus', type: 'multi', options: (Object.keys(BONUS_LABEL) as AllReferral['bonus'][]).map((v) => ({ value: v, label: BONUS_LABEL[v] })) },
      { key: 'stage', label: 'Stage', type: 'multi', options: ['Applied', 'In process', 'Hired', 'Not selected'].map((v) => ({ value: v, label: v })) },
    ],
    text: (r) => `${r.name} ${r.job} ${r.referrer}`,
    fieldValue: (r, k) => (k === 'bonus' ? r.bonus : r.stage),
    views: [{ id: 'all', name: 'All referrals' }],
  });
  const cols: TableColumn<AllReferral>[] = useMemo(
    () => [
      { key: 'name', header: 'Person', value: (r) => r.name },
      { key: 'job', header: 'Job', value: (r) => r.job },
      { key: 'referrer', header: 'Referred by', value: (r) => r.referrer },
      { key: 'referred', header: 'Referred', type: 'date', value: (r) => r.referred, render: (r) => formatDate(r.referred) },
      { key: 'stage', header: 'Stage', type: 'status', value: (r) => r.stage, statusTone: (v) => (v === 'Hired' ? 'success' : v === 'Not selected' ? 'neutral' : 'info') },
      { key: 'bonus', header: 'Bonus', value: (r) => BONUS_LABEL[r.bonus], render: (r) => <Badge tone={BONUS_TONE[r.bonus]}>{BONUS_LABEL[r.bonus]}</Badge> },
      { key: 'dueOn', header: 'Due on', value: (r) => (r.dueOn ? formatDate(r.dueOn) : '—') },
      { key: 'amount', header: 'Amount', type: 'money', value: (r) => (r.bonus === 'none' || r.bonus === 'left' ? 0 : r.amount), total: 'sum' },
    ],
    [],
  );
  const due = rows.filter((r) => r.bonus === 'due');
  return (
    <HireFrame active="Candidates & talent CRM">
      <PageHeader title="All referrals" description="Everyone referred, by whom, and where each bonus stands. Marking a bonus paid sends it to payroll; it shows in Recruiting costs once that payroll run is approved." />
      <SummaryTiles
        label="Referral bonuses"
        tiles={[
          { label: 'Referred', value: rows.length },
          { label: 'Hired', value: rows.filter((r) => r.stage === 'Hired').length },
          { label: 'Due now', value: formatINR(due.reduce((s, r) => s + r.amount, 0)), sub: `${due.length} to pay` },
          { label: 'Paid', value: formatINR(rows.filter((r) => r.bonus === 'paid').reduce((s, r) => s + r.amount, 0)) },
        ]}
      />
      <DataTable
        label="All referrals"
        columns={cols}
        rows={list.rows}
        getRowId={(r) => r.id}
        state={state}
        onRetry={live?.onRetry ?? (() => {})}
        toolbar={list.toolbar}
        views={list.views}
        filtered={list.filtered}
        onClearFilters={list.clear}
        rowActions={(r) =>
          r.bonus === 'due' ? (
            <MenuItem onSelect={() => pay(r)}>Mark bonus paid</MenuItem>
          ) : r.bonus === 'paid' && (!live || live.onUndoPaid) ? (
            // Answer 283: undo a paid bonus (payroll: until the pay run is approved; outside payroll: while its quarter is open).
            <MenuItem onSelect={() => (setFailed(null), setUndoing(r))}>Undo paid</MenuItem>
          ) : (
            <MenuItem disabled>{r.bonus === 'paid' ? 'Bonus already paid' : r.bonus === 'on-hold' ? 'On hold: their resignation is pending' : 'No bonus due yet'}</MenuItem>
          )
        }
        empty={<EmptyState title="No referrals yet." description="When employees refer people from Hiring › Referrals, they show here." />}
      />
      {paying && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPaying(null)}
          title={`Mark ${formatINR(paying.amount)} paid to ${paying.referrer}?`}
          consequence={
            via === 'payroll'
              ? `For referring ${paying.name} (${paying.job}). It goes into payroll as a one-time referral bonus in the next open pay month, and shows in Recruiting costs once that payroll run is approved.`
              : `For referring ${paying.name} (${paying.job}). No payroll line is made: you pay it yourself. It shows in Recruiting costs at once, and can be undone while this quarter is open.`
          }
          confirmLabel="Mark paid"
          onConfirm={async () => {
            if (!live) return;
            try {
              await live.onMarkPaid(paying.id, via);
              toaster?.toast({ tone: 'success', title: via === 'payroll' ? 'Bonus sent to payroll' : 'Bonus marked paid outside payroll', description: `${formatINR(paying.amount)} · ${paying.referrer}` });
              setPaying(null);
            } catch (e) {
              setFailed(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
              return false;
            }
          }}
        >
          {paying.referrerIsEmployee === false ? (
            <InlineAlert tone="info" title={`${paying.referrer} has no employee record`}>
              Payroll cannot pay them, so the bonus is marked paid outside payroll.
            </InlineAlert>
          ) : (
            <Segment
              label="Pay through"
              options={[
                { value: 'payroll' as const, label: 'Payroll' },
                { value: 'outside' as const, label: 'Paid outside payroll' },
              ]}
              value={via}
              onChange={setVia}
            />
          )}
          {failed && <InlineAlert tone="danger" title={failed} />}
        </ConfirmDialog>
      )}
      {undoing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setUndoing(null)}
          title={`Undo the ${formatINR(undoing.amount)} bonus paid to ${undoing.referrer}?`}
          consequence={
            undoing.paidVia === 'outside'
              ? `For referring ${undoing.name} (${undoing.job}). The bonus goes back to due and its cost comes off Recruiting costs. Allowed while this quarter is open.`
              : `For referring ${undoing.name} (${undoing.job}). The one-time pay line is cancelled and the bonus goes back to due. Allowed until the payroll run that pays it is approved.`
          }
          confirmLabel="Undo paid"
          onConfirm={async () => {
            if (!live?.onUndoPaid) return;
            try {
              await live.onUndoPaid(undoing.id);
              toaster?.toast({ tone: 'success', title: 'Bonus is due again', description: `${formatINR(undoing.amount)} · ${undoing.referrer}` });
              setUndoing(null);
            } catch (e) {
              setFailed(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
              return false;
            }
          }}
        >
          {failed && <InlineAlert tone="danger" title={failed} />}
        </ConfirmDialog>
      )}
    </HireFrame>
  );
}
