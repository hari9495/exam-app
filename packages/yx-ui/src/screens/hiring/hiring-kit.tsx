// Reusable pieces for the Hiring (M10) and Projects (M12) screens. Token-only CSS in hiring-kit.css.
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Mail, MessageCircle, ShieldAlert, UserCheck, Video } from 'lucide-react';
import { DesktopFrame, type PanelSection } from '../_kit/frames';
import { Badge, type BadgeTone } from '../../components/display';
import { Button } from '../../components/button';
import { Icon, Text } from '../../components/foundations';
import { InlineAlert, Meter } from '../../components/feedback';
import { FilterBar, SavedViewMenu, type FilterFieldDef } from '../../components/filters';
import type { FilterValue } from '../../lib/table';
import { formatDate, formatINR } from '../../lib/format';
import { eInvoiceWindow, minutesToLabel, type CtcLine, type IdCheckpoint, type Panelist, type ProposedSlot } from './hiring-logic';
import './hiring-kit.css';

/* ------------------------------------------------------------------ frames (APX-D §1.2) */

export type HirePage =
  | 'Headcount plan' | 'Jobs & requisitions' | 'Pipeline' | 'Interviews' | 'Offers & BGV' | 'Candidates & talent CRM' | 'Careers site'
  | 'Clients' | 'Rate cards' | 'Submissions' | 'Placements & bench' | 'Invoices' | 'Collections' | 'Vendors' | 'Bias audits' | 'Recruiting costs';

const HIRE_MAIN = ['Headcount plan', 'Jobs & requisitions', 'Pipeline', 'Interviews', 'Offers & BGV', 'Candidates & talent CRM', 'Careers site'];
const HIRE_STAFFING = ['Clients', 'Rate cards', 'Submissions', 'Placements & bench', 'Invoices', 'Collections', 'Vendors'];
const HIRE_COUNTS: Record<string, number> = { Pipeline: 12, Interviews: 5, 'Offers & BGV': 3, Invoices: 2 };

export function hirePanel(active: HirePage): PanelSection[] {
  const item = (label: string) => ({ label, active: label === active, count: HIRE_COUNTS[label] });
  return [
    { items: HIRE_MAIN.map(item) },
    { label: 'Staffing desk', items: HIRE_STAFFING.map(item) },
    { label: 'Reports & compliance', items: ['Recruiting costs', 'Bias audits'].map(item) },
  ];
}

export function HireFrame({ active, children }: { active: HirePage; children: ReactNode }) {
  return (
    <DesktopFrame area="hire" panelTitle="Hiring" panel={hirePanel(active)}>
      {children}
    </DesktopFrame>
  );
}

export type ProjectsPage = 'Projects' | 'Timesheet approvals' | 'Capacity & utilisation' | 'Bench & requests' | 'Costing & margin' | 'Billing workbench' | 'Reports';
const PRJ_ITEMS: ProjectsPage[] = ['Projects', 'Timesheet approvals', 'Capacity & utilisation', 'Bench & requests', 'Costing & margin', 'Billing workbench', 'Reports'];

export function projectsPanel(active: ProjectsPage): PanelSection[] {
  return [{ items: PRJ_ITEMS.map((label) => ({ label, active: label === active, count: label === 'Timesheet approvals' ? 9 : undefined })) }];
}

export function ProjectsFrame({ active, children }: { active: ProjectsPage; children: ReactNode }) {
  return (
    <DesktopFrame area="projects" panelTitle="Projects" panel={projectsPanel(active)}>
      {children}
    </DesktopFrame>
  );
}

/** Settings › Time & Leave (APX-D §3 group 3); 3.11 holds the M12 settings and PRJ-08 mapping rules. */
export function SettingsTimeFrame({ children }: { children: ReactNode }) {
  const pages = ['3.1 Attendance modes', '3.3 Shifts & patterns', '3.6 Leave types', '3.8 Holiday calendars', '3.10 Periods & locks', '3.11 Projects & timesheets', '3.12 Visitors'];
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={[{ label: 'Time & Leave', items: pages.map((label) => ({ label, active: label.startsWith('3.11') })) }]}>
      {children}
    </DesktopFrame>
  );
}

/* ------------------------------------------------------------------ T3 record layout */

