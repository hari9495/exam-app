// Pay-area building blocks (M03 §7): frames with the Pay panel (APX-D §1.2), net-first money summary,
// days strip, "why this number" lines, run stage track, due-date strip, per-employee progress and the
// irreversible-action sheet (APX-D §6.4). Token-only CSS in pay.css.
import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Circle, CircleDot, ExternalLink, Lock, RotateCcw, Send } from 'lucide-react';
import type { IconComponent } from '../../components/foundations';
import { TODAY } from '../_kit/data';
import { FIN_APPROVER, HR_ADMIN, ME, OPEN_QUERIES, PAYROLL_ADMIN, PROOFS_WAITING } from './pay-data';
import { DesktopFrame, SCREEN_RAIL, type PanelSection } from '../_kit/frames';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Icon } from '../../components/foundations';
import { Link } from '../../components/button';
import { cx } from '../../lib/cx';
import { formatDate, formatINR, groupIndian } from '../../lib/format';
import { confirmPhraseMatches } from './pay-logic';
import './pay.css';

/* ------------------------------------------------------------------ Frames */

export type PayPersona = 'pa' | 'fin' | 'hr' | 'emp';

export type PayPage =
  | 'home'
  | 'runs'
  | 'queries'
  | 'compensation'
  | 'onetime'
  | 'tax'
  | 'loans'
  | 'expenses'
  | 'payments'
  | 'reports';

/** Pay panel, APX-D §1.2: Payroll (home, runs, queries) · Compensation · One-time pay & holds · Tax centre · Loans, recoveries & EWA · Expenses & advances · Payments & files · Reports. */
export function payPanel(active: PayPage, persona: PayPersona = 'pa', counts: { queries?: number; tax?: number } = {}): PanelSection[] {
  const a = (p: PayPage) => active === p;
  if (persona === 'fin') {
    return [
      { label: 'Payroll', items: [{ label: 'Home', active: a('home') }, { label: 'Runs', active: a('runs'), count: 1 }] },
      { items: [{ label: 'Loans, recoveries & EWA', active: a('loans') }, { label: 'Expenses & advances' }, { label: 'Payments & files', active: a('payments') }, { label: 'Reports', active: a('reports') }] },
    ];
  }
  return [
    { label: 'Payroll', items: [{ label: 'Home', active: a('home') }, { label: 'Runs', active: a('runs') }, { label: 'Queries', active: a('queries'), count: (counts.queries ?? OPEN_QUERIES) || undefined }] },
    {
      items: [
        { label: 'Compensation', active: a('compensation') },
        { label: 'One-time pay & holds', active: a('onetime') },
        // Proof lines waiting for review (PAY-23), counted from the data.
        { label: 'Tax centre', active: a('tax'), count: persona === 'pa' ? (counts.tax ?? PROOFS_WAITING) || undefined : undefined },
        { label: 'Loans, recoveries & EWA', active: a('loans') },
        { label: 'Expenses & advances', active: a('expenses') },
        { label: 'Payments & files', active: a('payments') },
        { label: 'Reports', active: a('reports') },
      ],
    },
  ];
}

export type MyPayPage = 'payslips' | 'tax' | 'form130' | 'loans' | 'ewa' | 'incentives' | 'band';

/** Employee view of Pay (Me › My pay; mobile Pay tab, APX-D §5). */
export function myPayPanel(active: MyPayPage, show: { /** false for people on no incentive plan */ incentives?: boolean; /** false when band visibility is off */ band?: boolean } = {}): PanelSection[] {
  const a = (p: MyPayPage) => active === p;
  return [
    {
      label: 'My pay',
      items: [
        { label: 'Payslips', active: a('payslips') },
        { label: 'Tax workspace', active: a('tax') },
        { label: 'Form 130', active: a('form130') },
        { label: 'Loans & advances', active: a('loans') },
        { label: 'Get paid early', active: a('ewa') },
        ...(show.incentives === false ? [] : [{ label: 'My incentives', active: a('incentives') }]),
        ...(show.band === false ? [] : [{ label: 'My pay band', active: a('band') }]),
      ],
    },
  ];
}

export type PaySettingsPage = '4.1' | '4.2' | '4.3' | '4.4' | '4.5' | '4.6' | '4.7' | '4.10' | '4.11';

