// Reusable pieces for the People screens (M01, P02, P05, P06). Token-only CSS in people.css.
import { useState, type ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff, Lock } from 'lucide-react';
import { DesktopFrame, type PanelSection } from '../_kit/frames';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { IconButton } from '../../components/button';
import { Icon, Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { daysBetween, fieldVisibility, workingDaysUntil, type FieldClass, type FnfLine, type Persona, type Relation } from './people-logic';
import type { FieldRow } from './people-data';
import { tableToCsv, type TableColumn } from '../../components/table';
import { downloadText } from '../workforce/workforce-kit';
import './people.css';

/* ------------------------------------------------------------------ frames (APX-D §1.2 People, §1.1 Me) */

export type PeoplePage =
  | 'Directory' | 'Org chart' | 'My team'
  | 'Onboarding board' | 'Ready to onboard' | 'Batches' | 'Probation' | 'Buddies' | 'Life events' | 'My checklist tasks'
  | 'Change action' | 'Scheduled' | 'Bulk changes' | 'Restructure' | 'Import'
  | 'Exit cases' | 'F&F' | 'Clearance' | 'Retirements and contracts'
  | 'Documents & letters' | 'Assets' | 'Succession'
  | 'Possible same person' | 'Union register' | 'VRS schemes' | 'Re-verification' | 'Declarations';

const COUNTS: Partial<Record<PeoplePage, number>> = { 'Ready to onboard': 3, Probation: 5, 'Exit cases': 6, Clearance: 5, 'Documents & letters': 5, 'Possible same person': 3 };

/** People panel per persona (P02: navigation hides what a person can't reach). */
export function peoplePanel(active: PeoplePage, persona: Persona = 'hr'): PanelSection[] {
  const it = (label: PeoplePage) => ({ label, active: label === active, count: persona === 'mgr' && label === 'Probation' ? 1 : COUNTS[label] });
  if (persona === 'emp') return [{ items: (['Directory', 'Org chart'] as PeoplePage[]).map(it) }];
  if (persona === 'mgr')
    return [
      { items: (['Directory', 'Org chart', 'My team'] as PeoplePage[]).map(it) },
      { label: 'For my team', items: (['Probation', 'Change action', 'Exit cases', 'Clearance', 'Buddies'] as PeoplePage[]).map(it) },
    ];
  return [
    { items: (['Directory', 'Org chart'] as PeoplePage[]).map(it) },
    { label: 'Onboarding', items: (['Onboarding board', 'Ready to onboard', 'Batches', 'Probation', 'Buddies', 'Life events', 'My checklist tasks'] as PeoplePage[]).map(it) },
    { label: 'Changes', items: (['Change action', 'Scheduled', 'Bulk changes', 'Restructure', 'Import'] as PeoplePage[]).map(it) },
    { label: 'Exits', items: (['Exit cases', 'F&F', 'Clearance', 'Retirements and contracts'] as PeoplePage[]).map(it) },
    { items: (['Documents & letters', 'Assets', 'Succession'] as PeoplePage[]).map(it) },
    { label: 'More', items: (['Possible same person', 'Union register', 'VRS schemes', 'Re-verification', 'Declarations'] as PeoplePage[]).map(it) },
  ];
}

export function PeopleFrame({ active, persona = 'hr', children }: { active: PeoplePage; persona?: Persona; children: ReactNode }) {
  return (
    <DesktopFrame area="people" panelTitle="People" panel={peoplePanel(active, persona)}>
      {children}
    </DesktopFrame>
  );
}

export type MePage = 'Profile' | 'Documents & letters' | 'Change requests' | 'Declarations' | 'Privacy' | 'My exit';
/** Me (avatar menu, APX-D §1.1) pages share the People area: they are the person's own record. */
export function MeFrame({ active, children }: { active: MePage; children: ReactNode }) {
  const items: MePage[] = ['Profile', 'Documents & letters', 'Change requests', 'Declarations', 'Privacy', 'My exit'];
  return (
    <DesktopFrame area="people" panelTitle="Me" panel={[{ items: items.map((label) => ({ label, active: label === active })) }]}>
      {children}
    </DesktopFrame>
  );
}

/* ------------------------------------------------------------------ small displays */

export const STATUS_TONE: Record<string, BadgeTone> = {
  Verified: 'success', Done: 'success', Approved: 'success', Issued: 'success', Valid: 'success', Covered: 'success', Match: 'success', Accepted: 'success', Active: 'success', Confirmed: 'success', 'Waiting for confirmation': 'warning',
  Pending: 'warning', 'Pending verification': 'warning', 'Needs review': 'warning', Expiring: 'warning', Waiting: 'warning', 'Pending approval': 'warning', 'Review due': 'warning', Held: 'warning', 'Due soon': 'warning', Draft: 'neutral',
  Missing: 'danger', Rejected: 'danger', Failed: 'danger', Blocked: 'danger', Overdue: 'danger', Expired: 'danger', Escalated: 'danger', 'With HR': 'danger', 'No successor': 'danger', 'No ready successor': 'warning', Mismatch: 'danger',
  Refused: 'danger', Correction: 'warning', Current: 'success', Past: 'neutral',
  Scheduled: 'info', 'In progress': 'info', Ready: 'success', 'On approval': 'neutral', 'Fix needed': 'warning', Skipped: 'neutral', Leaving: 'warning', Superseded: 'neutral', Scanning: 'info', 'Auto-verified': 'success',
  // PPL-09 restructure.
  Moved: 'success', 'Waiting for approval': 'warning', "Couldn't move": 'danger', "Can't move": 'danger', 'Left out': 'neutral', 'You do this': 'neutral', Cancelled: 'neutral',
};
export const toneOf = (status: string): BadgeTone => STATUS_TONE[status] ?? STATUS_TONE[status.split(':')[0]] ?? 'neutral';
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={toneOf(status)}>{status}</Badge>;

const CLASS_TONE: Record<FieldClass, BadgeTone> = { Public: 'neutral', Internal: 'neutral', Personal: 'info', Confidential: 'warning', Special: 'danger' };
/** P02 field class chip. Text always, colour only supports it. */
export function ClassBadge({ cls }: { cls: FieldClass }) {
  return (
    <Badge tone={CLASS_TONE[cls]} className="yx-ppl__class">
      {cls}
    </Badge>
  );
}

/** A masked value with an audited reveal (P02 §7). Live: `onReveal` asks the server and resolves to the full value. */
export function MaskedValue({ value, masked, canReveal, onReveal, label }: { value: string; masked: string; canReveal: boolean; onReveal?: () => void | Promise<string | void>; label: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reveal = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const full = await onReveal?.();
      setShown(typeof full === 'string' ? full : value);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="yx-ppl__masked">
      <span className="yx-mono">{shown ?? masked}</span>
      {canReveal && shown === null && <IconButton icon={Eye} size="sm" label={`Show ${label}. Your view is recorded.`} disabled={busy} onClick={() => void reveal()} />}
      {/* Hide again, like a password field (founder, 22 Oct 2026); showing it again asks the server and is recorded again. */}
      {shown !== null && <IconButton icon={EyeOff} size="sm" label={`Hide ${label}`} onClick={() => setShown(null)} />}
      {failed && (
        <Text size="sm" tone="danger">
          Could not show the {label}. Try again.
        </Text>
      )}
      <span className="yx-visually-hidden" aria-live="polite">
        {shown !== null ? `${label} shown; this view is recorded in the audit log` : ''}
      </span>
    </span>
  );
}

/** Fields filtered by P02 class for the viewer: hidden fields are not rendered at all (never a blank). */
export function FieldList({ rows, persona, relation, payGrant, onReveal }: { rows: FieldRow[]; persona: Persona; relation: Relation; payGrant?: boolean; onReveal?: (label: string) => void | Promise<string | void> }) {
  const visible = rows.map((r) => ({ r, v: fieldVisibility(r.cls, persona, relation, payGrant) })).filter((x) => x.v !== 'hidden');
  const hidden = rows.length - visible.length;
  return (
    <div className="yx-ppl__fields">
      <dl className="yx-ppl__dl">
        {visible.map(({ r, v }) => (
          <div key={r.label} className="yx-ppl__dl-row">
            <dt>
              {r.label} <ClassBadge cls={r.cls} />
            </dt>
            <dd>
              {v === 'masked' && r.masked ? (
                <MaskedValue value={r.value} masked={r.masked} label={r.label} canReveal={r.reveal ? true : r.canReveal ?? (persona === 'hr' || relation === 'self')} onReveal={r.reveal ?? (() => onReveal?.(r.label))} />
              ) : (
                <span className={r.mono ? 'yx-mono' : undefined}>{r.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {hidden > 0 && (
        <Text size="sm" tone="secondary" as="p" className="yx-ppl__hidden-note">
          <Icon icon={Lock} size="sm" /> {hidden} field{hidden > 1 ? 's' : ''} not shown. HR can grant access to more classes.
        </Text>
      )}
    </div>
  );
}

/** SVG progress ring for journeys (M01 §3.5). */
export function ProgressRing({ value, label, size = 'md' }: { value: number; label: string; size?: 'sm' | 'md' }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="yx-ppl__ring" data-size={size} role="img" aria-label={`${label}: ${v}% done`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="yx-ppl__ring-track" cx="20" cy="20" r={r} />
        <circle className="yx-ppl__ring-value" cx="20" cy="20" r={r} strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      {size === 'md' && <span className="yx-ppl__ring-text">{v}%</span>}
    </span>
  );
}

/** Deadline countdown in working days (F&F, YX-LC-08); `left` when the server counted them on the person's calendar. */
export function DueCountdown({ due, today, holidays = [], label = 'Due', left }: { due: Date; today: Date; holidays?: Date[]; label?: string; left?: number }) {
  const n = left ?? workingDaysUntil(today, due, holidays);
  const tone: BadgeTone = n < 0 ? 'danger' : n <= 1 ? 'warning' : 'info';
  const text = n < 0 ? `Overdue by ${-n} working day${n === -1 ? '' : 's'}` : n === 0 ? 'Due today' : `${n} working day${n === 1 ? '' : 's'} left`;
  return (
    <span className="yx-ppl__countdown">
      <Badge tone={tone}>{text}</Badge>
      <Text size="sm" tone="secondary">
        {label} {formatDate(due)}
      </Text>
    </span>
  );
}

/** Right column (§13): key facts and upcoming events. */
export function FactRail({ title = 'Key facts', facts, events }: { title?: string; facts: { label: string; value: ReactNode }[]; events?: { label: string; date?: Date; tone?: BadgeTone; note?: string }[] }) {
  return (
    <aside className="yx-ppl__rail" aria-label={title}>
      <h2 className="yx-ppl__rail-title">{title}</h2>
      <dl className="yx-ppl__rail-facts">
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {events && events.length > 0 && (
        <>
          <h2 className="yx-ppl__rail-title">Coming up</h2>
          <ul className="yx-ppl__rail-events">
            {events.map((e, i) => (
              <li key={`${e.label}-${i}`}>
                <span>{e.label}</span>
                {e.date && <Badge tone={e.tone ?? 'neutral'}>{formatDate(e.date)}</Badge>}
                {e.note && <Text size="sm" tone="secondary">{e.note}</Text>}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

export interface ChecklistRow {
  id: string;
  title: ReactNode;
  owner?: string;
  due?: Date;
  status: string;
  note?: ReactNode;
  /** Shown after the due date on the same line, e.g. "2 days before joining". */
  when?: string;
  action?: ReactNode;
}
/** Status list with owner, due date and one action per row (clearance, continuity, deprovisioning, forms). */
export function StatusChecklist({ label, rows, today }: { label: string; rows: ChecklistRow[]; today?: Date }) {
  return (
    <ul className="yx-ppl__checklist" aria-label={label}>
      {rows.map((r) => {
        const late = today && r.due && r.status !== 'Done' && daysBetween(r.due, today) > 0;
        return (
          <li key={r.id} className="yx-ppl__check-row">
            <div className="yx-ppl__check-main">
              <span className="yx-ppl__check-title">{r.title}</span>
              <span className="yx-ppl__check-meta">
                {r.owner && <span className="yx-ppl__owner">{r.owner}</span>}
                {r.due && (
                  <Text size="sm" tone={late ? 'danger' : 'secondary'}>
                    {late ? 'Overdue · ' : 'Due '}
                    {formatDate(r.due)}
                    {r.when ? ` · ${r.when}` : ''}
                  </Text>
                )}
              </span>
              {r.note && <Text size="sm" tone="secondary" as="div">{r.note}</Text>}
            </div>
            <div className="yx-ppl__check-side">
              <StatusBadge status={r.status} />
              {r.action && <div className="yx-ppl__check-action">{r.action}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** F&F lines with a "How it's calculated" disclosure per line (fixes U57); live pages add the line's actions there. */
export function ExplainedLines({ lines, title, action }: { lines: FnfLine[]; title: string; action?: (l: FnfLine) => ReactNode }) {
  if (!lines.length) return null;
  return (
    <section className="yx-ppl__lines" aria-label={title}>
      <h3 className="yx-ppl__section-title">{title}</h3>
      <ul>
        {lines.map((l) => (
          <li key={l.id} data-zero={l.amount === 0 || undefined}>
            <details>
              <summary>
                <span className="yx-ppl__line-label">
                  <Icon icon={ChevronDown} size="sm" className="yx-ppl__line-chevron" />
                  {l.label}
                  {l.auto && <Badge tone="info">Pulled automatically</Badge>}
                  {l.wage && <Badge tone="neutral">Wage line</Badge>}
                  {l.held && <Badge tone="warning">{l.heldTag ?? 'Held for open case'}</Badge>}
                  {l.byPayroll && <Badge tone="neutral">Added by payroll</Badge>}
                  {l.kind === 'recovery' && l.amount !== 0 && <Badge tone="neutral">To recover</Badge>}
                </span>
                <span className="yx-ppl__line-amount">{l.amount === 0 ? '—' : formatINR(l.amount)}</span>
              </summary>
              <Text size="sm" tone="secondary" as="p">
                How it's calculated: {l.how}
              </Text>
              {l.heldReason && (
                <Text size="sm" tone="secondary" as="p">
                  Held because: {l.heldReason}
                </Text>
              )}
              {action?.(l)}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Side-by-side evidence (same-person match, merge review). */
export function CompareTable({ caption, left, right, rows, highlight }: { caption: string; left: string; right: string; rows: { label: string; a: ReactNode; b: ReactNode }[]; highlight?: (label: string) => boolean }) {
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
    <table className="yx-ppl__compare">
      <caption className="yx-visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">{left}</th>
          <th scope="col">{right}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} data-match={highlight?.(r.label) || undefined}>
            <th scope="row">{r.label}</th>
            <td>{r.a || <span className="yx-table__none">—</span>}</td>
            <td>{r.b || <span className="yx-table__none">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** Phone list row: person, two facts, a status. */
export function PhoneRow({ name, primary, secondary, status, onOpen }: { name: string; primary: ReactNode; secondary?: ReactNode; status?: string; onOpen?: () => void }) {
  return (
    <li className="yx-ppl__phone-row">
      <button type="button" className="yx-ppl__phone-btn" onClick={onOpen}>
        <PersonLabel name={name} secondary={primary} size={40} />
        <span className="yx-ppl__phone-side">
          {status && <StatusBadge status={status} />}
          {secondary && <Text size="sm" tone="secondary">{secondary}</Text>}
        </span>
      </button>
    </li>
  );
}

/** Main + right column layout used by record pages. */
export function SplitLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="yx-ppl__split">
      <div className="yx-ppl__main">{children}</div>
      {aside}
    </div>
  );
}

/** Loading skeleton in a list's shape (§26). */
export function ListSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="yx-ppl__skeleton" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="yx-skeleton yx-ppl__skeleton-row" aria-hidden="true" />
      ))}
    </div>
  );
}

/** Pick exactly one (a time window, a view): the shared joined Segment (R11), so every pick-one looks the same (founder review 7 Oct 2026). */
export { Segment } from '../../components/segment';

/** A live table's Export: the visible columns as shown on screen, saved as CSV in the browser (formulas neutralised). */
export const exportCsv =
  <R,>(file: string, rows: R[], cols: TableColumn<R>[]) =>
  (_format: 'csv' | 'xlsx', keys: string[]) =>
    downloadText(`${file}.csv`, tableToCsv(rows, cols.filter((c) => keys.includes(c.key))));
