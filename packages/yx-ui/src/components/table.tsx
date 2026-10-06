import {
  Fragment,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  EyeOff,
  ListTree,
  MoreHorizontal,
  Rows3,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { formatDate, formatINR, groupIndian } from '../lib/format';
import { groupRows, sortRows, toCsv, total as computeTotal, type SortState, type TotalKind } from '../lib/table';
import { Icon } from './foundations';
import { Button, IconButton } from './button';
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu';
import { Checkbox } from './choice';
import { Badge, PersonLabel, type BadgeTone } from './display';
import { CurrencyField, NumberField, TextField } from './inputs';
import { EmptyState, ErrorState, Pagination, Skeleton } from './feedback';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type ColumnType = 'text' | 'number' | 'money' | 'date' | 'person' | 'status' | 'id';

export interface TableColumn<R> {
  key: string;
  header: string;
  /** Drives alignment and formatting (§20): numbers and money right-aligned, IDs mono, people as avatar + name, status as a badge. */
  type?: ColumnType;
  /** Raw value used to sort, group, total and export. */
  value: (row: R) => unknown;
  /** Custom cell. Defaults to formatting by `type`. */
  render?: (row: R) => ReactNode;
  /** For type "person". */
  person?: (row: R) => { name: string; src?: string | null; secondary?: ReactNode };
  /** For type "status": which badge colour a value gets (§3 meanings). */
  statusTone?: (value: unknown, row: R) => BadgeTone;
  /** Initial width in px. */
  width?: number;
  sortable?: boolean;
  /** Adds a total row entry and group subtotals. */
  total?: TotalKind;
  /** Hidden automatically when the table can't fit its width, instead of scrolling sideways; shown again when there's room (founder review 1 Oct 2026). */
  optional?: boolean;
  /** Default true. The first column can never be hidden. */
  hideable?: boolean;
  groupable?: boolean;
  /** Inline edit (§14, §20). The table calls onCellEdit; the app saves and updates rows. */
  editable?: 'text' | 'number' | 'money';
}

export interface ColumnState {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

export interface DataTableProps<R> {
  /** Accessible name, e.g. "Employees". */
  label: string;
  columns: TableColumn<R>[];
  rows: R[];
  getRowId: (row: R) => string;
  state?: 'ready' | 'loading' | 'error';
  errorTitle?: string;
  errorReference?: string;
  onRetry?: () => void;
  /** First-use empty state (§26). */
  empty?: ReactNode;
  /** True when filters or search are active: empty shows "No results for these filters". */
  filtered?: boolean;
  onClearFilters?: () => void;

  selectable?: boolean;
  /**
   * Per row: true, or the reason it can't be selected ("Over the weekly cap"); its checkbox is then disabled with that
   * tooltip. false = not selectable with no reason shown (the row's own status badge already says why).
   */
  isSelectable?: (row: R) => boolean | string;
  selectedIds?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Buttons for the bulk bar. Text buttons only as secondary or danger (§15). */
  bulkActions?: (ids: string[]) => ReactNode;

  /** <MenuItem>s for the row's "More actions" menu. Return null (or nothing) for a row with no actions: it then has no "…" button. */
  rowActions?: (row: R) => ReactNode;
  /** Noun for the totals row, e.g. ['policy', 'policies'] → "Total · 3 policies" (default row / rows). */
  rowNoun?: [string, string];
  /** One or two bordered small buttons shown in the row, e.g. Approve (§14). */
  rowButtons?: (row: R) => ReactNode;
  /** Opens the quick-view drawer (§18, §20). */
  onRowClick?: (row: R) => void;
  /** Highlights the row whose drawer is open. */
  activeRowId?: string | null;

  defaultSort?: SortState | null;
  /** Controlled sort for server-side lists. When set, rows are shown in the order given. */
  sort?: SortState | null;
  onSortChange?: (s: SortState | null) => void;

  defaultGroupBy?: string | null;
  defaultColumnState?: Partial<ColumnState>;
  onColumnStateChange?: (s: ColumnState) => void;

  /** Client-side pagination. Omit to show all rows (use `virtual` for thousands). */
  pageSize?: number;
  /** Render only visible rows; for up to ~10,000 rows (§20). Needs `height`. */
  virtual?: boolean;
  /** Max height of the scroll area in px; header and first column stay frozen. */
  height?: number;

  onCellEdit?: (row: R, key: string, value: unknown) => void;
  /** Left side of the toolbar: usually <FilterBar>. */
  toolbar?: ReactNode;
  /** Right side, before the table controls: usually <SavedViewMenu>. */
  views?: ReactNode;
  /** Export respecting P02 field classes is done by the server; the table passes the visible columns. */
  onExport?: (format: 'csv' | 'xlsx', visibleKeys: string[]) => void;
  /**
   * Phone cards: two lines per row, the primary cell (with the "…" menu beside it) and then the other short cells on one
   * line joined by " · " ("Thu 15 Jan 2026 · Holiday · Past"), instead of one label / value line each.
   */
  cardSummary?: boolean;
}

const SELECT_W = 40;
const ACTIONS_W = 48;
/** Columns without a set width never shrink below this; the table scrolls sideways instead of hiding a column. */
const FLEX_MIN_W = 160;
/** Columns may shrink to this share of their set width before the table scrolls sideways. */
const MIN_FIT = 0.8;
/** Below this width the table shows each row as a card (primary cell, then label and value pairs) instead of a clipped table (R4). */
const CARDS_BELOW = 600;
/** A person column (avatar + name) never shrinks below this while other columns have room. */
const PERSON_MIN_W = 200;

/** True when a node would render something: not null, false, '' or an empty fragment / array. */
function hasContent(n: ReactNode): boolean {
  if (n == null || n === false || n === true || n === '') return false;
  if (Array.isArray(n)) return n.some(hasContent);
  if (isValidElement(n) && n.type === Fragment) return hasContent((n.props as { children?: ReactNode }).children);
  return true;
}

function cellText<R>(c: TableColumn<R>, row: R): string {
  const v = c.value(row);
  if (v == null) return '';
  switch (c.type) {
    case 'money':
      return typeof v === 'number' ? formatINR(v) : String(v);
    case 'number':
      return typeof v === 'number' ? groupIndian(v) : String(v);
    case 'date':
      return v instanceof Date ? formatDate(v) : String(v);
    case 'person':
      return c.person?.(row).name ?? String(v);
    default:
      return String(v);
  }
}

/** CSV of the visible columns as displayed; for small client-side lists. */
export function tableToCsv<R>(rows: R[], columns: TableColumn<R>[]): string {
  return toCsv(
    columns.map((c) => c.header),
    rows.map((r) => columns.map((c) => cellText(c, r))),
  );
}

function formatTotal(kind: TotalKind, type: ColumnType | undefined, n: number) {
  if (kind === 'count') return groupIndian(n);
  return type === 'money' ? formatINR(n) : groupIndian(n);
}

function Cell<R>({ c, row }: { c: TableColumn<R>; row: R }) {
  if (c.render) return <>{c.render(row)}</>;
  const v = c.value(row);
  if (v == null || v === '') return <span className="yx-table__none">—</span>;
  switch (c.type) {
    case 'person': {
      const p = c.person?.(row) ?? { name: String(v) };
      return <PersonLabel name={p.name} src={p.src} secondary={p.secondary} />;
    }
    case 'status':
      return <Badge tone={c.statusTone?.(v, row) ?? 'neutral'}>{String(v)}</Badge>;
    case 'id':
      return <span className="yx-mono">{String(v)}</span>;
    default:
      return <>{cellText(c, row)}</>;
  }
}

function EditCell<R>({ c, row, onCommit, onCancel }: { c: TableColumn<R>; row: R; onCommit: (v: unknown) => void; onCancel: () => void }) {
  const initial = c.value(row);
  const [text, setText] = useState(initial == null ? '' : String(initial));
  const [num, setNum] = useState<number | null>(typeof initial === 'number' ? initial : null);
  const keys = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') onCommit(c.editable === 'text' ? text : num);
  };
  const common = { size: 'sm' as const, autoFocus: true, onKeyDown: keys, 'aria-label': c.header };
  if (c.editable === 'money') return <CurrencyField {...common} value={num} onChange={setNum} onBlur={() => onCommit(num)} />;
  if (c.editable === 'number') return <NumberField {...common} value={num} onChange={setNum} onBlur={() => onCommit(num)} />;
  return <TextField {...common} value={text} onChange={setText} onBlur={() => onCommit(text)} />;
}

type Item<R> = { kind: 'group'; key: string; label: string; rows: R[] } | { kind: 'row'; row: R; id: string };

/**
 * The list view for every object (§20): sort, filter bar slot, saved views slot, columns (show / hide / reorder / resize),
 * frozen header and first column, selection + bulk bar, inline edit, group by, totals, density, pagination or virtual
 * scroll, export, empty / loading / error states, row click → drawer, keyboard (J / K, arrows, Enter, Space).
 */
export function DataTable<R>(props: DataTableProps<R>) {
  const {
    label,
    columns,
    rows,
    getRowId,
    state: stateProp = 'ready',
    errorTitle = "We couldn't load this list.",
    errorReference,
    onRetry: onRetryProp,
    empty,
    filtered,
    onClearFilters,
    selectable,
    isSelectable,
    selectedIds,
    onSelectedChange,
    bulkActions,
    rowActions,
    rowNoun = ['row', 'rows'],
    rowButtons,
    onRowClick,
    activeRowId,
    defaultSort = null,
    sort: sortProp,
    onSortChange,
    defaultGroupBy = null,
    defaultColumnState,
    onColumnStateChange,
    pageSize: initialPageSize,
    virtual,
    height,
    onCellEdit,
    toolbar,
    views,
    onExport,
    cardSummary,
  } = props;

  // ---- error retry: "Try again" always does something visible (loading, then the list), and calls onRetry when given ----
  const [retry, setRetry] = useState<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => {
    if (retry !== 'loading') return;
    const t = setTimeout(() => setRetry('done'), 1200);
    return () => clearTimeout(t);
  }, [retry]);
  const state: 'ready' | 'loading' | 'error' = stateProp === 'error' && retry !== 'idle' ? (retry === 'loading' ? 'loading' : 'ready') : stateProp;
  const onRetry = () => {
    setRetry('loading');
    onRetryProp?.();
  };

  // ---- column state ----
  const [colState, setColState] = useState<ColumnState>(() => ({
    order: defaultColumnState?.order ?? columns.map((c) => c.key),
    hidden: defaultColumnState?.hidden ?? [],
    widths: defaultColumnState?.widths ?? Object.fromEntries(columns.filter((c) => c.width).map((c) => [c.key, c.width!])),
  }));
  const updateCols = (fn: (s: ColumnState) => ColumnState) =>
    setColState((s) => {
      const n = fn(s);
      onColumnStateChange?.(n);
      return n;
    });
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const ordered = useMemo(() => {
    const keys = [...colState.order.filter((k) => byKey.has(k)), ...columns.map((c) => c.key).filter((k) => !colState.order.includes(k))];
    return keys.map((k) => byKey.get(k)!);
  }, [colState.order, byKey, columns]);
  const firstKey = ordered[0]?.key;
  const shownByUser = ordered.filter((c) => c.key === firstKey || !colState.hidden.includes(c.key));
  // Optional columns hidden to fit the width (see the fit effect below).
  const [autoHidden, setAutoHidden] = useState<string[]>([]);
  const visible = shownByUser.filter((c) => !autoHidden.includes(c.key));

  // ---- sort / group / page ----
  const [sortInner, setSortInner] = useState<SortState | null>(defaultSort);
  const sort = sortProp !== undefined ? sortProp : sortInner;
  const setSort = (s: SortState | null) => {
    if (sortProp === undefined) setSortInner(s);
    onSortChange?.(s);
  };
  const [groupBy, setGroupBy] = useState<string | null>(defaultGroupBy);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<'comfortable' | 'compact' | undefined>(undefined);

  const sorted = useMemo(() => {
    if (!sort || sortProp !== undefined) return rows;
    const c = byKey.get(sort.key);
    return c ? sortRows(rows, c.value, sort.dir) : rows;
  }, [rows, sort, sortProp, byKey]);

  useEffect(() => setPage(1), [rows, pageSize, groupBy]);
  // Grouped lists show every row (groups collapse instead of paging) so subtotals are never partial.
  const paged = Boolean(pageSize && !groupBy);
  const pages = paged ? Math.max(1, Math.ceil(sorted.length / pageSize!)) : 1;
  const pageRows = paged ? sorted.slice((page - 1) * pageSize!, page * pageSize!) : sorted;

  const items: Item<R>[] = useMemo(() => {
    const gc = groupBy ? byKey.get(groupBy) : undefined;
    if (!gc) return pageRows.map((row) => ({ kind: 'row' as const, row, id: getRowId(row) }));
    const out: Item<R>[] = [];
    for (const g of groupRows(pageRows, (r) => (gc.type === 'person' ? gc.person?.(r).name : gc.value(r)))) {
      out.push({ kind: 'group', key: g.key, label: gc.type === 'date' && g.rows[0] ? cellText(gc, g.rows[0]) : g.label, rows: g.rows });
      if (!collapsed.has(g.key)) for (const row of g.rows) out.push({ kind: 'row', row, id: getRowId(row) });
    }
    return out;
  }, [pageRows, groupBy, byKey, collapsed, getRowId]);

  // ---- selection ----
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const setSelected = (ids: Iterable<string>) => onSelectedChange?.([...new Set(ids)]);
  /** Why a row can't be selected, or undefined when it can. */
  const blockedReason = (row: R) => {
    const r = isSelectable?.(row);
    return typeof r === 'string' ? r : undefined;
  };
  /** The row can't be selected (with or without a reason to show). */
  const isBlocked = (row: R) => {
    const r = isSelectable?.(row);
    return r === false || typeof r === 'string';
  };
  // Select-all and "page" checks count only rows that can be selected.
  const pageIds = pageRows.filter((r) => !isBlocked(r)).map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  // ---- keyboard ----
  const rowItems = items.filter((i): i is Extract<Item<R>, { kind: 'row' }> => i.kind === 'row');
  const [focusIdx, setFocusIdx] = useState(0);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const focusRow = (i: number) => {
    const n = Math.max(0, Math.min(rowItems.length - 1, i));
    setFocusIdx(n);
    const find = () => bodyRef.current?.querySelector<HTMLElement>(`[data-row-index="${n}"]`);
    const el = find();
    if (el) el.focus();
    else requestAnimationFrame(() => find()?.focus()); // virtual rows render on the next frame
  };
  const onBodyKey = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    if ((e.target as HTMLElement).tagName !== 'TR') return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'j') focusRow(focusIdx + 1);
    else if (k === 'ArrowUp' || k === 'k') focusRow(focusIdx - 1);
    else if (k === 'Home') focusRow(0);
    else if (k === 'End') focusRow(rowItems.length - 1);
    else if (k === 'Enter' && onRowClick && rowItems[focusIdx]) onRowClick(rowItems[focusIdx].row);
    else if ((k === ' ' || k === 'x') && selectable && rowItems[focusIdx] && !isBlocked(rowItems[focusIdx].row)) toggle(rowItems[focusIdx].id);
    else return;
    e.preventDefault();
  };

  // ---- editing ----
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);

  // ---- virtual scroll ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(40);
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const v = parseFloat(getComputedStyle(scrollRef.current).getPropertyValue('--yx-row-height'));
    if (v) setRowH(v);
  }, [density]);
  // Measured width of the scroll box (see the fit effect below); narrow tables become cards.
  const [boxW, setBoxW] = useState(0);
  const cards = boxW > 0 && boxW < CARDS_BELOW;
  const doVirtual = Boolean(virtual && height && !paged && items.length > 60 && !cards);
  const overscan = 8;
  const start = doVirtual ? Math.max(0, Math.floor(scrollTop / rowH) - overscan) : 0;
  const end = doVirtual ? Math.min(items.length, Math.ceil((scrollTop + height!) / rowH) + overscan) : items.length;
  const windowItems = items.slice(start, end);

  // ---- resize ----
  // Like a spreadsheet (founder review 30 Sep 2026): on the first resize every column keeps its current width and only
  // the dragged one changes, 1:1 with the pointer. Otherwise the fixed-layout table re-shares the space and the column
  // seems to move the wrong way.
  const frozenWidths = (th: HTMLElement) => {
    const out: Record<string, number> = {};
    th.closest('tr')!
      .querySelectorAll<HTMLElement>('th[data-col]')
      .forEach((h) => {
        out[h.dataset.col!] = Math.round(h.getBoundingClientRect().width);
      });
    return out;
  };
  const [resized, setResized] = useState(false);
  const startResize = (key: string, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResized(true);
    const th = (e.currentTarget as HTMLElement).closest('th')!;
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    const base = frozenWidths(th);
    const move = (ev: PointerEvent) => {
      const w = Math.max(64, Math.round(startW + ev.clientX - startX));
      updateCols((s) => ({ ...s, widths: { ...s.widths, ...base, [key]: w } }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const keyResize = (key: string, e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const th = (e.currentTarget as HTMLElement).closest('th')!;
    const w = Math.max(64, Math.round(th.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16)));
    const base = frozenWidths(th);
    setResized(true);
    updateCols((s) => ({ ...s, widths: { ...s.widths, ...base, [key]: w } }));
  };

  const totals = visible.some((c) => c.total);
  const groupable = columns.filter((c) => c.groupable);
  // No button column when no row has a button (e.g. a "Completed" tab) (founder review 30 Sep 2026).
  const hasActions = Boolean((rowActions && rows.some((r) => hasContent(rowActions(r)))) || (rowButtons && rows.some((r) => rowButtons(r) != null)));
  const colCount = visible.length + (selectable ? 1 : 0) + (hasActions ? 1 : 0);
  const firstLeft = selectable ? SELECT_W : 0;

  const alignOf = (c: TableColumn<R>) => (c.type === 'number' || c.type === 'money' ? 'end' : undefined);
  const stickyStyle = (c: TableColumn<R>) => (c.key === firstKey ? { left: firstLeft } : undefined);

  const selCount = selected.size;
  // Column and density settings only when there is something to thin: a table (not cards) with rows and columns that can hide.
  // A small fixed table, the empty state and phone cards get no settings, and then no toolbar band at all.
  // A short table (under 8 rows) with nothing hidden and no toolbar of its own gets none either, and none while loading or failed.
  const someHidden = colState.hidden.length > 0 || autoHidden.length > 0;
  const colTools =
    !cards && state === 'ready' && rows.length > 0 && (someHidden || (columns.some((c) => c.optional) && (rows.length >= 8 || hasContent(toolbar))));
  // Phone cards have no header row, so "Select all" moves into the toolbar.
  const cardSelectAll = cards && selectable && pageIds.length > 0 && state === 'ready';
  const showToolbar =
    selCount > 0 || cardSelectAll || hasContent(toolbar) || hasContent(views) || !!onExport || colTools || (groupable.length > 0 && !cards);

  const toolbarRight = (
    <div className="yx-table__controls">
      {views}
      {groupable.length > 0 && !cards && (
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" icon={ListTree}>
              {groupBy ? `Grouped by ${byKey.get(groupBy)?.header}` : 'Group'}
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>Group rows by</MenuLabel>
            <MenuCheckboxItem checked={!groupBy} onCheckedChange={() => setGroupBy(null)}>
              No grouping
            </MenuCheckboxItem>
            {groupable.map((c) => (
              <MenuCheckboxItem key={c.key} checked={groupBy === c.key} onCheckedChange={() => setGroupBy(c.key)}>
                {c.header}
              </MenuCheckboxItem>
            ))}
          </MenuContent>
        </Menu>
      )}
      {/* Cards show every field and have no rows to thin, so the column and density controls only show as a table. */}
      {colTools && (
        <ColumnManager columns={ordered} defaultOrder={columns.map((c) => c.key)} firstKey={firstKey} state={colState} autoHidden={autoHidden} onChange={(s) => updateCols(() => s)} />
      )}
      {colTools && <Menu>
        <MenuTrigger asChild>
          <IconButton icon={Rows3} label="Row density" variant="secondary" size="sm" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuLabel>Row density</MenuLabel>
          <MenuCheckboxItem checked={density !== 'compact'} onCheckedChange={() => setDensity('comfortable')}>
            Comfortable
          </MenuCheckboxItem>
          <MenuCheckboxItem checked={density === 'compact'} onCheckedChange={() => setDensity('compact')}>
            Compact
          </MenuCheckboxItem>
        </MenuContent>
      </Menu>}
      {onExport && (
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" icon={Download} disabled={state !== 'ready' || rows.length === 0}>
              Export
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => onExport('csv', visible.map((c) => c.key))}>CSV (visible columns)</MenuItem>
            <MenuItem onSelect={() => onExport('xlsx', visible.map((c) => c.key))}>Excel (visible columns)</MenuItem>
          </MenuContent>
        </Menu>
      )}
    </div>
  );

  const renderRow = (it: Extract<Item<R>, { kind: 'row' }>, rowIndex: number) => {
    const { row, id } = it;
    const isSel = selected.has(id);
    const blocked = isBlocked(row);
    const reason = blockedReason(row);
    const menu = rowActions?.(row);
    const menuButton = hasContent(menu) && (
      <Menu>
        <MenuTrigger asChild>
          <IconButton icon={MoreHorizontal} label={`More actions for ${cellText(visible[0], row)}`} size="sm" noTooltip />
        </MenuTrigger>
        <MenuContent align="end">{menu}</MenuContent>
      </Menu>
    );
    const rowBtns = rowButtons?.(row);
    // Phone cards: the checkbox sits inline with the primary cell (or, when the row can't be picked, the reason as
    // muted text, since phones have no hover); a lone "…" menu sits on the same line, at the end.
    const inlineMenu = cards && !hasContent(rowBtns) && hasContent(menu);
    const select = (
      <Checkbox aria-label={reason ? `${cellText(visible[0], row)}: ${reason}` : `Select ${cellText(visible[0], row)}`} checked={isSel && !blocked} disabled={blocked} onChange={() => toggle(id)} />
    );
    return (
      <tr
        key={id}
        data-row-index={rowIndex}
        tabIndex={rowIndex === focusIdx ? 0 : -1}
        data-active={activeRowId === id || undefined}
        data-clickable={onRowClick ? true : undefined}
        onFocus={() => setFocusIdx(rowIndex)}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, input, [role="checkbox"], [data-no-row-click]')) return;
          onRowClick?.(row);
        }}
      >
        {selectable && !cards && (
          <td className="yx-table__select" data-no-row-click title={reason}>
            {select}
          </td>
        )}
        {visible.map((c) => {
          const isEditing = editing?.id === id && editing.key === c.key;
          const primary = c.key === firstKey;
          return (
            <td key={c.key} data-label={c.header} data-type={c.type} data-align={alignOf(c)} data-frozen={primary || undefined} style={stickyStyle(c)}>
              {cards && primary && selectable && !blocked && <span className="yx-table__card-select" data-no-row-click>{select}</span>}
              {isEditing ? (
                <EditCell
                  c={c}
                  row={row}
                  onCancel={() => setEditing(null)}
                  onCommit={(v) => {
                    setEditing(null);
                    if (v !== c.value(row)) onCellEdit?.(row, c.key, v);
                  }}
                />
              ) : c.editable && onCellEdit ? (
                <button
                  type="button"
                  className="yx-table__editable"
                  data-align={alignOf(c)}
                  aria-label={`Edit ${c.header}: ${cellText(c, row) || 'empty'}`}
                  data-empty={cellText(c, row) === '' || undefined}
                  data-placeholder={`Add ${c.header.toLowerCase()}`}
                  onClick={() => setEditing({ id, key: c.key })}
                >
                  {cellText(c, row) !== '' && <Cell c={c} row={row} />}
                </button>
              ) : (
                <Cell c={c} row={row} />
              )}
              {cards && primary && selectable && reason && <span className="yx-table__card-reason">{reason}</span>}
              {primary && inlineMenu && <span className="yx-table__card-menu" data-no-row-click>{menuButton}</span>}
            </td>
          );
        })}
        {hasActions && !inlineMenu && (
          <td className="yx-table__actions" data-no-row-click>
            <div className="yx-table__actions-inner">
              {rowBtns}
              {menuButton}
            </div>
          </td>
        )}
      </tr>
    );
  };

  let rowCounter = rowItems.indexOf(windowItems.find((i) => i.kind === 'row') as never);
  if (rowCounter < 0) rowCounter = 0;

  const body = (() => {
    if (state === 'loading')
      return Array.from({ length: 6 }, (_, i) => (
        <tr key={`sk${i}`} aria-hidden="true">
          {selectable && <td className="yx-table__select" />}
          {visible.map((c) => (
            <td key={c.key} data-align={alignOf(c)}>
              <Skeleton width={c.type === 'money' || c.type === 'number' ? '60%' : `${55 + ((i * 7 + c.key.length * 5) % 35)}%`} />
            </td>
          ))}
          {hasActions && <td />}
        </tr>
      ));
    if (state === 'error')
      return (
        <tr>
          <td colSpan={colCount} className="yx-table__message">
            <ErrorState title={errorTitle} description="Check your connection and try again." onRetry={onRetry} reference={errorReference} />
          </td>
        </tr>
      );
    if (rows.length === 0)
      return (
        <tr>
          <td colSpan={colCount} className="yx-table__message">
            {filtered ? (
              <EmptyState
                compact
                title="No results for these filters"
                description="Try removing a filter or searching for something else."
                action={onClearFilters && <Button onClick={onClearFilters}>Clear filters</Button>}
              />
            ) : (
              empty ?? <EmptyState compact title="Nothing here yet" />
            )}
          </td>
        </tr>
      );
    const out: ReactNode[] = [];
    if (doVirtual && start > 0) out.push(<tr key="pad-top" aria-hidden="true" style={{ height: start * rowH }} />);
    for (const it of windowItems) {
      if (it.kind === 'group') {
        const open = !collapsed.has(it.key);
        out.push(
          <tr key={`g-${it.key}`} className="yx-table__group">
            {selectable && (
              <td className="yx-table__select">
                <Checkbox
                  aria-label={`Select all in ${it.label}`}
                  checked={it.rows.every((r) => selected.has(getRowId(r))) ? true : it.rows.some((r) => selected.has(getRowId(r))) ? 'indeterminate' : false}
                  onChange={(c) => {
                    const n = new Set(selected);
                    it.rows.filter((r) => !isBlocked(r)).forEach((r) => (c ? n.add(getRowId(r)) : n.delete(getRowId(r))));
                    setSelected(n);
                  }}
                />
              </td>
            )}
            {visible.map((c, i) => (
              <td key={c.key} data-align={alignOf(c)} data-frozen={i === 0 || undefined} style={i === 0 ? stickyStyle(c) : undefined}>
                {i === 0 ? (
                  <button
                    type="button"
                    className="yx-table__group-toggle"
                    aria-expanded={open}
                    onClick={() => {
                      const n = new Set(collapsed);
                      if (open) n.add(it.key);
                      else n.delete(it.key);
                      setCollapsed(n);
                    }}
                  >
                    <Icon icon={open ? ChevronDown : ChevronRight} />
                    <span className="yx-table__group-label">{it.label}</span>
                    <span className="yx-table__group-count">{it.rows.length}</span>
                  </button>
                ) : c.total ? (
                  formatTotal(c.total, c.type, computeTotal(it.rows, c.value, c.total))
                ) : null}
              </td>
            ))}
            {hasActions && <td />}
          </tr>,
        );
      } else {
        out.push(renderRow(it, rowCounter++));
      }
    }
    if (doVirtual && end < items.length) out.push(<tr key="pad-bot" aria-hidden="true" style={{ height: (items.length - end) * rowH }} />);
    return out;
  })();

  // Row buttons: size the sticky action column to its widest row, so buttons never spill over other columns
  // (founder review 30 Sep 2026). +18 = cell padding on both sides and its border.
  const tableRef = useRef<HTMLDivElement>(null);
  const [actionsW, setActionsW] = useState<number | undefined>(undefined);
  // Every text row button takes the width of the widest one, so "Convert" and "Create employee" line up (founder review 1 Oct 2026).
  const [btnW, setBtnW] = useState<number | undefined>(undefined);
  // Measure again once web fonts have loaded: the first pass may use a narrower fallback font.
  const [, setFontsTick] = useState(0);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontsTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (!rowButtons || !tableRef.current) return;
    let widest = 0;
    let widestBtn = 0;
    // The buttons' own widths plus gaps, so the figure is the same whether or not the row is wrapping them.
    tableRef.current.querySelectorAll<HTMLElement>('.yx-table__actions-inner').forEach((n) => {
      const kids = Array.from(n.children) as HTMLElement[];
      const gap = parseFloat(getComputedStyle(n).columnGap) || 0;
      const sum = kids.reduce((t, k) => t + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1);
      widest = Math.max(widest, sum || n.scrollWidth);
    });
    tableRef.current.querySelectorAll<HTMLElement>('.yx-table__actions-inner > .yx-button:not([data-icon-only])').forEach((b) => {
      widestBtn = Math.max(widestBtn, b.getBoundingClientRect().width);
    });
    // The inner row is max-content wide, so this is the buttons' own width and the effect settles after one pass.
    const w = widest ? Math.ceil(widest) + 18 : undefined;
    if (w && Math.abs(w - (actionsW ?? 0)) > 1) setActionsW(w);
    if (widestBtn && Math.ceil(widestBtn) !== btnW) setBtnW(Math.ceil(widestBtn));
  });

  // Before scrolling sideways, columns give up to a fifth of their set width, so a table only scrolls when it truly can't fit
  // (founder review 1 Oct 2026). Widths a person has dragged are theirs and never shrink.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // At tablet widths the row buttons give way first: their column is capped at a third of the table and the buttons
  // wrap, so required columns (claims, status) are never squeezed to nothing.
  const actionsCap = boxW && !cards ? Math.floor(boxW / 3) : undefined;
  const actionsCapped = !!(actionsW && actionsCap && actionsW > actionsCap);
  const actW = actionsCapped ? actionsCap : actionsW;
  const fixedW = (selectable ? SELECT_W : 0) + (hasActions ? (rowButtons ? actW ?? 0 : ACTIONS_W) : 0);
  // Amounts are never cut off: a money or totalled column is at least as wide as its widest figure (the footer total
  // included) and its header (Pay review, Oct 2026). ponytail: estimated from character count, measure if fonts change.
  const figureW = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of columns) {
      if (c.type !== 'money' && !c.total) continue;
      let chars = c.total ? formatTotal(c.total, c.type, computeTotal(rows, c.value, c.total)).length : 0;
      for (const r of rows) chars = Math.max(chars, cellText(c, r).length);
      out[c.key] = Math.max(chars * 9 + 32, c.header.length * 8 + 56);
    }
    return out;
  }, [columns, rows]);
  const minW = (c: TableColumn<R>) => Math.max(c.type === 'person' ? PERSON_MIN_W : FLEX_MIN_W, figureW[c.key] ?? 0);
  // Still too wide after shrinking? Hide optional columns from the right until it fits; a table scrolls only when nothing optional is left.
  useLayoutEffect(() => {
    const want: string[] = [];
    // Phone cards leave out optional columns, so a card stays two or three short lines (R10).
    if (cards) for (const c of shownByUser) if (c.optional && c.key !== firstKey) want.push(c.key);
    if (!resized && boxW && !cards) {
      // The narrowest a column can go: a fifth off its width, but never below its widest figure.
      const least = (c: TableColumn<R>) => Math.max((Number(colState.widths[c.key]) || minW(c)) * MIN_FIT, figureW[c.key] ?? 0);
      let total = shownByUser.reduce((t, c) => t + least(c), 0);
      // First columns marked optional, then any plain text column from the right. Never the first column, a status, a number,
      // an amount, a total or an editable one: those carry the facts people decide on (Time review, Oct 2026).
      const plain = (c: TableColumn<R>) =>
        !c.optional && c.hideable !== false && c.type !== 'status' && c.type !== 'number' && c.type !== 'money' && !c.total && !c.editable;
      for (const pick of [(c: TableColumn<R>) => !!c.optional, plain]) {
        for (const c of [...shownByUser].reverse()) {
          if (total <= boxW - fixedW) break;
          if (c.key === firstKey || want.includes(c.key) || !pick(c)) continue;
          want.push(c.key);
          total -= least(c);
        }
      }
    }
    if (want.join() !== autoHidden.join()) setAutoHidden(want);
  });
  const widthOf = (c: TableColumn<R>) => Number(colState.widths[c.key]) || minW(c);
  const dataW = visible.reduce((t, c) => t + widthOf(c), 0);
  // Shrink to fit; columns that would drop below their widest figure stay at it and the others share what is left.
  let fit = resized || !boxW || cards ? 1 : Math.min(1, Math.max(MIN_FIT, (boxW - fixedW) / dataW));
  if (fit < 1 && !resized) {
    const locked = visible.filter((c) => widthOf(c) * fit < (figureW[c.key] ?? 0));
    const rest = dataW - locked.reduce((t, c) => t + widthOf(c), 0);
    if (locked.length && rest > 0) fit = Math.min(1, Math.max(MIN_FIT, (boxW - fixedW - locked.reduce((t, c) => t + figureW[c.key], 0)) / rest));
  }
  const fitW = (c: TableColumn<R>) => Math.max(Math.floor(widthOf(c) * fit), resized ? 0 : figureW[c.key] ?? 0);
  const colW = (key: string) => (colState.widths[key] ? fitW(byKey.get(key)!) : undefined);

  return (
    <div
      className="yx-table"
      data-density={density}
      data-layout={cards ? 'cards' : undefined}
      data-card-summary={(cards && cardSummary) || undefined}
      data-actions-wrap={actionsCapped || undefined}
      ref={tableRef}
      style={btnW ? ({ '--yx-row-btn-w': `${btnW}px` } as CSSProperties) : undefined}
    >
      {showToolbar && <div className="yx-table__toolbar">
        {cardSelectAll && selCount === 0 && (
          <Checkbox
            label="Select all"
            checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
            onChange={(c) => {
              const n = new Set(selected);
              pageIds.forEach((pid) => (c ? n.add(pid) : n.delete(pid)));
              setSelected(n);
            }}
          />
        )}
        {selCount > 0 ? (
          <div className="yx-table__bulk" role="region" aria-label="Bulk actions">
            <span className="yx-table__bulk-count" aria-live="polite">
              {groupIndian(selCount)} selected
            </span>
            {paged && allOnPage && selCount < rows.length && (
              <Button size="sm" onClick={() => setSelected(rows.filter((r) => !isBlocked(r)).map(getRowId))}>
                Select all {groupIndian(rows.length)}
              </Button>
            )}
            {bulkActions?.([...selected])}
            <Button size="sm" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
        ) : (
          <div className="yx-table__toolbar-left">{toolbar}</div>
        )}
        {toolbarRight}
      </div>}
      <div
        ref={scrollRef}
        className="yx-table__scroll"
        style={height ? { maxHeight: height } : undefined}
        onScroll={doVirtual ? (e) => setScrollTop((e.target as HTMLElement).scrollTop) : undefined}
      >
        <table
          aria-label={label}
          aria-busy={state === 'loading' || undefined}
          // Once the person has resized columns, every width is theirs: the table is exactly that wide, no re-sharing.
          style={cards ? undefined : resized ? { width: fixedW + dataW, minWidth: fixedW + dataW } : { minWidth: fixedW + visible.reduce((t, c) => t + fitW(c), 0) }}
        >
          <colgroup>
            {selectable && <col style={{ width: SELECT_W }} />}
            {visible.map((c) => (
              <col key={c.key} style={colW(c.key) ? { width: colW(c.key) } : c.type === 'person' && !cards ? { width: PERSON_MIN_W } : undefined} />
            ))}
            {hasActions && <col style={{ width: rowButtons ? actW : ACTIONS_W }} />}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th className="yx-table__select" scope="col">
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                    onChange={(c) => {
                      const n = new Set(selected);
                      pageIds.forEach((id) => (c ? n.add(id) : n.delete(id)));
                      setSelected(n);
                    }}
                    disabled={state !== 'ready' || rows.length === 0}
                  />
                </th>
              )}
              {visible.map((c) => {
                const active = sort?.key === c.key ? sort.dir : null;
                const canSort = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    data-col={c.key}
                    data-align={alignOf(c)}
                    data-frozen={c.key === firstKey || undefined}
                    style={stickyStyle(c)}
                    aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}
                  >
                    <div className="yx-table__th">
                      {canSort ? (
                        <button
                          type="button"
                          className="yx-table__sort"
                          onClick={() => setSort(active === 'asc' ? { key: c.key, dir: 'desc' } : active === 'desc' ? null : { key: c.key, dir: 'asc' })}
                        >
                          <span>{c.header}</span>
                          <Icon icon={active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown} />
                        </button>
                      ) : (
                        <span className="yx-table__sort">{c.header}</span>
                      )}
                      <Menu>
                        <MenuTrigger asChild>
                          <button type="button" className="yx-table__col-menu" aria-label={`${c.header} column options`}>
                            <Icon icon={ChevronDown} />
                          </button>
                        </MenuTrigger>
                        <MenuContent align="start">
                          {canSort && (
                            <>
                              <MenuItem icon={ArrowUp} onSelect={() => setSort({ key: c.key, dir: 'asc' })}>
                                {c.type === 'number' || c.type === 'money' ? 'Smallest first' : c.type === 'date' ? 'Oldest first' : 'A to Z'}
                              </MenuItem>
                              <MenuItem icon={ArrowDown} onSelect={() => setSort({ key: c.key, dir: 'desc' })}>
                                {c.type === 'number' || c.type === 'money' ? 'Largest first' : c.type === 'date' ? 'Newest first' : 'Z to A'}
                              </MenuItem>
                            </>
                          )}
                          {c.groupable && (
                            <MenuItem icon={ListTree} onSelect={() => setGroupBy(c.key)}>
                              Group by {c.header}
                            </MenuItem>
                          )}
                          {c.key !== firstKey && c.hideable !== false && (
                            <>
                              <MenuSeparator />
                              <MenuItem icon={EyeOff} onSelect={() => updateCols((s) => ({ ...s, hidden: [...s.hidden, c.key] }))}>
                                Hide column
                              </MenuItem>
                            </>
                          )}
                        </MenuContent>
                      </Menu>
                    </div>
                    <span
                      className="yx-table__resize"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c.header}`}
                      aria-valuenow={colState.widths[c.key] ?? c.width ?? 160}
                      aria-valuemin={64}
                      aria-valuemax={960}
                      aria-valuetext={`${colState.widths[c.key] ?? c.width ?? 160} pixels wide`}
                      tabIndex={0}
                      onPointerDown={(e) => startResize(c.key, e)}
                      onKeyDown={(e) => keyResize(c.key, e)}
                    />
                  </th>
                );
              })}
              {hasActions && (
                <th className="yx-table__actions" scope="col">
                  <span className="yx-visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody ref={bodyRef} onKeyDown={onBodyKey}>
            {body}
          </tbody>
          {/* A total of one row only repeats it, so the footer starts at two rows. */}
          {totals && state === 'ready' && rows.length > 1 && (
            <tfoot>
              <tr>
                {selectable && <td className="yx-table__select" />}
                {visible.map((c, i) => (
                  <td key={c.key} data-label={i === 0 ? undefined : c.header} data-align={alignOf(c)} data-frozen={i === 0 || undefined} style={i === 0 ? stickyStyle(c) : undefined}>
                    {i === 0 ? `Total · ${groupIndian(rows.length)} ${rows.length === 1 ? rowNoun[0] : rowNoun[1]}` : c.total ? formatTotal(c.total, c.type, computeTotal(rows, c.value, c.total)) : null}
                  </td>
                ))}
                {hasActions && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {paged && state === 'ready' && rows.length > 0 && (
        <div className="yx-table__foot">
          <Pagination page={Math.min(page, pages)} pageSize={pageSize!} total={rows.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}
    </div>
  );
}

/** Show / hide and reorder columns (§20). The first column always stays. */
export function ColumnManager<R>({
  columns,
  defaultOrder,
  firstKey,
  state,
  autoHidden = [],
  onChange,
}: {
  columns: TableColumn<R>[];
  /** Order to restore on "Reset columns". */
  defaultOrder: string[];
  firstKey?: string;
  state: ColumnState;
  /** Optional columns the table hid to fit its width. */
  autoHidden?: string[];
  onChange: (s: ColumnState) => void;
}) {
  const order = columns.map((c) => c.key);
  const move = (key: string, delta: number) => {
    const i = order.indexOf(key);
    const j = i + delta;
    if (j < 1 || j >= order.length) return; // first column stays first
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    onChange({ ...state, order: n });
  };
  const hiddenCount = new Set([...state.hidden.filter((k) => k !== firstKey), ...autoHidden]).size;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" icon={Columns3}>
          Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="yx-colmgr" aria-label="Columns">
        <p className="yx-colmgr__title">Show and order columns</p>
        <ul className="yx-colmgr__list">
          {columns.map((c, i) => {
            const locked = c.key === firstKey || c.hideable === false;
            return (
              <li key={c.key} className="yx-colmgr__item">
                <Checkbox
                  label={c.header}
                  description={autoHidden.includes(c.key) && !state.hidden.includes(c.key) ? 'Hidden to fit; widen the window to see it' : undefined}
                  checked={!state.hidden.includes(c.key) || c.key === firstKey}
                  disabled={locked}
                  onChange={(on) => onChange({ ...state, hidden: on ? state.hidden.filter((k) => k !== c.key) : [...state.hidden, c.key] })}
                />
                <span className="yx-colmgr__move">
                  <IconButton icon={ArrowUp} label={`Move ${c.header} up`} size="sm" noTooltip disabled={i <= 1} onClick={() => move(c.key, -1)} />
                  <IconButton icon={ArrowDown} label={`Move ${c.header} down`} size="sm" noTooltip disabled={i === 0 || i === columns.length - 1} onClick={() => move(c.key, 1)} />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="yx-filter-editor__foot">
          <Button size="sm" onClick={() => onChange({ order: defaultOrder, hidden: [], widths: {} })}>
            Reset columns
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
