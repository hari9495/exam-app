// Platform (b) kit: shared frame helpers, pure rules (tested in platform-b.test.tsx) and reusable blocks
// for PLT-33…64: ImpactPreview (P19 YX-RULE-07), CodeEditor (P22 script step), AgentPlanCard (P22 do mode).
import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Circle, Download, Loader2, Lock, ShieldAlert, Undo2 } from 'lucide-react';
import { DesktopFrame, type PanelSection } from '../_kit/frames';
import { Button } from '../../components/button';
import { Icon, VisuallyHidden } from '../../components/foundations';
import { AiBadge, Badge, type BadgeTone } from '../../components/display';
import { ErrorState, EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { DataTable, type TableColumn } from '../../components/table';
import { formatINR } from '../../lib/format';
import { addDays, daysBetween, startOfDay } from '../../lib/dates';
import './platform-b.css';

/* ================================================================== frames */

/** Settings panel (APX-D §3): the pages PLT-33…64 live on. Mark the current one with `active`. */
export function settingsPanel(active: string): PanelSection[] {
  const g = (label: string, items: string[]): PanelSection => ({ label, items: items.map((l) => ({ label: l, active: l === active })) });
  return [
    g('Organisation', ['Legal entities', 'Set-up hub', 'Customisation', 'Policies & rules']),
    g('Policies, rules & automations', ['Lookup tables', 'Validation rules', 'Automations', 'Workflow Studio', 'Run log', 'Scripts']),
    g('Integrations & developers', ['Integrations', 'Jobs & errors', 'AI', 'Agent actions']),
    g('Billing & account', ['Plan & add-ons', 'Payout readiness', 'Referral', 'Data export & closure']),
  ];
}

/** Desktop frame on the Settings area with the settings panel. */
export function SettingsFrame({ active, children }: { active: string; children: ReactNode }) {
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel(active)}>
      {children}
    </DesktopFrame>
  );
}

/* ================================================================== rules (pure) */

/** P19 YX-RULE-13: earliest date a conditions-of-service change may take effect for workers. Default 21 days (P07 IN.IR, verify). */
export function earliestEffective(noticeIssued: Date, periodDays = 21): Date {
  return addDays(startOfDay(noticeIssued), periodDays);
}

export type NoticeCheck =
  | { ok: true }
  | { ok: false; reason: 'no-notice' | 'too-early'; earliest?: Date };

/** Refuses an effective date before notice + period. A recorded settlement / award is the lawful exception. */
export function checkNotice(effective: Date, noticeIssued: Date | null, opts: { periodDays?: number; exceptionRef?: string } = {}): NoticeCheck {
  if (opts.exceptionRef) return { ok: true };
  if (!noticeIssued) return { ok: false, reason: 'no-notice' };
  const earliest = earliestEffective(noticeIssued, opts.periodDays);
  return startOfDay(effective) < earliest ? { ok: false, reason: 'too-early', earliest } : { ok: true };
}

export interface ImpactRow {
  id: string;
  name: string;
  department: string;
  oldValue: string;
  newValue: string;
  /** Money change per month, when the rule moves money. */
  moneyDelta?: number;
  /** The law raised or clamped this result (P19 YX-RULE-03). */
  legalAdjusted?: boolean;
}

/** Counts and money impact for an impact preview. */
export function impactTotals(rows: ImpactRow[]) {
  const money = rows.filter((r) => r.moneyDelta != null);
  const sum = money.reduce((s, r) => s + (r.moneyDelta ?? 0), 0);
  return {
    affected: rows.length,
    legalAdjusted: rows.filter((r) => r.legalAdjusted).length,
    moneyTotal: sum,
    moneyAverage: money.length ? Math.round(sum / money.length) : 0,
  };
}

export interface RunStep {
  id: string;
  title: string;
  kind: string;
  reversible: boolean;
  /** Records touched by this step. */
  count: number;
  /** Record edited since the run, or its period is locked (P22 YX-WFS-10). */
  conflict?: string;
}

