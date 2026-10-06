// Platform & shared screens kit (APX-D §2.1). Reusable pieces + pure logic for PLT-01…32.
import { SETTINGS_GROUPS as SETTINGS_MAP } from '../settings/settings-groups';
import { settingsPanel as mapPanel } from '../settings/settings-screens';
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef, type SavedView } from '../../components/filters';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { isFilterActive, matchesFilter, type FilterValue } from '../../lib/table';
import { formatDate } from '../../lib/format';
import { daysBetween, isWeekend, addDays, findHoliday, type Holiday } from '../../lib/dates';
import type { BadgeTone } from '../../components/display';
import type { PanelSection } from '../_kit/frames';
import './platform.css';

/* ---------------------------------------------------------------- Panels (APX-D §1.1, §3) */

/** Global panel under the Home rail item: Home · Approvals · Notifications · Search · My requests · Me. */
/** Approvals waiting (yours + delegated to you): the same number on Home, this panel and the Approvals page. */
export const APPROVALS_WAITING = 8;

export function homePanel(active: string, approvals = APPROVALS_WAITING): PanelSection[] {
  const mk = (label: string, count?: number) => ({ label, count, active: label === active });
  return [
    { items: [mk('Home'), mk('Approvals', approvals || undefined), mk('Notifications', 3), mk('Search'), mk('My requests')] },
    { label: 'Me', items: [mk('Profile'), mk('Documents & letters'), mk('Delegation'), mk('Notification preferences'), mk('My data')] },
  ];
}


/**
 * Settings panel for platform screens: built from the real settings map (71 pages), collapsed to the open group
 * (founder review 30 Sep 2026). `activePage` may be an older label such as "2.3 Approvals"; it is matched by title.
 */
export function settingsPanel(activePage?: string): PanelSection[] {
  if (!activePage) return mapPanel(SETTINGS_MAP, undefined, true);
  const title = activePage.replace(/^\d+\.\d+ /, '').toLowerCase();
  const pages = SETTINGS_MAP.flatMap((g) => g.pages);
  const first = title.split(/[\s,&]+/)[0];
  const hit = pages.find((p) => p.title.toLowerCase() === title) ?? pages.find((p) => p.title.toLowerCase().includes(first));
  return mapPanel(SETTINGS_MAP, hit?.id);
}

/* ---------------------------------------------------------------- Layout pieces */

export function Tile({ title, badge, tone, selected, children, actions }: { title?: ReactNode; badge?: ReactNode; tone?: 'warning' | 'danger' | 'success'; selected?: boolean; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="yx-plt-tile" data-tone={tone} data-selected={selected || undefined}>
      {(title || badge) && (
        <div className="yx-plt-tile__head">
          {title && <h3 className="yx-plt-tile__title">{title}</h3>}
          {badge}
        </div>
      )}
      {children}
      {actions && <div className="yx-plt-row">{actions}</div>}
    </section>
  );
}

/** T3 record workspace body: main column and the right activity rail. */
export function Workspace({ children, aside, asideLabel = 'Activity' }: { children: ReactNode; aside: ReactNode; asideLabel?: string }) {
  return (
    <div className="yx-plt-workspace">
      <div className="yx-plt-stack">{children}</div>
      <aside className="yx-plt-workspace__aside" aria-label={asideLabel}>
        {aside}
      </aside>
    </div>
  );
}

export interface DiffRow {
  field: string;
  before: ReactNode;
  after: ReactNode;
  /** Reader lacks the field class: shows "changed" without values (P08 B5). */
  masked?: boolean;
}

