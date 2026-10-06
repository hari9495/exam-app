// Ops screens kit: reusable pieces for Helpdesk, Compliance, Expenses, Contract labour and Visitors screens.
// Token-only CSS in ops.css. Pure rules live in ops-rules.ts.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Camera, Check, CircleDashed, Clock, Copy, Download, Lock, UserRound, X } from 'lucide-react';
import { DesktopFrame, type AreaId, type PanelSection } from '../_kit/frames';
import { Badge, type BadgeTone } from '../../components/display';
import { Button } from '../../components/button';
import { Icon, Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { clockState, clockText, slaState, slaText, type ClockItem, type ClockState, type SlaState } from './ops-rules';
import './ops.css';

/* ---------------- Desktop frame per area (APX-D §1.2 panel links) ---------------- */

export type OpsArea = 'helpdesk' | 'compliance' | 'expenses' | 'contract' | 'contractor' | 'visitors';

const PANEL_TITLE: Record<OpsArea, string> = {
  helpdesk: 'Helpdesk',
  compliance: 'Compliance',
  expenses: 'Pay',
  contract: 'Contract labour',
  contractor: 'Contract labour',
  visitors: 'Visitors',
};
const RAIL_AREA: Record<OpsArea, AreaId> = {
  helpdesk: 'helpdesk',
  compliance: 'compliance',
  expenses: 'pay',
  contract: 'contract',
  contractor: 'contract',
  visitors: 'visitors',
};

function panelFor(area: OpsArea, active: string, member: boolean, counts: Record<string, number>): PanelSection[] {
  const mk = (labels: string[]) => labels.map((label) => ({ label, active: label === active, count: counts[label] }));
  switch (area) {
    case 'helpdesk':
      // Cases visible to case members only (YX-CASE-02).
      return [{ items: mk(['Help centre', 'Tickets', 'Knowledge base', ...(member ? ['Cases'] : []), 'Speak-up', 'Policies', 'SLAs']) }];
    case 'compliance':
      // POSH only for IC members (YX-POSH-05).
      return [{ items: mk(['Statutory hub', 'Statutory set-up', 'Registers', 'TDS & Form 16', 'Missing IDs', 'Rules & updates', ...(member ? ['POSH'] : [])]) }];
    case 'expenses':
      return [
        { items: mk(['Payroll', 'Compensation', 'One-time pay & holds', 'Tax centre', 'Loans, recoveries & EWA']) },
        { label: 'Expenses & advances', items: mk(['Expenses home', 'Claims', 'Trips', 'Advances', 'To pay', 'Card statements', 'Expense policy', 'Expense reports']) },
        { items: mk(['Payments & files', 'Reports']) },
      ];
    case 'contract':
      return [{ items: mk(['Contractors', 'Contract workers', 'Vendor compliance', 'CLRA registers & returns', 'Reports']) }];
    case 'contractor':
      return [
        { items: mk(['Contractors', 'Contract workers', 'Vendor compliance', 'CLRA registers & returns', 'Reports']) },
        { label: 'As a contractor', items: mk(['Client establishments', 'Own licences', 'Client compliance packs']) },
      ];
    case 'visitors':
      return [{ items: mk(["Today's visitors", 'Invites', 'Visitor log', 'Kiosks & badges', 'Reports']) }];
  }
}

export interface OpsDeskProps {
  area: OpsArea;
  /** Panel link shown as current. */
  active: string;
  /** Show restricted links (Cases, POSH) — true only for members. */
  member?: boolean;
  counts?: Record<string, number>;
  children: ReactNode;
}
export function OpsDesk({ area, active, member = true, counts = {}, children }: OpsDeskProps) {
  return (
    <DesktopFrame area={RAIL_AREA[area]} panelTitle={PANEL_TITLE[area]} panel={panelFor(area, active, member, counts)}>
      {children}
    </DesktopFrame>
  );
}

/* ---------------- SLA badge (YX-HD-02) ---------------- */

const SLA_TONE: Record<SlaState, BadgeTone> = { 'on-track': 'neutral', 'at-risk': 'warning', breached: 'danger', paused: 'info', met: 'success' };
export function SlaBadge({ elapsedMin, targetMin, paused, met, label }: { elapsedMin: number; targetMin: number; paused?: boolean; met?: boolean; label?: string }) {
  const state = slaState(elapsedMin, targetMin, { paused, met });
  return (
    <Badge tone={SLA_TONE[state]}>
      {label ? `${label}: ` : ''}
      {slaText(elapsedMin, targetMin, state)}
    </Badge>
  );
}

/* ---------------- Statutory / case clock panel ---------------- */

const CLOCK_TONE: Record<ClockState, BadgeTone> = { done: 'success', upcoming: 'neutral', 'due-soon': 'warning', overdue: 'danger', waiting: 'neutral' };
export interface ClockPanelProps {
  title: string;
  items: ClockItem[];
  today: Date;
  /** Legal source line, e.g. "P07 POSH parameters, version 2026-04". */
  source?: ReactNode;
}
/** Due-date banner for statutory clocks (POSH, accident reports, disposal clocks). Each item: date, state in words, escalation. */
export function ClockPanel({ title, items, today, source }: ClockPanelProps) {
  const worst = items.map((i) => clockState(i, today)).find((s) => s === 'overdue') ?? items.map((i) => clockState(i, today)).find((s) => s === 'due-soon');
  return (
    <section className="yx-ops-clock" data-tone={worst ?? 'ok'} aria-label={title}>
      <div className="yx-ops-clock__head">
        <Icon icon={Clock} size="sm" />
        <span className="yx-ops-clock__title">{title}</span>
        {source && <span className="yx-ops-clock__source">{source}</span>}
      </div>
      <ol className="yx-ops-clock__list">
        {items.map((it) => {
          const st = clockState(it, today);
          return (
            <li key={it.key} className="yx-ops-clock__item" data-state={st}>
              <span className="yx-ops-clock__label">{it.label}</span>
              <span className="yx-ops-clock__due">{it.doneOn ? `Done ${formatDate(it.doneOn)}` : it.due ? `Due ${formatDate(it.due)}` : '—'}</span>
              <Badge tone={CLOCK_TONE[st]}>{clockText(it, today)}</Badge>
              {it.escalateOn && !it.doneOn && <span className="yx-ops-clock__esc">Escalates {formatDate(it.escalateOn)}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------------- Confidential wrapper (M08 §7 watermark) ---------------- */

export function Confidential({ children, note = 'Confidential. Only case members can see this. Every view is logged.' }: { children: ReactNode; note?: string }) {
  return (
    <div className="yx-ops-conf">
      <div className="yx-ops-conf__strip" role="note">
        <Icon icon={Lock} size="sm" />
        <span>{note}</span>
      </div>
      <div className="yx-ops-conf__body">
        <div className="yx-ops-conf__mark" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} data-mark="Confidential" />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Receipt, camera, photo, QR placeholders (no external resources) ---------------- */

export function ReceiptImage({ merchant, amount, date, label }: { merchant: string; amount: number; date: Date; label?: string }) {
  return (
    <figure className="yx-ops-receipt" aria-label={label ?? `Receipt from ${merchant}, ${formatINR(amount)}, ${formatDate(date)}`}>
      <svg viewBox="0 0 120 160" role="img" aria-hidden="true" className="yx-ops-receipt__svg">
        <rect x="10" y="6" width="100" height="148" className="yx-ops-receipt__paper" />
        <rect x="24" y="18" width="72" height="8" className="yx-ops-receipt__ink" />
        {[36, 46, 56, 66, 76, 86, 96].map((y, i) => (
          <rect key={y} x="20" y={y} width={i % 2 ? 60 : 80} height="4" className="yx-ops-receipt__line" />
        ))}
        <rect x="20" y="116" width="80" height="2" className="yx-ops-receipt__ink" />
        <rect x="56" y="126" width="44" height="8" className="yx-ops-receipt__ink" />
      </svg>
      <figcaption className="yx-ops-receipt__cap">
        <span>{merchant}</span>
        <span>
          {formatINR(amount)} · {formatDate(date)}
        </span>
      </figcaption>
    </figure>
  );
}

export type CameraState = 'ready' | 'captured' | 'denied' | 'processing';
const CAMERA_TEXT: Record<CameraState, string> = {
  ready: 'Camera preview. Hold the receipt flat inside the frame.',
  captured: 'Photo taken',
  denied: 'Camera access is off. Allow the camera in your phone settings, or choose a photo from your gallery.',
  processing: 'Reading the receipt…',
};
/** Camera placeholder frame (receipt capture, kiosk photo). */
export function CameraFrame({ state = 'ready', subject = 'receipt' }: { state?: CameraState; subject?: 'receipt' | 'face' }) {
  return (
    <div className="yx-ops-camera" data-state={state} role="img" aria-label={CAMERA_TEXT[state]}>
      <svg viewBox="0 0 160 120" aria-hidden="true" className="yx-ops-camera__svg">
        {subject === 'face' ? (
          <>
            <circle cx="80" cy="46" r="20" className="yx-ops-camera__shape" />
            <path d="M40 112c4-24 20-36 40-36s36 12 40 36z" className="yx-ops-camera__shape" />
          </>
        ) : (
          <rect x="50" y="14" width="60" height="92" className="yx-ops-camera__shape" />
        )}
        <path d="M12 30V12h18M130 12h18v18M148 90v18h-18M30 108H12V90" className="yx-ops-camera__corner" />
      </svg>
      <span className="yx-ops-camera__text">
        <Icon icon={state === 'denied' ? AlertTriangle : Camera} size="sm" />
        {CAMERA_TEXT[state]}
      </span>
    </div>
  );
}

export function PhotoPlaceholder({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="yx-ops-photo" data-size={size} role="img" aria-label={`Photo of ${name}`}>
      <Icon icon={UserRound} size="md" />
    </span>
  );
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Deterministic QR-like placeholder (the real code is rendered by the P05 template). */
export function QrPlaceholder({ value, label }: { value: string; label?: string }) {
  const n = 21;
  let h = hash(value);
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
      if (finder) {
        const fx = x >= n - 7 ? x - (n - 7) : x;
        const fy = y >= n - 7 ? y - (n - 7) : y;
        const ring = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
        if (ring) cells.push([x, y]);
        continue;
      }
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      if (h & 0x10000) cells.push([x, y]);
    }
  return (
    <svg className="yx-ops-qr" viewBox={`-1 -1 ${n + 2} ${n + 2}`} role="img" aria-label={label ?? `QR code ${value}`}>
      <rect x="-1" y="-1" width={n + 2} height={n + 2} className="yx-ops-qr__bg" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" className="yx-ops-qr__cell" />
      ))}
    </svg>
  );
}

/* ---------------- Status trail (generate → upload → acknowledged → filed) ---------------- */

export interface TrailStep {
  label: string;
  at?: Date | null;
  note?: string;
}
export function StatusTrail({ steps, current, failed, label = 'Progress' }: { steps: TrailStep[]; current: number; failed?: boolean; label?: string }) {
  return (
    <ol className="yx-ops-trail" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? (failed ? 'failed' : 'current') : 'todo';
        return (
          <li key={s.label} className="yx-ops-trail__step" data-state={state} aria-current={i === current ? 'step' : undefined}>
            <span className="yx-ops-trail__dot" aria-hidden="true">
              {state === 'done' ? <Icon icon={Check} size="sm" /> : state === 'failed' ? <Icon icon={X} size="sm" /> : <Icon icon={CircleDashed} size="sm" />}
            </span>
            <span className="yx-ops-trail__label">
              {s.label}
              <span className="yx-visually-hidden">{state === 'done' ? ', done' : state === 'current' ? ', current step' : state === 'failed' ? ', failed' : ', to do'}</span>
            </span>
            {(s.at || s.note) && <span className="yx-ops-trail__note">{s.at ? formatDate(s.at) : s.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Check list (verification, completeness, law floor) ---------------- */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'pending';
export interface CheckRow {
  id: string;
  label: ReactNode;
  status: CheckStatus;
  detail?: ReactNode;
  action?: ReactNode;
}
const CHECK_BADGE: Record<CheckStatus, [BadgeTone, string]> = { pass: ['success', 'Passed'], fail: ['danger', 'Failed'], warn: ['warning', 'Check'], pending: ['neutral', 'Pending'] };
export function CheckList({ items, label }: { items: CheckRow[]; label: string }) {
  return (
    <ul className="yx-ops-checks" aria-label={label}>
      {items.map((c) => (
        <li key={c.id} className="yx-ops-checks__row" data-status={c.status}>
          <Badge tone={CHECK_BADGE[c.status][0]}>{CHECK_BADGE[c.status][1]}</Badge>
          <span className="yx-ops-checks__text">
            <span className="yx-ops-checks__label">{c.label}</span>
            {c.detail && <span className="yx-ops-checks__detail">{c.detail}</span>}
          </span>
          {c.action && <span className="yx-ops-checks__action">{c.action}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Clause source tag (YX-AST-07) ---------------- */

export function SourceTag({ source, rule: refText }: { source: 'law' | 'company' | 'ai'; rule?: string }) {
  if (source === 'ai') return <Badge tone="ai">AI suggestion</Badge>;
  return <Badge tone={source === 'law' ? 'info' : 'neutral'}>{source === 'law' ? `Law${refText ? ` · ${refText}` : ''}` : 'Company answer'}</Badge>;
}

/* ---------------- Members panel (who can see this case) ---------------- */

export interface CaseMember {
  name: string;
  role: string;
  access?: string;
  external?: boolean;
  blocked?: string;
}
export function MembersList({ members, title = 'Who can see this case' }: { members: CaseMember[]; title?: string }) {
  return (
    <section className="yx-ops-members" aria-label={title}>
      <h3 className="yx-ops-members__title">{title}</h3>
      <ul className="yx-ops-members__list">
        {members.map((m) => (
          <li key={m.name + m.role} className="yx-ops-members__row">
            <span className="yx-ops-members__name">{m.name}</span>
            <span className="yx-ops-members__role">
              {m.role}
              {m.access ? ` · ${m.access}` : ''}
            </span>
            {m.external && <Badge tone="info">External login</Badge>}
            {m.blocked && <Badge tone="danger">{m.blocked}</Badge>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- Money lead ("You will receive ₹X", YX-EXP-06) ---------------- */

export function MoneyLead({ label, amount, sub, tone }: { label: string; amount: number; sub?: ReactNode; tone?: 'default' | 'warning' }) {
  return (
    <div className="yx-ops-lead" data-tone={tone ?? 'default'} aria-live="polite">
      <span className="yx-ops-lead__label">{label}</span>
      <span className="yx-ops-lead__amount">{formatINR(amount)}</span>
      {sub && <span className="yx-ops-lead__sub">{sub}</span>}
    </div>
  );
}

/* ---------------- Access code shown once (YX-CASE-11) ---------------- */

export function AccessCodeCard({ code, onDownload }: { code: string; onDownload?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="yx-ops-code" aria-label="Your case access code">
      <Text size="sm" tone="secondary">
        Your case access code. We show it only once and cannot recover it.
      </Text>
      <span className="yx-ops-code__value" data-testid="access-code">
        {code}
      </span>
      <div className="yx-ops-code__actions">
        <Button
          icon={Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
            } catch {
              /* clipboard blocked: the code is still on screen */
            }
            setCopied(true);
          }}
        >
          {copied ? 'Code copied' : 'Copy code'}
        </Button>
        <Button icon={Download} onClick={onDownload}>
          Download as a file
        </Button>
      </div>
      <span className="yx-visually-hidden" aria-live="polite">
        {copied ? 'Code copied' : ''}
      </span>
      <Text size="sm" tone="secondary">
        Use it on the Check my report page to see updates and reply. No name, device or network address is stored with your report.
      </Text>
    </section>
  );
}

/* ---------------- Due-date month (statutory calendar) ---------------- */

export interface DueItem {
  date: Date;
  label: string;
  tone: BadgeTone;
}
export function DueMonth({ month, items, today, label }: { month: Date; items: DueItem[]; today: Date; label: string }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="yx-ops-due" role="table" aria-label={label}>
      <div className="yx-ops-due__row" role="row">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d} className="yx-ops-due__dow" role="columnheader">
            {d}
          </span>
        ))}
      </div>
      <div className="yx-ops-due__grid" role="rowgroup">
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => (
          <div key={w} className="yx-ops-due__row" role="row">
            {cells.slice(w * 7, w * 7 + 7).map((d, j) => {
              const due = d ? items.filter((it) => it.date.getDate() === d && it.date.getMonth() === month.getMonth()) : [];
              const isToday = d != null && today.getDate() === d && today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear();
              return (
                <div key={j} className="yx-ops-due__cell" role="cell" data-empty={d == null || undefined} data-today={isToday || undefined}>
                  {d != null && <span className="yx-ops-due__day">{d}</span>}
                  {due.map((it) => (
                    <Badge key={it.label} tone={it.tone}>
                      {it.label}
                    </Badge>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Small layout helpers ---------------- */

/** Two-column workspace: main + right rail (T3). Stacks on narrow screens. */
export function Workspace({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="yx-ops-ws">
      <div className="yx-ops-ws__main">{main}</div>
      <aside className="yx-ops-ws__rail">{rail}</aside>
    </div>
  );
}

/** Responsive card grid. */
export function CardGrid({ children, min = 'md' }: { children: ReactNode; min?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="yx-ops-grid" data-min={min}>
      {children}
    </div>
  );
}

/** Figures strip: label + value pairs, plain (no drill needed for record facts). */
export function Facts({ items }: { items: { label: string; value: ReactNode; tone?: 'danger' | 'warning' | 'success' }[] }) {
  return (
    <dl className="yx-ops-facts">
      {items.map((f) => (
        <div key={f.label} className="yx-ops-facts__item" data-tone={f.tone}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Row of buttons / controls. */
export function Actions({ children, end }: { children: ReactNode; end?: boolean }) {
  return (
    <div className="yx-ops-actions" data-end={end || undefined}>
      {children}
    </div>
  );
}