/** T3 record workspace: main column plus a right activity panel that stacks below on narrow screens. */
export function RecordLayout({ header, children, aside, banner }: { header: ReactNode; children: ReactNode; aside?: ReactNode; banner?: ReactNode }) {
  return (
    <div className="yx-hire-record">
      {banner}
      {header}
      <div className="yx-hire-record__body" data-aside={aside ? true : undefined}>
        <div className="yx-hire-record__main">{children}</div>
        {aside && (
          <aside className="yx-hire-record__aside" aria-label="Activity">
            {aside}
          </aside>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ list controls (T2) */

export interface ListControlsOptions<R> {
  rows: R[];
  fields: FilterFieldDef[];
  /** Text searched by the search box. */
  text: (r: R) => string;
  /** Value of a multi filter field for a row. */
  fieldValue: (r: R, key: string) => string;
  views: { id: string; name: string; shared?: boolean }[];
  searchPlaceholder?: string;
  defaultFilters?: FilterValue[];
}

/** FilterBar + saved views that actually filter the rows (search and multi filters). */
export function useListControls<R>({ rows, fields, text, fieldValue, views, searchPlaceholder, defaultFilters = [] }: ListControlsOptions<R>) {
  const [filters, setFilters] = useState<FilterValue[]>(defaultFilters);
  const [search, setSearch] = useState('');
  const [view, setView] = useState(views[0]?.id ?? '');
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || text(r).toLowerCase().includes(q)) &&
        filters.every((f) => f.type !== 'multi' || f.values.length === 0 || f.values.includes(fieldValue(r, f.key))),
    );
  }, [rows, filters, search, text, fieldValue]);
  const active = search.trim() !== '' || filters.some((f) => f.type === 'multi' && f.values.length > 0);
  return {
    rows: filteredRows,
    filtered: active,
    clear: () => {
      setFilters([]);
      setSearch('');
    },
    toolbar: <FilterBar fields={fields} value={filters} onChange={setFilters} search={search} onSearchChange={setSearch} searchPlaceholder={searchPlaceholder} />,
    views: <SavedViewMenu views={views} currentId={view} onSelect={setView} modified={active} onSave={() => {}} onSaveAs={() => {}} />,
  };
}

/* ------------------------------------------------------------------ small displays */