/** Settings › Group 4 · Payroll & Statutory (APX-D §3). */
export function paySettingsPanel(active: PaySettingsPage): PanelSection[] {
  const items: [PaySettingsPage, string][] = [
    ['4.1', 'Pay groups & calendars'],
    ['4.2', 'Components & templates'],
    ['4.3', 'Payroll policies'],
    ['4.4', 'Payslip layout'],
    ['4.5', 'Tax'],
    ['4.6', 'Loans & advances'],
    ['4.7', 'Statutory set-up'],
    ['4.10', 'Earned wage access'],
    ['4.11', 'Benefits & FBP'],
  ];
  return [{ label: 'Payroll & Statutory', items: items.map(([id, label]) => ({ label, active: id === active })) }];
}

const railFor = (persona: PayPersona) => {
  const keep: Record<PayPersona, string[]> = {
    pa: ['home', 'people', 'time', 'pay', 'compliance', 'analytics', 'settings'],
    hr: ['home', 'people', 'time', 'pay', 'compliance', 'performance', 'helpdesk', 'analytics', 'settings'],
    fin: ['home', 'pay', 'compliance', 'projects', 'analytics'],
    emp: ['home', 'time', 'pay', 'performance', 'learning', 'helpdesk'],
  };
  return SCREEN_RAIL.filter((r) => keep[persona].includes(r.id));
};

export type SignedIn = { name: string; email: string };
/** Signed-in person per persona: payroll admin Suresh Pillai, finance approver Ramesh Krishnan, HR Lakshmi Venkatesan. */
export const PERSONA_USER: Record<PayPersona, SignedIn> = { pa: PAYROLL_ADMIN, fin: FIN_APPROVER, hr: HR_ADMIN, emp: ME };

/** DesktopFrame with the Pay panel for payroll admin, HR head and finance approver. */
export function PayFrame({
  page,
  persona = 'pa',
  user,
  counts,
  children,
}: {
  page: PayPage;
  persona?: PayPersona;
  /** Signed-in person (default: the persona's own, PERSONA_USER). */
  user?: SignedIn;
  /** Panel badge overrides, e.g. { queries: 0 } on an empty queue. */
  counts?: { queries?: number; tax?: number };
  children: ReactNode;
}) {
  return (
    <DesktopFrame area="pay" panelTitle="Pay" panel={payPanel(page, persona, counts)} railItems={railFor(persona)} user={user ?? PERSONA_USER[persona]}>
      {children}
    </DesktopFrame>
  );
}

/** Employee desktop frame for My pay. */
export function MyPayFrame({ page, user, show, children }: { page: MyPayPage; /** Signed-in employee (default ME). */ user?: SignedIn; /** Hide My incentives / My pay band (myPayPanel). */ show?: { incentives?: boolean; band?: boolean }; children: ReactNode }) {
  return (
    <DesktopFrame area="pay" panelTitle="Pay" panel={myPayPanel(page, show)} railItems={railFor('emp')} user={user}>
      {children}
    </DesktopFrame>
  );
}

/** Settings frame for payroll settings editors (PAY-13…16, EWA policy, group health). */
export function PaySettingsFrame({
  page,
  user = PAYROLL_ADMIN,
  entityId,
  children,
}: {
  page: PaySettingsPage;
  /** Signed-in person (default: payroll admin Suresh Pillai; benefits settings belong to the HR Business Partner). */
  user?: SignedIn;
  /** Legal entity in the top bar (ENTITIES id), e.g. 'kf-tn' for a Tamil Nadu setting. */
  entityId?: string;
  children: ReactNode;
}) {
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={paySettingsPanel(page)} railItems={railFor('pa')} user={user} entityId={entityId}>
      {children}
    </DesktopFrame>
  );
}

/* ------------------------------------------------------------------ Data states */

export type ViewState = 'ready' | 'loading' | 'error' | 'empty';