/** Undo of a run: reversible steps in reverse order, irreversible listed, conflicts refused (YX-WFS-10). */
export function planUndo(steps: RunStep[]) {
  const reversible = steps.filter((s) => s.reversible && !s.conflict).reverse();
  return {
    undo: reversible,
    irreversible: steps.filter((s) => !s.reversible),
    conflicts: steps.filter((s) => s.reversible && s.conflict),
    records: reversible.reduce((n, s) => n + s.count, 0),
  };
}

/** P22 YX-WFS-18 / P10 YX-AI-13: actions an agent or workflow never runs on its own. */
export const ALWAYS_CONFIRM = ['money', 'filing', 'approve-others', 'candidate-rejection', 'termination', 'pay-change'] as const;
export type AlwaysConfirm = (typeof ALWAYS_CONFIRM)[number];
export const ALWAYS_CONFIRM_LABEL: Record<AlwaysConfirm, string> = {
  money: 'Money: payroll release, payouts, bank files',
  filing: 'Statutory filing',
  'approve-others': "Approving or rejecting someone else's request",
  'candidate-rejection': 'Candidate rejection',
  termination: 'Dismissal or termination',
  'pay-change': 'Pay change',
};

export type TrialExtension = { allowed: true; automatic: boolean; days: 14 } | { allowed: false; reason: string };

/** P20 YX-GRO-06: one 14-day extension; automatic at first value, else self-serve with a reason. */
export function trialExtension(s: { extensionsUsed: number; firstValue: boolean }): TrialExtension {
  if (s.extensionsUsed > 0) return { allowed: false, reason: 'Your trial has already been extended once. Talk to us if you need more time.' };
  return { allowed: true, automatic: s.firstValue, days: 14 };
}

/** P14 YX-TEN-08: day of the 30-day read-only period and deletion date. */
export function readOnlyStatus(trialEnd: Date, today: Date) {
  const day = daysBetween(startOfDay(trialEnd), startOfDay(today));
  const deletion = addDays(startOfDay(trialEnd), 30);
  return { day, daysLeft: Math.max(0, 30 - day), deletion, reminderToday: [1, 15, 25].includes(day) };
}

export interface Referral {
  company: string;
  sameGroup?: boolean;
  selfReferral?: boolean;
  firstPaidMonthSettled: boolean;
  refunded?: boolean;
  /** Our latest monthly bill (the referrer's credit, P14 YX-BILL-21). */
  creditAmount: number;
}
export type ReferralStatus = 'earned' | 'pending' | 'not-credited' | 'reversed';

/** P20 YX-GRO-14 / P14 YX-BILL-21. */
export function referralStatus(r: Referral): ReferralStatus {
  if (r.selfReferral || r.sameGroup) return 'not-credited';
  if (r.refunded) return 'reversed';
  return r.firstPaidMonthSettled ? 'earned' : 'pending';
}

export interface PayoutChecks {
  mandate: 'active' | 'pending' | 'failed';
  graceRunUsed: boolean;
  kyb: 'approved' | 'pending' | 'rejected';
  fundingAccount: boolean;
  balance: number;
  netPay: number;
}

/** P14 YX-BILL-18: payroll may run on a pending mandate once (grace run); payout needs KYB, funding and balance. */
export function payoutReadiness(c: PayoutChecks) {
  const payrollBlocked: string[] = [];
  if (c.mandate !== 'active' && c.graceRunUsed) payrollBlocked.push('Auto-debit mandate is not active and the one grace run is used.');
  const payoutBlocked: string[] = [];
  if (c.kyb !== 'approved') payoutBlocked.push(c.kyb === 'rejected' ? 'Payout partner KYB was rejected.' : 'Payout partner KYB is still under review.');
  if (!c.fundingAccount) payoutBlocked.push('Funding account is not set up.');
  const short = Math.max(0, c.netPay - c.balance);
  return { payrollBlocked, payoutBlocked, short, partialPossible: payoutBlocked.length === 0 && short > 0, ready: payrollBlocked.length === 0 && payoutBlocked.length === 0 && short === 0 };
}

/* ================================================================== ImpactPreview */