/** Before → after table (audit log, packages, rule versions). */
export function DiffTable({ rows, caption }: { rows: DiffRow[]; caption: string }) {
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
    <table className="yx-plt-diff">
      <caption className="yx-visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Before</th>
          <th scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.field}>
            <th scope="row">{r.field}</th>
            {r.masked ? (
              <td colSpan={2} className="yx-plt-diff__masked">
                Changed. You don't have access to this field's values.
              </td>
            ) : (
              <>
                <td className="yx-plt-diff__old">{r.before ?? 'Empty'}</td>
                <td className="yx-plt-diff__new">{r.after ?? 'Empty'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/* ---------------------------------------------------------------- T2 list page */

export interface ListTab {
  id: string;
  label: string;
  count?: number;
}

export interface ListPageProps<R> {
  title: string;
  description?: ReactNode;
  facts?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  /** Banners, stat cards, anything above the table. */
  above?: ReactNode;
  tabs?: ListTab[];
  tab?: string;
  onTabChange?: (id: string) => void;
  label: string;
  columns: TableColumn<R>[];
  rows: R[];
  getRowId: (r: R) => string;
  filters?: FilterFieldDef[];
  defaultFilters?: FilterValue[];
  searchPlaceholder?: string;
  defaultSearch?: string;
  views?: SavedView[];
  state?: 'ready' | 'loading' | 'error';
  empty?: ReactNode;
  selectable?: boolean;
  defaultSelected?: string[];
  bulkActions?: (ids: string[]) => ReactNode;
  rowButtons?: (r: R) => ReactNode;
  rowActions?: (r: R) => ReactNode;
  onRowClick?: (r: R) => void;
  activeRowId?: string | null;
  pageSize?: number;
  onExport?: boolean;
  /** Drawers / dialogs opened from the list. */
  children?: ReactNode;
}

/** Filters rows client-side: each active filter matches the column of the same key; search matches any column text. */
export function filterRows<R>(rows: R[], columns: TableColumn<R>[], filters: FilterValue[], search: string): R[] {
  const q = search.trim().toLowerCase();
  const active = filters.filter(isFilterActive);
  return rows.filter((r) => {
    for (const f of active) {
      const col = columns.find((c) => c.key === f.key);
      if (col && !matchesFilter(col.value(r), f)) return false;
    }
    if (!q) return true;
    return columns.some((c) => {
      const v = c.value(r);
      const text = v instanceof Date ? formatDate(v) : c.person ? c.person(r).name : String(v ?? '');
      return text.toLowerCase().includes(q);
    });
  });
}

export function ListPage<R>(p: ListPageProps<R>) {
  const [filters, setFilters] = useState<FilterValue[]>(p.defaultFilters ?? []);
  const [search, setSearch] = useState(p.defaultSearch ?? '');
  const [view, setView] = useState(p.views?.[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>(p.defaultSelected ?? []);
  const rows = useMemo(() => filterRows(p.rows, p.columns, filters, search), [p.rows, p.columns, filters, search]);
  const filtered = filters.some(isFilterActive) || search.trim() !== '';

  const table = (
      <DataTable
        label={p.label}
        columns={p.columns}
        rows={rows}
        getRowId={p.getRowId}
        state={p.state}
        empty={p.empty}
        filtered={filtered}
        onClearFilters={() => {
          setFilters([]);
          setSearch('');
        }}
        selectable={p.selectable}
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={p.bulkActions}
        rowButtons={p.rowButtons}
        rowActions={p.rowActions}
        onRowClick={p.onRowClick}
        activeRowId={p.activeRowId}
        pageSize={p.pageSize}
        onRetry={p.state === 'error' ? () => {} : undefined}
        errorReference={p.state === 'error' ? 'REQ-7F3A-2291' : undefined}
        onExport={p.onExport ? () => {} : undefined}
        toolbar={
          p.filters ? (
            <FilterBar fields={p.filters} value={filters} onChange={setFilters} search={search} onSearchChange={setSearch} searchPlaceholder={p.searchPlaceholder} />
          ) : undefined
        }
        views={p.views ? <SavedViewMenu views={p.views} currentId={view} onSelect={setView} modified={filtered} onSave={() => {}} onSaveAs={() => {}} /> : undefined}
      />
  );

  return (
    <>
      <PageHeader title={p.title} description={p.description} facts={p.facts} status={p.status} actions={p.actions} />
      {p.above}
      {p.tabs ? (
        // Each trigger controls a real TabsContent panel (aria-controls must resolve).
        <Tabs value={p.tab} onValueChange={p.onTabChange}>
          <TabsList aria-label={`${p.title} views`}>
            {p.tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} count={t.count}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {p.tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} forceMount hidden={t.id !== p.tab}>
              {t.id === p.tab && table}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        table
      )}
      {p.children}
    </>
  );
}

/* ---------------------------------------------------------------- Status tones */

const TONES: Record<string, BadgeTone> = {
  Approved: 'success', Active: 'success', Healthy: 'success', Delivered: 'success', Connected: 'success', Verified: 'success', Done: 'success', Live: 'success', Closed: 'success', Promoted: 'success', Signed: 'success', Customised: 'info',
  Pending: 'warning', 'In review': 'warning', Waiting: 'warning', Degraded: 'warning', Retrying: 'warning', Draft: 'neutral', Starter: 'neutral', Scheduled: 'info', Requested: 'info', 'Sent back': 'warning', 'Due soon': 'warning', 'Awaiting approval': 'warning',
  Rejected: 'danger', Failed: 'danger', Overdue: 'danger', Revoked: 'danger', Expired: 'neutral', Withdrawn: 'neutral', Cancelled: 'neutral', Disabled: 'neutral', Archived: 'neutral', Ended: 'neutral', Broken: 'danger',
};
export const toneFor = (status: unknown): BadgeTone => TONES[String(status)] ?? 'neutral';

/* ---------------------------------------------------------------- Pure logic (tested) */

/** Leave days in a range, skipping weekends and holidays (PLT-05 live summary). Half day counts 0.5. */
export function leaveDays(from: Date | null, to: Date | null, holidays: Holiday[] = [], halfDay = false): number {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const d = addDays(from, i);
    if (!isWeekend(d) && !findHoliday(holidays, d)) n++;
  }
  return halfDay && n > 0 ? n - 0.5 : n;
}

export interface LeaveEffect {
  days: number;
  balanceAfter: number;
  overLimit: boolean;
  /** Frozen attendance period (P08): request affects next pay. */
  lateForPeriod: boolean;
  message: string | null;
}

/** Effect summary for a leave request: balance after, over-limit block, locked-period notice (P03 §4.5, P08 §7). */
export function leaveEffect(opts: { balance: number; from: Date | null; to: Date | null; halfDay?: boolean; holidays?: Holiday[]; lockedBefore?: Date }): LeaveEffect {
  const days = leaveDays(opts.from, opts.to, opts.holidays, opts.halfDay);
  const balanceAfter = opts.balance - days;
  const overLimit = balanceAfter < 0;
  const lateForPeriod = Boolean(opts.from && opts.lockedBefore && opts.from < opts.lockedBefore);
  const message = overLimit
    ? `You have ${opts.balance} days left. Shorten the dates or choose unpaid leave for the extra ${-balanceAfter} days.`
    : lateForPeriod
      ? "This date's attendance is closed. Your request will affect October pay."
      : null;
  return { days, balanceAfter, overLimit, lateForPeriod, message };
}

/** Delegation form checks (P03 §4.4, YX-WF-07). Returns field → error. */
export function validateDelegation(v: { from: Date | null; to: Date | null; delegateId: string | null; meId: string; delegateDelegatesTo?: string | null; today: Date }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.from) e.from = 'Enter the first day you are away.';
  if (!v.to) e.to = 'Enter the last day you are away.';
  if (v.from && v.to && v.to < v.from) e.to = 'The last day must be on or after the first day.';
  if (v.to && daysBetween(v.today, v.to) < 0) e.to = 'Choose a last day today or later.';
  if (!v.delegateId) e.delegate = 'Choose who approves for you.';
  else if (v.delegateId === v.meId) e.delegate = "You can't delegate to yourself. Choose another person.";
  else if (v.delegateDelegatesTo) e.delegate = 'This person is away and has delegated too. Delegation never chains, so choose someone else.';
  return e;
}

/** Only low-risk items of one type may be bulk approved (P03 §4.5, APX-D §6.4). */
export function bulkApprovable<T extends { id: string; type: string; lowRisk?: boolean }>(items: T[], ids: string[]): { ok: boolean; reason?: string } {
  const picked = items.filter((i) => ids.includes(i.id));
  if (picked.length === 0) return { ok: false, reason: 'Select at least one request.' };
  if (picked.some((i) => !i.lowRisk)) return { ok: false, reason: 'Only low-risk requests can be approved together. Open the others one by one.' };
  if (new Set(picked.map((i) => i.type)).size > 1) return { ok: false, reason: 'Bulk approve works for one request type at a time.' };
  return { ok: true };
}

export type SearchPrefix = '@' | '#' | '>' | '?' | null;
/** Command-palette prefixes (P17 §4.1): @ people, # references, > actions, ? help & settings. */
export function parseQuery(raw: string): { prefix: SearchPrefix; term: string } {
  const t = raw.trimStart();
  const c = t.charAt(0);
  if (c === '@' || c === '#' || c === '>' || c === '?') return { prefix: c, term: t.slice(1).trim() };
  return { prefix: null, term: t.trim() };
}

export interface PolicyDef {
  id: string;
  name: string;
  priority: number;
  isDefault?: boolean;
  /** Plain conditions: every one must hold. */
  when: { field: string; op: 'gt' | 'gte' | 'lt' | 'eq' | 'in'; value: number | string | string[] }[];
}

/** Simulate: evaluate policies in priority order; first match wins; the catch-all default always matches (YX-WF-01/03). */
export function simulatePolicy(policies: PolicyDef[], sample: Record<string, number | string>): PolicyDef | null {
  const ordered = [...policies].filter((p) => !p.isDefault).sort((a, b) => a.priority - b.priority);
  const hit = ordered.find((p) =>
    p.when.every((c) => {
      const v = sample[c.field];
      switch (c.op) {
        case 'gt': return Number(v) > Number(c.value);
        case 'gte': return Number(v) >= Number(c.value);
        case 'lt': return Number(v) < Number(c.value);
        case 'eq': return String(v) === String(c.value);
        case 'in': return Array.isArray(c.value) && c.value.includes(String(v));
      }
    }),
  );
  return hit ?? policies.find((p) => p.isDefault) ?? null;
}

/** Separation-of-duties risk check for a role (P02 §4.6). */
export const SOD_PAIRS: [string, string, string][] = [
  ['payroll.run.prepare', 'payroll.run.approve', 'Prepare and approve the same payroll run'],
  ['bank.file.create', 'bank.file.release', 'Create and release a bank file'],
  ['employee.bank.edit', 'payroll.run.approve', 'Change bank details and approve payroll'],
  ['role.manage', 'audit.delete', 'Manage roles and change audit settings'],
];
export function sodConflicts(perms: string[]): string[] {
  return SOD_PAIRS.filter(([a, b]) => perms.includes(a) && perms.includes(b)).map(([, , why]) => why);
}

export interface ReadinessCheck {
  id: string;
  blocking: boolean;
  done: boolean;
}
/** Go-live readiness: score = done / all; ready only when no blocking check is open (APX-E G1). */
export function readiness(checks: ReadinessCheck[]): { score: number; ready: boolean; blockingOpen: number } {
  const done = checks.filter((c) => c.done).length;
  const blockingOpen = checks.filter((c) => c.blocking && !c.done).length;
  return { score: checks.length ? Math.round((done / checks.length) * 100) : 0, ready: blockingOpen === 0, blockingOpen };
}

export interface ScopedRule {
  id: string;
  name: string;
  point: string;
  /** Scope chips, most specific wins: employee > group > grade > department > location > entity > tenant. */
  scope: { level: 'tenant' | 'entity' | 'location' | 'department' | 'grade' | 'group' | 'employee'; values: string[] };
  priority: number;
}
const LEVEL_RANK = { tenant: 0, entity: 1, location: 2, department: 3, grade: 4, group: 5, employee: 6 };

/** Overlaps (same point, same level, shared values) and unreachable rules (fully covered by a higher-priority rule at the same level) (YX-RULE-09). */
export function ruleWarnings(rules: ScopedRule[]): { overlaps: [string, string][]; unreachable: string[] } {
  const overlaps: [string, string][] = [];
  const unreachable = new Set<string>();
  for (let i = 0; i < rules.length; i++)
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (a.point !== b.point || a.scope.level !== b.scope.level) continue;
      const shared = a.scope.values.filter((v) => b.scope.values.includes(v));
      if (!shared.length) continue;
      overlaps.push([a.id, b.id]);
      const [hi, lo] = a.priority <= b.priority ? [a, b] : [b, a];
      if (lo.scope.values.every((v) => hi.scope.values.includes(v))) unreachable.add(lo.id);
    }
  return { overlaps, unreachable: [...unreachable] };
}
export const scopeRank = (r: ScopedRule) => LEVEL_RANK[r.scope.level];

/** SLA clock text for DSAR and support windows. */
export function slaText(due: Date, now: Date): { text: string; tone: BadgeTone } {
  const d = daysBetween(now, due);
  if (d < 0) return { text: `Overdue by ${-d} day${d === -1 ? '' : 's'}`, tone: 'danger' };
  if (d === 0) return { text: 'Due today', tone: 'warning' };
  if (d <= 3) return { text: `${d} day${d === 1 ? '' : 's'} left`, tone: 'warning' };
  return { text: `${d} days left`, tone: 'neutral' };
}