/** Loading, error and empty for a whole panel; renders children when ready. */
export function StateBlock({
  state,
  empty,
  errorTitle,
  children,
  rows = 4,
  onRetry,
  reference = 'PAY-7F3A21',
}: {
  state: ViewState;
  empty?: ReactNode;
  errorTitle?: string;
  children: ReactNode;
  rows?: number;
  /** Called on Retry. Without it, Retry still shows loading and then the panel, so the button always does something. */
  onRetry?: () => void;
  /** Support reference shown under the error. */
  reference?: string;
}) {
  const [retry, setRetry] = useState<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => {
    if (retry !== 'loading') return;
    const t = setTimeout(() => setRetry('done'), 1200);
    return () => clearTimeout(t);
  }, [retry]);
  const shown: ViewState = state === 'error' && retry !== 'idle' ? (retry === 'loading' ? 'loading' : 'ready') : state;
  if (shown === 'loading')
    return (
      <div className="yx-pay-skeleton" role="status" aria-busy="true" aria-label="Loading">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={i === 0 ? 32 : 20} width={i === 0 ? '40%' : `${90 - i * 8}%`} />
        ))}
      </div>
    );
  if (shown === 'error')
    return (
      <ErrorState
        title={errorTitle ?? "We couldn't load this."}
        description="Check your connection and try again. Your data is safe."
        onRetry={() => {
          setRetry('loading');
          onRetry?.();
        }}
        reference={reference}
      />
    );
  if (shown === 'empty') return <>{empty ?? <EmptyState title="Nothing here yet" description="Items appear here when there is something to review." />}</>;
  return <>{children}</>;
}

/* ------------------------------------------------------------------ Money */

/** Tabular rupee amount with Indian grouping. Negative amounts are written with a minus sign, never colour alone. */
export function Amount({ value, strong, muted, className, signed }: { value: number; strong?: boolean; muted?: boolean; className?: string; /** Show a change: "+₹760", "−₹4,664", "No change" for 0. */ signed?: boolean }) {
  const text = signed ? (value === 0 ? 'No change' : `${value > 0 ? '+' : '−'}${formatINR(Math.abs(value))}`) : formatINR(value);
  return (
    <span className={cx('yx-pay-amt', className)} data-strong={strong || undefined} data-muted={muted || undefined}>
      {text}
    </span>
  );
}

export interface MoneySummaryProps {
  period: string;
  net: number;
  gross: number;
  deductions: number;
  employerCost?: number;
  payDate: Date;
  status?: ReactNode;
  /** e.g. "₹2,140 more than August" */
  change?: ReactNode;
  actions?: ReactNode;
  /** Replaces the "Paid on / Pays on" line, e.g. for a salary on hold: "Not paid yet · paid in the next bank file after your document is checked". */
  payLabel?: ReactNode;
}