export interface ImpactPreviewProps {
  /** What the preview is for: "Casual leave, Mine sites · v4". */
  subject: string;
  mode: 'live' | 'sandbox';
  rows: ImpactRow[];
  /** Label for the value column, e.g. "Casual leave days". */
  valueLabel: string;
  failures?: { record: string; message: string }[];
  automationRuns?: number;
  /** Total people in scope, for "x of y". */
  inScope?: number;
  state?: 'ready' | 'loading' | 'error';
  /** Caller may download per P02 field classes. */
  canDownload?: boolean;
  onDownload?: () => void;
  onRetry?: () => void;
  ranAt?: string;
}

/** P19 YX-RULE-07 impact preview: who, old vs new, money impact, validation failures, automation runs. Read-only. */
export function ImpactPreview({ subject, mode, rows, valueLabel, failures = [], automationRuns, inScope, state = 'ready', canDownload, onDownload, onRetry, ranAt }: ImpactPreviewProps) {
  const t = impactTotals(rows);
  const cols: TableColumn<ImpactRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.department }) },
    { key: 'old', header: `Now: ${valueLabel}`, value: (r) => r.oldValue },
    { key: 'new', header: `After: ${valueLabel}`, value: (r) => r.newValue, render: (r) => (r.legalAdjusted ? <span>{r.newValue} <Badge tone="info">Law applied</Badge></span> : r.newValue) },
    ...(rows.some((r) => r.moneyDelta != null)
      ? [{ key: 'money', header: 'Change a month', type: 'money' as const, value: (r: ImpactRow) => r.moneyDelta ?? 0, total: 'sum' as const }]
      : []),
  ];
  if (state === 'loading')
    return (
      <div className="yxp-impact" aria-busy="true">
        <p className="yxp-muted">Running the preview on {mode === 'live' ? 'live data (read-only)' : 'the sandbox'}. Nothing is changed.</p>
        <div className="yxp-stats">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
        <Skeleton height={240} />
      </div>
    );
  if (state === 'error') return <ErrorState title="We couldn't run the impact preview." description="The rule is saved as a draft. Try again; if it keeps failing, contact support with the reference." onRetry={onRetry} reference="IMP-7F31C2" />;
  return (
    <div className="yxp-impact">
      <p className="yxp-muted">
        {subject} · {mode === 'live' ? 'Live data, read-only' : 'Sandbox'}
        {ranAt ? ` · run ${ranAt}` : ''}
      </p>
      <dl className="yxp-stats">
        <div className="yxp-stat">
          <dt>People affected</dt>
          <dd>
            {t.affected}
            {inScope ? <span className="yxp-muted"> of {inScope} in scope</span> : null}
          </dd>
        </div>
        <div className="yxp-stat">
          <dt>Money impact a month</dt>
          <dd>{rows.some((r) => r.moneyDelta != null) ? `${formatINR(t.moneyTotal)} · avg ${formatINR(t.moneyAverage)}` : 'No money change'}</dd>
        </div>
        <div className="yxp-stat">
          <dt>Validation failures</dt>
          <dd>{failures.length}</dd>
        </div>
        <div className="yxp-stat">
          <dt>Automation runs that would fire</dt>
          <dd>{automationRuns ?? 0}</dd>
        </div>
      </dl>
      {t.legalAdjusted > 0 && (
        <InlineAlert tone="warning" title={`For ${t.legalAdjusted} ${t.legalAdjusted === 1 ? 'person' : 'people'} this rule gives less than the law allows. The law will apply.`} />
      )}
      {failures.length > 0 && (
        <InlineAlert tone="danger" title={`${failures.length} existing ${failures.length === 1 ? 'record fails' : 'records fail'} this rule`}>
          <ul className="yxp-list">
            {failures.map((f) => (
              <li key={f.record}>
                <span className="yxp-mono">{f.record}</span>: {f.message}
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <DataTable
        label="Old and new value per person"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        pageSize={8}
        empty={<EmptyState compact title="Nobody is affected by this version." description="The rule gives the same result as today for everyone in scope." />}
        toolbar={
          <Button size="sm" icon={Download} onClick={onDownload} disabled={!canDownload} title={canDownload ? undefined : 'You can download only fields your role can see'}>
            Download
          </Button>
        }
      />
    </div>
  );
}

/* ================================================================== CodeEditor */

export interface CodeEditorProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  /** 1-based line numbers with a problem. */
  problems?: { line: number; message: string; severity: 'error' | 'warning' }[];
}

/** Plain mono code editor with line numbers and problem markers (script step, P22 wave 6). */
export function CodeEditor({ label, value, onChange, readOnly, problems = [] }: CodeEditorProps) {
  const id = useId();
  const lines = value.split('\n');
  const marks = new Map(problems.map((p) => [p.line, p]));
  return (
    <div className="yxp-code">
      <label htmlFor={id} className="yxp-code__label">
        {label}
      </label>
      <div className="yxp-code__frame">
        <ol className="yxp-code__gutter" aria-hidden="true">
          {lines.map((_, i) => (
            <li key={i} data-problem={marks.get(i + 1)?.severity}>
              {i + 1}
            </li>
          ))}
        </ol>
        <textarea
          id={id}
          className="yxp-code__text"
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          rows={Math.max(12, lines.length)}
          onChange={(e) => onChange?.(e.target.value)}
          aria-describedby={problems.length ? `${id}-p` : undefined}
        />
      </div>
      {problems.length > 0 && (
        <ul id={`${id}-p`} className="yxp-list yxp-code__problems">
          {problems.map((p) => (
            <li key={`${p.line}-${p.message}`} data-severity={p.severity}>
              <Badge tone={p.severity === 'error' ? 'danger' : 'warning'}>{p.severity === 'error' ? 'Error' : 'Warning'}</Badge> Line {p.line}: {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================================================================== Agent plan card (PLT-63 / PLT-64) */

export type PlanStepState = 'waiting' | 'running' | 'done' | 'failed' | 'handed-off' | 'undone' | 'skipped';

export interface PlanStep {
  id: string;
  /** "Raise transfer request for Ravi Shankar". */
  action: string;
  /** Records it touches. */
  records: string;
  /** Screen or public API used. */
  api: string;
  irreversible?: boolean;
  alwaysConfirm?: AlwaysConfirm;
  state?: PlanStepState;
  result?: string;
  /** Opens the app's own screen for an always-confirm step. */
  screen?: string;
}

const STATE_TONE: Record<PlanStepState, BadgeTone> = { waiting: 'neutral', running: 'info', done: 'success', failed: 'danger', 'handed-off': 'warning', undone: 'neutral', skipped: 'neutral' };
const STATE_LABEL: Record<PlanStepState, string> = { waiting: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed', 'handed-off': 'Confirm on its screen', undone: 'Undone', skipped: 'Skipped' };
const STATE_ICON: Record<PlanStepState, typeof Circle> = { waiting: Circle, running: Loader2, done: CheckCircle2, failed: AlertTriangle, 'handed-off': ShieldAlert, undone: Undo2, skipped: Ban };

export interface AgentPlanCardProps {
  /** The person's request in their words. */
  request: string;
  steps: PlanStep[];
  /** plan = waiting for approval (PLT-63); progress / summary = after approval (PLT-64). */
  phase: 'plan' | 'progress' | 'summary' | 'cancelled';
  /** "as Divya Raghunathan (your permissions)". */
  actingAs: string;
  onApprove?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onStop?: () => void;
  onUndo?: () => void;
  onOpenScreen?: (step: PlanStep) => void;
  /** Summary sentence at the end. */
  summary?: string;
  /** Plan asks for something outside the person's rights. */
  blocked?: string;
  credits?: string;
  compact?: boolean;
}

/** P22 do mode plan card: steps, records, APIs, irreversible and always-confirm markers; progress, summary, Undo. */
export function AgentPlanCard({ request, steps, phase, actingAs, onApprove, onEdit, onCancel, onStop, onUndo, onOpenScreen, summary, blocked, credits, compact }: AgentPlanCardProps) {
  const [approving, setApproving] = useState(false);
  const done = steps.filter((s) => s.state === 'done').length;
  const handed = steps.filter((s) => s.state === 'handed-off');
  const irreversible = steps.filter((s) => s.irreversible).length;
  const confirms = steps.filter((s) => s.alwaysConfirm).length;
  const reversibleDone = steps.filter((s) => s.state === 'done' && !s.irreversible).length;
  const title = phase === 'plan' ? 'Plan for your approval' : phase === 'progress' ? 'Working on your plan' : phase === 'cancelled' ? 'Plan cancelled' : 'Plan finished';
  return (
    <section className="yxp-plan" data-compact={compact || undefined} aria-label={title}>
      <header className="yxp-plan__head">
        <h3 className="yxp-plan__title">{title}</h3>
        <AiBadge />
      </header>
      <p className="yxp-plan__request">
        <VisuallyHidden>You asked: </VisuallyHidden>“{request}”
      </p>
      <p className="yxp-muted">
        Runs {actingAs}. {steps.length} steps · {irreversible} can't be undone · {confirms} need your separate confirmation.
        {credits ? ` ${credits}` : ''}
      </p>
      {blocked && <InlineAlert tone="danger" title="This plan can't run">{blocked}</InlineAlert>}
      {phase !== 'plan' && (
        <div className="yxp-plan__progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Steps done">
          <span className="yxp-plan__bar" style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} />
        </div>
      )}
      {phase !== 'plan' && (
        <p className="yxp-muted" aria-live="polite">
          {done} of {steps.length} steps done{handed.length ? ` · ${handed.length} waiting for you on the app's own screen` : ''}
        </p>
      )}
      <ol className="yxp-plan__steps">
        {steps.map((s, i) => {
          const st = s.state ?? 'waiting';
          return (
            <li key={s.id} className="yxp-plan__step" data-state={phase === 'plan' ? undefined : st}>
              <span className="yxp-plan__num">{i + 1}</span>
              <div className="yxp-plan__body">
                <span className="yxp-plan__action">{s.action}</span>
                <span className="yxp-muted">
                  {s.records} · {s.api}
                </span>
                <span className="yxp-plan__marks">
                  {s.irreversible && (
                    <Badge tone="warning">
                      <Icon icon={Lock} /> Can't be undone
                    </Badge>
                  )}
                  {s.alwaysConfirm && (
                    <Badge tone="danger">
                      <Icon icon={ShieldAlert} /> Always confirm: {ALWAYS_CONFIRM_LABEL[s.alwaysConfirm]}
                    </Badge>
                  )}
                  {phase !== 'plan' && (
                    <Badge tone={STATE_TONE[st]}>
                      <Icon icon={STATE_ICON[st]} /> {STATE_LABEL[st]}
                    </Badge>
                  )}
                </span>
                {s.result && <span className="yxp-plan__result">{s.result}</span>}
                {st === 'handed-off' && onOpenScreen && (
                  <span>
                    <Button size="sm" onClick={() => onOpenScreen(s)}>
                      {`Open ${s.screen ?? 'screen'}`}
                    </Button>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {phase === 'plan' && (
        <>
          {confirms > 0 && (
            <InlineAlert tone="warning" title="Approving the plan does not run the always-confirm steps">
              Each one opens on its own screen and waits for you to confirm it there.
            </InlineAlert>
          )}
          <footer className="yxp-plan__foot">
            <Button onClick={onCancel}>Cancel</Button>
            <Button onClick={onEdit}>Edit plan</Button>
            <Button
              variant="primary"
              disabled={Boolean(blocked)}
              loading={approving}
              onClick={() => {
                setApproving(true);
                onApprove?.();
              }}
            >
              Approve plan
            </Button>
          </footer>
        </>
      )}
      {phase === 'progress' && (
        <footer className="yxp-plan__foot">
          <Button variant="danger" onClick={onStop}>
            Stop
          </Button>
        </footer>
      )}
      {phase === 'summary' && (
        <>
          {summary && <p className="yxp-plan__summary">{summary}</p>}
          <footer className="yxp-plan__foot">
            <Button icon={Undo2} onClick={onUndo} disabled={reversibleDone === 0}>
              {reversibleDone ? `Undo ${reversibleDone} ${reversibleDone === 1 ? 'step' : 'steps'}` : 'Nothing to undo'}
            </Button>
          </footer>
        </>
      )}
    </section>
  );
}