export interface Tile {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

/** Row of key figures above a list or report. Numbers always come with words. */
export function SummaryTiles({ tiles, label }: { tiles: Tile[]; label: string }) {
  return (
    // Label on a wrapper: a role on the <dl> itself would hide the list semantics from assistive tech.
    <section aria-label={label} className="yx-hire-tiles__wrap">
    <dl className="yx-hire-tiles">
      {tiles.map((t) => (
        <div key={t.label} className="yx-hire-tiles__tile" data-tone={t.tone && t.tone !== 'default' ? t.tone : undefined}>
          <dt>{t.label}</dt>
          <dd>
            <span className="yx-hire-tiles__value">{t.value}</span>
            {t.sub && <span className="yx-hire-tiles__sub">{t.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
    </section>
  );
}

export interface Score {
  label: string;
  value: string;
  tone?: BadgeTone;
}

/** Scores on a pipeline card: assessment, AI interview (advisory), panel. */
export function ScoreChips({ scores }: { scores: Score[] }) {
  return (
    <span className="yx-hire-scores">
      {scores.map((s) => (
        <Badge key={s.label} tone={s.tone ?? 'neutral'}>
          {s.label} {s.value}
        </Badge>
      ))}
    </span>
  );
}

/** Rich pipeline card body (HIR-04, U81): role or source, scores and the next action. */
export function PipelineFacts({ scores, next, flags = [] }: { scores: Score[]; next: string; flags?: string[] }) {
  return (
    <span className="yx-hire-pfacts">
      {scores.length > 0 && <ScoreChips scores={scores} />}
      <span className="yx-hire-pfacts__next">Next: {next}</span>
      {flags.map((f) => (
        <Badge key={f} tone="warning">
          {f}
        </Badge>
      ))}
    </span>
  );
}

export type ConsentValue = 'opted-in' | 'opted-out' | 'none' | 'pending';
const CONSENT_TEXT: Record<ConsentValue, [BadgeTone, string]> = {
  'opted-in': ['success', 'opted in'],
  'opted-out': ['danger', 'opted out'],
  none: ['neutral', 'no consent'],
  pending: ['warning', 'pending consent'],
};

/** Consent status per channel (YX-ATS-20). */
export function ConsentBadges({ email, whatsapp }: { email: ConsentValue; whatsapp: ConsentValue }) {
  return (
    <span className="yx-hire-consent">
      <Badge tone={CONSENT_TEXT[email][0]}>
        <Icon icon={Mail} /> Email {CONSENT_TEXT[email][1]}
      </Badge>
      <Badge tone={CONSENT_TEXT[whatsapp][0]}>
        <Icon icon={MessageCircle} /> WhatsApp {CONSENT_TEXT[whatsapp][1]}
      </Badge>
    </span>
  );
}

/* ------------------------------------------------------------------ HIR-05 ex-employee banner */

export interface ExEmployeeInfo {
  exitDate: Date;
  exitType: string;
  rehireEligible: boolean;
  clearedBy?: string;
}

/** YX-ATS-33: recruiter / HR see exit date, type and rehire eligibility; the hiring manager sees only the flag and yes / no. */
export function ExEmployeeBanner({ info, viewer, onClear }: { info: ExEmployeeInfo; viewer: 'recruiter' | 'hr' | 'hm'; onClear?: () => void }) {
  const full = viewer !== 'hm';
  const ineligible = !info.rehireEligible && !info.clearedBy;
  return (
    <InlineAlert
      tone={ineligible ? 'warning' : 'info'}
      title={`Ex-employee · rehire eligible: ${info.rehireEligible ? 'yes' : info.clearedBy ? 'cleared by HR' : 'no'}`}
      actions={viewer === 'hr' && ineligible && onClear ? <Button size="sm" onClick={onClear}>Clear flag with reason</Button> : undefined}
    >
      {full ? (
        <>
          Left on {formatDate(info.exitDate)} ({info.exitType}).{' '}
          {ineligible ? 'Screening can’t be passed until HR clears the flag with a reason. Nothing is rejected automatically.' : info.clearedBy ? `Flag cleared by ${info.clearedBy}.` : 'The hire will continue on the existing employee record.'}
        </>
      ) : (
        'Past employee of Kaveri Foods. Details are visible to recruiters and HR.'
      )}
    </InlineAlert>
  );
}

/* ------------------------------------------------------------------ HIR-22 identity strip */

const ID_TEXT: Record<IdCheckpoint['result'], [BadgeTone, string]> = {
  match: ['success', 'Match'],
  mismatch: ['warning', 'Mismatch — review'],
  attested: ['info', 'Attested by interviewer'],
  're-verified': ['success', 'Re-verified'],
  'not-run': ['neutral', 'Not run'],
};

/** Capture point and match result per step, with deepfake / voice-clone signal. No template or ID image is ever shown. */
export function IdentityStrip({ points, onReverify, onReview, compact }: { points: IdCheckpoint[]; onReverify?: () => void; onReview?: () => void; compact?: boolean }) {
  const flagged = points.some((p) => p.result === 'mismatch' || p.deepfake === 'suspected');
  return (
    <section className="yx-hire-idstrip" aria-label="Identity checks" data-flagged={flagged || undefined} data-compact={compact || undefined}>
      <div className="yx-hire-idstrip__head">
        <Icon icon={flagged ? ShieldAlert : UserCheck} />
        <Text weight="semibold">{flagged ? 'Identity: review flag' : 'Identity checks'}</Text>
        <Text size="sm" tone="secondary">
          Flags are for human review. They never reject or move a candidate.
        </Text>
      </div>
      <ol className="yx-hire-idstrip__steps">
        {points.map((p, i) => (
          <li key={p.id} className="yx-hire-idstrip__step">
            <Text size="sm" tone="secondary">
              {i === 0 ? 'Capture' : `Check ${i}`} · {p.label}
            </Text>
            <Badge tone={ID_TEXT[p.result][0]}>{ID_TEXT[p.result][1]}</Badge>
            {p.deepfake && p.deepfake !== 'off' && (
              <Badge tone={p.deepfake === 'suspected' ? 'warning' : 'neutral'}>{p.deepfake === 'suspected' ? 'Synthetic video suspected' : 'Deepfake check clear'}</Badge>
            )}
            {p.at && (
              <Text size="xs" tone="muted">
                {formatDate(p.at)}
              </Text>
            )}
          </li>
        ))}
      </ol>
      {flagged && (onReverify || onReview) && (
        <div className="yx-hire-idstrip__actions">
          {onReview && <Button size="sm" onClick={onReview}>Open review</Button>}
          {onReverify && <Button size="sm" onClick={onReverify}>Request re-verification</Button>}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ HIR-03 job-board strip */

export interface Posting {
  board: string;
  status: 'live' | 'draft' | 'refreshed' | 'closed' | 'failed' | 'not posted';
  expires?: Date;
  applicants?: number;
  cost?: number;
  error?: string;
}
const POSTING_TONE: Record<Posting['status'], BadgeTone> = { live: 'success', refreshed: 'success', draft: 'neutral', closed: 'neutral', failed: 'danger', 'not posted': 'neutral' };

/** Board-by-board status strip with post, refresh and close (YX-ATS-23). */
export function PostingStrip({ postings, onAction }: { postings: Posting[]; onAction?: (board: string, action: 'post' | 'refresh' | 'close') => void }) {
  return (
    <ul className="yx-hire-postings" aria-label="Job-board postings">
      {postings.map((p) => (
        <li key={p.board} className="yx-hire-postings__item">
          <div className="yx-hire-postings__row">
            <Text weight="semibold">{p.board}</Text>
            <Badge tone={POSTING_TONE[p.status]}>{p.status[0].toUpperCase() + p.status.slice(1)}</Badge>
          </div>
          <Text size="sm" tone="secondary">
            {p.status === 'failed'
              ? p.error
              : [p.expires && `Expires ${formatDate(p.expires)}`, p.applicants != null && `${p.applicants} applicants`, p.cost != null && `${formatINR(p.cost)} cost`].filter(Boolean).join(' · ') || 'Company board account connected'}
          </Text>
          {onAction && (
            <div className="yx-hire-postings__actions">
              {p.status === 'live' || p.status === 'refreshed' ? (
                <>
                  <Button size="sm" onClick={() => onAction(p.board, 'refresh')}>Refresh</Button>
                  <Button size="sm" onClick={() => onAction(p.board, 'close')}>Close</Button>
                </>
              ) : p.status === 'closed' ? null : (
                <Button size="sm" onClick={() => onAction(p.board, 'post')}>{p.status === 'failed' ? 'Retry post' : 'Post'}</Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ HIR-31 e-invoice banner */

/** YX-ATS-44 / YX-PRJ-16: days since invoice date; warning from day 25, blocked after day 30. */
export function EInvoiceBanner({ invoiceDate, today, aboveThreshold = true, invoiceNo }: { invoiceDate: Date; today: Date; aboveThreshold?: boolean; invoiceNo: string }) {
  const w = eInvoiceWindow(invoiceDate, today, aboveThreshold);
  if (w.state === 'not-applicable')
    return (
      <InlineAlert tone="info" title="E-invoice not needed">
        This legal entity is below the e-invoice turnover threshold, so {invoiceNo} goes to the client without an IRN.
      </InlineAlert>
    );
  if (w.state === 'ok')
    return (
      <InlineAlert tone="info" title={`Day ${w.days} of 30 for IRN`}>
        Send {invoiceNo} for IRN within {30 - w.days} more days of its invoice date ({formatDate(invoiceDate)}).
      </InlineAlert>
    );
  if (w.state === 'warning')
    return (
      <InlineAlert tone="warning" title={`Day ${w.days} of 30: send for IRN soon`}>
        {invoiceNo} is dated {formatDate(invoiceDate)}. After day 30 the GSP won&rsquo;t accept it and you&rsquo;ll need to cancel and reissue it with today&rsquo;s date.
      </InlineAlert>
    );
  return (
    <InlineAlert tone="danger" title={`Day ${w.days}: IRN blocked`} actions={<Button size="sm">Cancel and reissue</Button>}>
      {invoiceNo} is more than 30 days old, so it can&rsquo;t be reported for IRN. Cancel it and issue a new invoice with today&rsquo;s date; the credit note links the two.
    </InlineAlert>
  );
}

/* ------------------------------------------------------------------ CTC breakup (HIR-09) */

export function CtcBreakupTable({ lines, caption = 'CTC breakup' }: { lines: CtcLine[]; caption?: string }) {
  const groups: [CtcLine['kind'], string][] = [
    ['earning', 'Earnings'],
    ['employer', 'Employer contributions'],
    ['variable', 'Variable'],
    ['one-time', 'One time'],
  ];
  const fixed = lines.filter((l) => l.kind === 'earning' || l.kind === 'employer').reduce((s, l) => s + l.annual, 0);
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
    <table className="yx-hire-ctc">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Component</th>
          <th scope="col">Monthly</th>
          <th scope="col">Annual</th>
        </tr>
      </thead>
      {groups.map(([kind, label]) => {
        const ls = lines.filter((l) => l.kind === kind);
        if (!ls.length) return null;
        return (
          <tbody key={kind}>
            <tr className="yx-hire-ctc__group">
              <th scope="rowgroup" colSpan={3}>
                {label}
              </th>
            </tr>
            {ls.map((l) => (
              <tr key={l.key}>
                <th scope="row">{l.label}</th>
                <td>{l.monthly ? formatINR(l.monthly) : '—'}</td>
                <td>{formatINR(l.annual)}</td>
              </tr>
            ))}
          </tbody>
        );
      })}
      <tfoot>
        <tr>
          <th scope="row">Fixed CTC</th>
          <td>{formatINR(Math.round(fixed / 12))}</td>
          <td>{formatINR(fixed)}</td>
        </tr>
      </tfoot>
    </table>
    </div>
  );
}

/* ------------------------------------------------------------------ media placeholder */

/** Placeholder for in-region recordings: silhouette plus state text (no external media). */
export function RecordingPlaceholder({ label, state }: { label: string; state: string }) {
  return (
    <figure className="yx-hire-video" aria-label={label}>
      <svg viewBox="0 0 160 90" role="img" aria-hidden="true" className="yx-hire-video__svg">
        <rect x="0" y="0" width="160" height="90" className="yx-hire-video__bg" />
        <circle cx="80" cy="36" r="14" className="yx-hire-video__fg" />
        <path d="M52 82c4-18 16-26 28-26s24 8 28 26z" className="yx-hire-video__fg" />
      </svg>
      <figcaption className="yx-hire-video__cap">
        <Icon icon={Video} /> {state}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ slot finder grid (HIR-06 / 27) */

/** Panel members' availability by half hour with proposed slots ranked. Unknown calendars say so in words. */
export function SlotGrid({ panel, from, to, slots, chosen, onChoose }: { panel: Panelist[]; from: number; to: number; slots: ProposedSlot[]; chosen?: number | null; onChoose?: (start: number) => void }) {
  const cols: number[] = [];
  for (let m = from; m < to; m += 30) cols.push(m);
  const cell = (p: Panelist, m: number) => {
    if (p.busy == null) return 'unknown';
    return p.busy.some((b) => m < b.end && m + 30 > b.start) ? 'busy' : 'free';
  };
  return (
    <div className="yx-hire-slots">
      <div className="yx-hire-slots__scroll" tabIndex={0} role="region" aria-label="Panel availability, scroll sideways">
        <table className="yx-hire-slots__grid">
          <caption className="yx-visually-hidden">Panel availability by half hour</caption>
          <thead>
            <tr>
              <th scope="col">Panel member</th>
              {cols.map((m) => (
                <th scope="col" key={m}>
                  {minutesToLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {panel.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  {p.name}
                  <Text size="xs" tone="secondary" as="div">
                    {p.required ? 'Required' : 'Optional'} · {p.busy == null ? 'availability unknown' : `${p.interviewsToday} interviews today`}
                  </Text>
                </th>
                {cols.map((m) => {
                  const c = cell(p, m);
                  return (
                    <td key={m} data-state={c}>
                      {c === 'busy' ? 'Busy' : c === 'unknown' ? <Icon icon={CircleHelp} label="Unknown" /> : 'Free'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="yx-hire-slots__proposed" aria-label="Proposed slots, best first">
        {slots.map((s, i) => (
          <li key={s.start} data-chosen={chosen === s.start || undefined}>
            <Text weight="semibold">
              {i + 1}. {minutesToLabel(s.start)} – {minutesToLabel(s.end)}
            </Text>
            <Text size="sm" tone="secondary">
              All required free · {s.optionalFree} optional free
            </Text>
            {onChoose && (
              <Button size="sm" onClick={() => onChoose(s.start)} aria-pressed={chosen === s.start}>
                {chosen === s.start ? 'Chosen' : 'Choose'}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ budget vs actual (PRJ-01) */

export interface BudgetRow {
  label: string;
  used: number;
  budget: number;
  money?: boolean;
  /** Hidden for this viewer (YX-PRJ-08). */
  hidden?: boolean;
}

export function BudgetBars({ rows }: { rows: BudgetRow[] }) {
  const fmt = (r: BudgetRow, n: number) => (r.money ? formatINR(n) : `${n.toLocaleString('en-IN')} h`);
  return (
    <ul className="yx-hire-budget">
      {rows.map((r) => (
        <li key={r.label} className="yx-hire-budget__row">
          <div className="yx-hire-budget__label">
            <Text weight="medium">{r.label}</Text>
            <Text size="sm" tone="secondary">
              {r.hidden ? 'Hidden: would reveal one person’s cost rate' : `${fmt(r, r.used)} of ${fmt(r, r.budget)}`}
            </Text>
          </div>
          {!r.hidden && <Meter value={r.used} max={r.budget} label={`${r.label} used`} />}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ misc */

export function StatusLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="yx-hire-statusline" data-ok={ok || undefined}>
      <Icon icon={ok ? CheckCircle2 : AlertTriangle} />
      {children}
    </span>
  );
}

/** Two-column section grid used inside tabs and T4 sheets. */
export function Columns({ children }: { children: ReactNode }) {
  return <div className="yx-hire-cols">{children}</div>;
}