/** Net first (U29): the figure people look for, then how it was reached. "Paid on" only once the pay date has passed. */
export function MoneySummary({ period, net, gross, deductions, employerCost, payDate, status, change, actions, payLabel }: MoneySummaryProps) {
  const paid = payDate.getTime() <= TODAY.getTime();
  return (
    <section className="yx-pay-money" aria-label={`Pay for ${period}`}>
      <div className="yx-pay-money__net">
        <p className="yx-pay-money__label">
          Net pay, {period} {status}
        </p>
        <p className="yx-pay-money__figure">{formatINR(net)}</p>
        <p className="yx-pay-money__sub">
          {payLabel ?? `${paid ? 'Paid on' : 'Pays on'} ${formatDate(payDate)}`}
          {change && <> · {change}</>}
        </p>
      </div>
      <dl className="yx-pay-money__parts">
        <div>
          <dt>Gross earnings</dt>
          <dd>{formatINR(gross)}</dd>
        </div>
        <div>
          <dt>Deductions</dt>
          <dd>−{formatINR(deductions)}</dd>
        </div>
        {employerCost != null && (
          <div>
            <dt>Cost to company this month</dt>
            <dd>{formatINR(employerCost)}</dd>
          </div>
        )}
      </dl>
      {actions && <div className="yx-pay-money__actions">{actions}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ Days strip */

export type DayKind = 'paid' | 'lop' | 'holiday' | 'off' | 'leave' | 'future';
const DAY_TEXT: Record<DayKind, string> = { paid: 'Paid', lop: 'Unpaid', holiday: 'Holiday', off: 'Weekly off', leave: 'Paid leave', future: 'Not yet' };

/** One cell per day of the period with a text legend and counts (U30: LOP always with dates). */
export function DaysStrip({ days, periodLabel }: { days: { day: number; kind: DayKind }[]; periodLabel: string }) {
  const counts = days.reduce<Record<string, number>>((a, d) => ((a[d.kind] = (a[d.kind] ?? 0) + 1), a), {});
  const lopDates = days.filter((d) => d.kind === 'lop').map((d) => d.day);
  return (
    <figure className="yx-pay-days" aria-label={`Days in ${periodLabel}`}>
      <ol className="yx-pay-days__cells">
        {days.map((d) => (
          <li key={d.day} data-kind={d.kind} title={`${d.day}: ${DAY_TEXT[d.kind]}`}>
            <span aria-hidden="true">{d.day}</span>
            <span className="yx-visually-hidden">
              {d.day}: {DAY_TEXT[d.kind]}
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="yx-pay-days__legend">
        {(Object.keys(DAY_TEXT) as DayKind[])
          .filter((k) => counts[k])
          .map((k) => (
            <span key={k} data-kind={k}>
              <i aria-hidden="true" />
              {DAY_TEXT[k]} {counts[k]}
            </span>
          ))}
        {lopDates.length > 0 && <span className="yx-pay-days__lop">Unpaid days: {lopDates.join(', ')} {periodLabel.split(' ')[0]}</span>}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ Why this number */

export interface ExplainedLine {
  id: string;
  label: string;
  amount: number;
  kind: 'earning' | 'deduction' | 'employer';
  formula?: string;
  inputs?: string;
  rule?: string;
  segment?: string;
  /** Source link text, e.g. "LOP input by Lakshmi V, 24 Sep". */
  source?: string;
  /** Where the source link goes (attendance day, tax workspace). Without it the source is plain text. */
  sourceHref?: string;
  ytd?: number;
}

/** Each line with formula, inputs, rule version and segment (YX-PAY-12). Lines expand to show the working. */
export function WhyThisNumber({ lines, onQuery, defaultOpenId }: { lines: ExplainedLine[]; onQuery?: (line: ExplainedLine) => void; defaultOpenId?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpenId ?? null);
  const groups: [ExplainedLine['kind'], string][] = [
    ['earning', 'Earnings'],
    ['deduction', 'Deductions'],
    ['employer', 'Paid by the company (not in your net)'],
  ];
  return (
    <div className="yx-pay-why">
      {groups.map(([k, title]) => {
        const ls = lines.filter((l) => l.kind === k);
        if (!ls.length) return null;
        return (
          <section key={k} className="yx-pay-why__group" aria-label={title}>
            <h3 className="yx-pay-why__title">
              <span>{title}</span>
              <Amount value={(k === 'deduction' ? -1 : 1) * ls.reduce((a, l) => a + l.amount, 0)} strong />
            </h3>
            <ul>
              {ls.map((l) => {
                const expanded = open === l.id;
                return (
                  <li key={l.id} data-open={expanded || undefined}>
                    <button type="button" className="yx-pay-why__row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : l.id)}>
                      <span className="yx-pay-why__label">
                        {l.label}
                        {l.segment && <Badge>{l.segment}</Badge>}
                      </span>
                      <Amount value={k === 'deduction' ? -l.amount : l.amount} />
                    </button>
                    {expanded && (
                      <div className="yx-pay-why__detail">
                        {l.formula && (
                          <p>
                            <span className="yx-pay-why__k">How</span> <code>{l.formula}</code>
                          </p>
                        )}
                        {l.inputs && (
                          <p>
                            <span className="yx-pay-why__k">Inputs</span> {l.inputs}
                          </p>
                        )}
                        {l.rule && (
                          <p>
                            <span className="yx-pay-why__k">Rule</span> {l.rule}
                          </p>
                        )}
                        {l.source && (
                          <p>
                            <span className="yx-pay-why__k">Source</span> {l.sourceHref ? <Link href={l.sourceHref}>{l.source}</Link> : l.source}
                          </p>
                        )}
                        {l.ytd != null && (
                          <p>
                            <span className="yx-pay-why__k">Year to date</span> {formatINR(l.ytd)}
                          </p>
                        )}
                        {onQuery && (
                          <Button size="sm" onClick={() => onQuery(l)}>
                            Ask about this line
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {lines.some((l) => l.kind === 'earning') && (
        <p className="yx-pay-why__net">
          <span>Net pay = earnings − deductions</span>
          <Amount value={lines.reduce((a, l) => a + (l.kind === 'earning' ? l.amount : l.kind === 'deduction' ? -l.amount : 0), 0)} strong />
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Run stage track */

export const RUN_STAGES = ['Draft', 'Calculated', 'In review', 'Approved and locked', 'Paid', 'Published'] as const;
export type RunStage = (typeof RUN_STAGES)[number];

/** Horizontal stage list for a pay run (M03 §3): done / current / not started, written in words. */
export function RunStageTrack({
  current,
  blocked,
  label = 'Pay run stages',
  complete,
  blockedAction,
}: {
  current: RunStage;
  /** Why the current stage is blocked, e.g. "1 payslip failed: Sridhar Fernandes". */
  blocked?: string;
  label?: string;
  /** The run has finished: the last stage reads Done, not Current. */
  complete?: boolean;
  /** Fix for the block, shown under the blocked stage (e.g. an "Open failed payslips" button). */
  blockedAction?: ReactNode;
}) {
  const idx = RUN_STAGES.indexOf(current);
  return (
    <ol className="yx-pay-stages" aria-label={label}>
      {RUN_STAGES.map((s, i) => {
        const st = i < idx || (complete && i === idx) ? 'done' : i === idx ? (blocked ? 'blocked' : 'current') : 'todo';
        const icon = st === 'done' ? CheckCircle2 : st === 'blocked' ? AlertCircle : st === 'current' ? CircleDot : Circle;
        const text = st === 'done' ? 'Done' : st === 'blocked' ? 'Blocked' : st === 'current' ? 'Current' : 'Not started';
        return (
          <li key={s} data-state={st} aria-current={i === idx ? 'step' : undefined}>
            <Icon icon={icon} />
            <span className="yx-pay-stages__name">{s}</span>
            <span className="yx-pay-stages__state">{st === 'blocked' ? blocked : text}</span>
            {st === 'blocked' && blockedAction && <span className="yx-pay-stages__action">{blockedAction}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ Due-date strip */

export interface DueItem {
  id: string;
  statute: string;
  what: string;
  due: Date;
  status: 'done' | 'due' | 'overdue' | 'not-due';
  /** P07 estimated penalty when late (YX-STAT-14). */
  penalty?: number;
  /** The next step for a due or overdue item, e.g. "File PT return" to the statutory hub. */
  action?: { label: string; href?: string; onClick?: () => void };
}
const DUE_TONE: Record<DueItem['status'], BadgeTone> = { done: 'success', due: 'warning', overdue: 'danger', 'not-due': 'neutral' };

/** Relative badge from today: "9 days overdue", "Due tomorrow", "Due in 8 days"; filed items say Filed. */
function dueText(it: DueItem) {
  if (it.status === 'done') return 'Filed';
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((day(it.due) - day(TODAY)) / 86_400_000);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** Compliance calendar items for the month (P07 calendar via SCH-07). Due and overdue items carry their next step. */
export function DueDateStrip({ items }: { items: DueItem[] }) {
  return (
    <ul className="yx-pay-due" aria-label="Statutory due dates">
      {items.map((it) => (
        <li key={it.id} data-status={it.status}>
          <span className="yx-pay-due__statute">{it.statute}</span>
          <span className="yx-pay-due__what">{it.what}</span>
          <span className="yx-pay-due__date">{formatDate(it.due)}</span>
          <Badge tone={DUE_TONE[it.status]}>{dueText(it)}</Badge>
          {it.penalty != null && it.status === 'overdue' && <span className="yx-pay-due__pen">Penalty if filed today: about {formatINR(it.penalty)}</span>}
          {it.action && (it.status === 'due' || it.status === 'overdue') && (
            <span className="yx-pay-due__action">
              {it.action.href ? (
                <Button size="sm" asChild>
                  <a href={it.action.href} target="_top" onClick={it.action.onClick}>
                    {it.action.label}
                  </a>
                </Button>
              ) : (
                <Button size="sm" onClick={it.action.onClick}>
                  {it.action.label}
                </Button>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Per-employee progress */

export interface ProgressFailure {
  employee: string;
  code: string;
  record: string;
  field: string;
  fix: string;
  /** Where the fix happens (the employee's compensation, the salary template). */
  fixHref?: string;
}

/**
 * YX-PAY-34: inline per-employee progress; failures name employee, record and field with a Fix button.
 * Once finished, the heading says so and the bar shows done plus failed (the failed part in red).
 */
export function RunProgress({
  action,
  done,
  total,
  failures = [],
  finished,
  onFix,
  onRetryFailed,
}: {
  action: string;
  done: number;
  total: number;
  failures?: ProgressFailure[];
  finished?: boolean;
  onFix?: (failure: ProgressFailure) => void;
  /** Retries only the failed employees; shown once the run has finished with failures. */
  onRetryFailed?: () => void;
}) {
  const failed = failures.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const failedPct = total ? Math.round((failed / total) * 100) : 0;
  const title = finished && failed > 0 ? `${action} finished: ${failed} payslip${failed === 1 ? '' : 's'} failed` : action;
  return (
    <section className="yx-pay-progress" aria-label={`${action} progress`}>
      <div className="yx-pay-progress__head">
        <strong>{title}</strong>
        <span aria-live="polite">
          {finished
            ? `Finished · ${groupIndian(done)} done${failed > 0 ? ` · ${failed} failed` : ''} of ${groupIndian(total)} employees`
            : `${groupIndian(done)} of ${groupIndian(total)} employees · ${pct}%${failed > 0 ? ` · ${failed} failed` : ''}`}
        </span>
      </div>
      <div className="yx-pay-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done + (finished ? failed : 0)} aria-label={action}>
        <span style={{ width: `${pct}%` }} />
        {finished && failed > 0 && <span className="yx-pay-progress__failed" style={{ width: `${failedPct}%` }} />}
      </div>
      {failed > 0 && (
        <>
          <div className="yx-pay-progress__note">
            <p>The run changes status only when every payslip succeeds. Fix these, then retry the failed employees.</p>
            {finished && onRetryFailed && (
              <Button size="sm" icon={RotateCcw} onClick={onRetryFailed}>
                Retry {failed} failed
              </Button>
            )}
          </div>
          <ul className="yx-pay-progress__fails">
            {failures.map((f) => (
              <li key={f.code}>
                <Icon icon={AlertCircle} />
                <span>
                  <strong>{f.employee}</strong> <span className="yx-pay-nowrap">({f.code})</span> · {f.record} · {f.field}
                </span>
                {f.fixHref ? (
                  <Button size="sm" asChild>
                    <a href={f.fixHref} target="_top" onClick={onFix ? () => onFix(f) : undefined}>
                      {f.fix}
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onFix?.(f)}>
                    {f.fix}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Irreversible action (APX-D §6.4) */

export interface ImpactRow {
  label: string;
  value: ReactNode;
}

export interface IrreversibleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Approve and lock September 2026" */
  title: string;
  subtitle?: ReactNode;
  impact: ImpactRow[];
  /** What cannot be undone. */
  cannotUndo: ReactNode;
  /** Correction path afterwards. */
  correction: ReactNode;
  /** Phrase to type, e.g. "KAVERI FOODS SEP 2026". */
  phrase: string;
  reasonRequired?: boolean;
  maker: string;
  checker: string;
  /** Sole-admin company: self-approval with a reason (P02 Q6). */
  selfApproval?: boolean;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  /** Blocks confirmation with a named reason (open attendance exceptions, missing permission…). */
  blocked?: ReactNode;
  children?: ReactNode;
  defaultTyped?: string;
  defaultReason?: string;
  done?: ReactNode;
  /** Confirm button colour: 'approve' (green) for approvals, 'primary' for publish or release, 'danger' only for destructive actions. Default 'danger'. */
  confirmVariant?: 'approve' | 'primary' | 'danger';
  /** Confirm button icon (default Lock; use Send for publishing). */
  confirmIcon?: IconComponent;
  /** Short reason shown beside the disabled confirm button while blocked, e.g. "4 attendance exceptions open". */
  blockedReason?: string;
  /** The fix for the block, shown in the blocked alert (e.g. "Open 4 exceptions"). */
  blockedAction?: ReactNode;
  /** When maker = checker: the person who can confirm instead, offered as "Send to … for approval". */
  otherApprover?: string;
  onSendToChecker?: () => void;
  /** Saving failed or the run changed meanwhile: shown at the top with Try again / Reload run. */
  error?: ReactNode;
  onRetry?: () => void;
  onReload?: () => void;
}

const REASON_MIN = 5;

/** Impact preview + typed confirmation + reason + maker ≠ checker, as a T4 sheet. */
export function IrreversibleSheet(p: IrreversibleSheetProps) {
  const [typed, setTyped] = useState(p.defaultTyped ?? '');
  const [reason, setReason] = useState(p.defaultReason ?? '');
  const needReason = p.reasonRequired || p.selfApproval;
  const phraseOk = confirmPhraseMatches(typed, p.phrase);
  const reasonOk = !needReason || reason.trim().length >= REASON_MIN;
  const ok = phraseOk && reasonOk && !p.blocked;
  const makerCheckerOk = p.maker !== p.checker || p.selfApproval;
  // Approvals stay green behind typed confirmation (R7); publishing is not a lock; danger is for release and void.
  const approving = /^Approve/i.test(p.confirmLabel);
  const publishing = /^Publish/i.test(p.confirmLabel);
  const confirmVariant = p.confirmVariant ?? (approving ? 'approve' : publishing ? 'primary' : 'danger');
  const confirmIcon = p.confirmIcon ?? (publishing ? Send : Lock);
  // The first unmet condition, shown beside the disabled button (B7).
  const why = p.blocked
    ? (p.blockedReason ?? "Can't continue until the issue above is resolved")
    : !phraseOk
      ? `Type ${p.phrase} to continue`
      : !reasonOk
        ? `Add a reason (at least ${REASON_MIN} characters)`
        : null;
  const close = (open: boolean) => {
    // Cancel clears the typed phrase and reason, so reopening never starts half-confirmed (B9).
    if (!open) {
      setTyped(p.defaultTyped ?? '');
      setReason(p.defaultReason ?? '');
    }
    p.onOpenChange(open);
  };
  return (
    <Drawer
      open={p.open}
      onOpenChange={close}
      title={p.title}
      subtitle={p.subtitle}
      size="lg"
      footer={
        p.done ? (
          <Button onClick={() => close(false)}>Close</Button>
        ) : !makerCheckerOk ? (
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            {p.onSendToChecker && (
              <Button variant="primary" icon={Send} onClick={p.onSendToChecker}>
                {p.otherApprover ? `Send to ${p.otherApprover} for approval` : 'Ask another approver'}
              </Button>
            )}
          </>
        ) : (
          <>
            {why && <span className="yx-pay-irrev__why">{why}</span>}
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={confirmVariant} icon={confirmIcon} disabled={!ok} onClick={() => p.onConfirm(reason)}>
              {p.confirmLabel}
            </Button>
          </>
        )
      }
    >
      <div className="yx-pay-irrev">
        {p.done ? (
          p.done
        ) : (
          <>
            {p.error && (
              <InlineAlert
                tone="danger"
                title="This didn't go through"
                actions={
                  <>
                    {p.onRetry && <Button onClick={p.onRetry}>Try again</Button>}
                    {p.onReload && <Button onClick={p.onReload}>Reload run</Button>}
                  </>
                }
              >
                {p.error}
              </InlineAlert>
            )}
            {p.blocked && (
              <InlineAlert tone="danger" title="You can't do this yet" actions={p.blockedAction}>
                {p.blocked}
              </InlineAlert>
            )}
            {!makerCheckerOk && (
              <InlineAlert tone="danger" title="Someone else must confirm this">
                You prepared this run, so {p.otherApprover ?? 'another approver'} has to confirm it.
              </InlineAlert>
            )}
            <section aria-label="What will happen">
              <h3 className="yx-pay-section-title">What will happen</h3>
              <dl className="yx-pay-impact">
                {p.impact.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {p.children}
            <InlineAlert tone="warning" title="This can't be undone">
              {p.cannotUndo}
              <br />
              {p.correction}
            </InlineAlert>
            <section className="yx-pay-mc" aria-label="Maker and checker">
              <p>
                <span className="yx-pay-why__k">Prepared by</span> {p.maker}
              </p>
              <p>
                <span className="yx-pay-why__k">Confirming</span> {p.checker}
              </p>
              {p.selfApproval ? (
                <>
                  <Badge tone="warning">Self-approval</Badge>
                  <p className="yx-pay-mc__note">Only one eligible approver, so a reason is required.</p>
                </>
              ) : makerCheckerOk ? (
                <Badge tone="success">Maker and checker are different people</Badge>
              ) : (
                // The danger alert above already says why; the badge only names the fact (one alert per message).
                <Badge>Same person</Badge>
              )}
            </section>
            {makerCheckerOk && needReason && (
              <FormField label="Reason" required helper={`At least ${REASON_MIN} characters. Stored with the audit event.`}>
                <TextArea value={reason} onChange={setReason} rows={2} />
              </FormField>
            )}
            {makerCheckerOk && (
              <FormField label={`Type ${p.phrase} to confirm`} required helper="Must match exactly, in capitals. The phrase and the totals above are stored with the audit event.">
                <TextField value={typed} onChange={setTyped} autoComplete="off" spellCheck={false} />
              </FormField>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ Small helpers */

/** Section heading used inside pay screens (h2 visual 16 px). */
export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="yx-pay-section-head">
      <h2 className="yx-pay-section-title">{children}</h2>
      {actions && <div className="yx-pay-section-actions">{actions}</div>}
    </div>
  );
}

/** Label / value list inline (facts row). */
export function FactRow({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="yx-pay-facts">
      {items.map((f) => (
        <div key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal bars comparing two or more amounts; each bar carries its figure in text. */
export function CompareBars({ items, label }: { items: { label: string; value: number; note?: ReactNode; emphasis?: boolean }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="yx-pay-bars" aria-label={label}>
      {items.map((it) => (
        <li key={it.label} data-emphasis={it.emphasis || undefined}>
          <span className="yx-pay-bars__label">{it.label}</span>
          <span className="yx-pay-bars__track" aria-hidden="true">
            <span style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className="yx-pay-bars__value">
            {formatINR(it.value)}
            {it.note && <span className="yx-pay-bars__note"> {it.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Position in a range (pay band, loan repaid). */
export function RangeMarker({
  min,
  max,
  value,
  mid,
  label,
  format = formatINR,
  valueLabel = 'You',
}: {
  min: number;
  max: number;
  value: number;
  mid?: number;
  label: string;
  format?: (n: number) => string;
  /** Name for the marked value, e.g. "You" or "Repaid". */
  valueLabel?: string;
}) {
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  const pos = (n: number) => `${Math.min(100, Math.max(0, pct(n)))}%`;
  const into = Math.round(pct(value));
  // Outside the range: the dot stays inside the drawn bar, at the end it passed (an end cap), and the gap is in words.
  const outside = value > max ? 'above' : value < min ? 'below' : null;
  const where = outside === 'above' ? `${format(value - max)} above maximum` : outside === 'below' ? `${format(min - value)} below minimum` : `${into}% into the range`;
  const summary = `${valueLabel} ${format(value)} · ${where}`;
  return (
    <figure className="yx-pay-range" aria-label={`${label}: ${summary}`} data-outside={outside ?? undefined}>
      <p className="yx-pay-range__value">{summary}</p>
      {/* Midpoint label above the track, so the scale below stays one row (minimum, maximum). */}
      {mid != null && (
        <p className="yx-pay-range__above">
          <span className="yx-pay-range__midlabel" style={{ left: pos(mid) }}>
            Midpoint {format(mid)}
          </span>
        </p>
      )}
      <div className="yx-pay-range__track" aria-hidden="true">
        {mid != null && <span className="yx-pay-range__mid" style={{ left: pos(mid) }} />}
        <span className="yx-pay-range__dot" style={{ left: pos(value) }} />
      </div>
      <figcaption className="yx-pay-range__scale">
        <span>Minimum {format(min)}</span>
        <span>Maximum {format(max)}</span>
      </figcaption>
    </figure>
  );
}

/** Empty state for a first-use list, with the primary action. */
export function FirstUse({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <EmptyState title={title} description={description} action={action} help={<Link href="#help">How this works</Link>} />;
}

/** Bordered action to an external partner screen (opens outside YukthiX); pass the partner's own URL. */
export function PartnerLink({ children, href = 'https://partner.example.in' }: { children: ReactNode; href?: string }) {
  return (
    <Button size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        {children} <Icon icon={ExternalLink} label="opens the partner's site" />
      </a>
    </Button>
  );
}
