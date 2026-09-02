'use client';

// Shared v2 data table — the ONE table format for the product (zebra-polished TanStack v9). Owns the
// chrome: toolbar (search + optional extra controls + Export + Columns), sortable headers, zebra rows
// + hover, optional row-selection + bulk bar, optional collapsible row grouping, server or no
// pagination, and empty/loading/error. Owns sort / column-visibility / selection / group-expand state
// internally; surfaces supply columns, data, and server search/page.
import { Fragment, useState, type ReactNode } from 'react';
import {
  tableFeatures, useTable, createSortedRowModel, rowSortingFeature, rowSelectionFeature,
  columnVisibilityFeature, flexRender, type ColumnDef, type SortingState, type ColumnVisibilityState, type RowSelectionState, type RowData,
} from '@tanstack/react-table';
import { Search, ChevronsUpDown, ArrowUp, ArrowDown, SlidersHorizontal, Download, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Dropdown } from './Dropdown';

export const DT_FEATURES = tableFeatures({ rowSortingFeature, rowSelectionFeature, columnVisibilityFeature, sortedRowModel: createSortedRowModel() });

export const dt = {
  th: { textAlign: 'left', padding: '13px 12px 11px', whiteSpace: 'nowrap' } as React.CSSProperties,
  td: { padding: '11px 12px', fontSize: 13, color: 'var(--ink)', verticalAlign: 'middle' } as React.CSSProperties,
  // Canonical secondary button — white (paper) fill with a defined border so it clearly reads as a
  // clickable button, not a greyed-out/disabled one, on both grey list pages and white dialogs.
  toolBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' } as React.CSSProperties,
  iconBtn: { display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 9, border: '1px solid var(--org-primary)', background: 'var(--paper)', color: 'var(--org-primary)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(11,18,32,.08)' } as React.CSSProperties,
  // Canonical primary button — matches .v2-cta (the Button component) exactly.
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--org-primary)', color: 'var(--org-on-primary)', cursor: 'pointer' } as React.CSSProperties,
  muted: { color: 'var(--muted)' } as React.CSSProperties,
  // Selection bulk-action bar — light azure-tinted (not a heavy dark band).
  bulkBar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--org-primary) 8%, var(--surface))', border: '1px solid color-mix(in srgb, var(--org-primary) 22%, var(--hair))', color: 'var(--ink)', flexWrap: 'wrap' } as React.CSSProperties,
};

export function Cb({ checked, onChange, indeterminate = false }: { checked: boolean; onChange: (v: boolean) => void; indeterminate?: boolean }) {
  const on = checked || indeterminate;
  return (
    <span onClick={() => onChange(!checked)} style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${on ? 'var(--org-primary)' : '#cbd5e1'}`, background: on ? 'var(--org-primary)' : 'transparent', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
      {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M4 12.6 9 17.5 20 6.5" /></svg>}
      {!checked && indeterminate && <span style={{ width: 8, height: 2, background: '#fff', borderRadius: 1 }} />}
    </span>
  );
}

export function SortHead({ label, sorted, onClick }: { label: string; sorted: false | 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
      {label}{sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : <ChevronsUpDown size={12} style={{ opacity: 0.55 }} />}
    </button>
  );
}

export function Pill({ c, label }: { c: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}><i style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{label}</span>;
}

export interface DataTableProps<T extends RowData> {
  columns: ColumnDef<typeof DT_FEATURES, T>[];
  data: T[];
  getRowId: (row: T) => string;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  /** Hide the whole toolbar (search + Export + Columns) — for embedded/report tables. */
  hideToolbar?: boolean;
  /** Server pagination. Omit all three for an unpaginated list (shows every row provided). */
  page?: number;
  totalPages?: number;
  onPageChange?: (p: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  columnLabels?: Record<string, string>;
  onExport?: () => void;
  /** Extra toolbar controls rendered after the search box (e.g. Group By, a toggle). */
  toolbarExtra?: ReactNode;
  enableSelection?: boolean;
  renderBulkBar?: (selectedIds: string[], clearSelection: () => void) => ReactNode;
  /** Collapsible row grouping: return the group label(s) for a row (an array puts the row in each,
   *  e.g. multi-tag). Omit for a flat table. */
  groupOf?: (row: T) => string | string[];
  /** Orders the group sections. Default: first-appearance order. */
  groupSort?: (a: string, b: string) => number;
  /** Per-group meta shown next to the group label (e.g. "12 questions · 24 marks"). */
  groupMeta?: (label: string, rows: T[]) => ReactNode;
}

export function DataTable<T extends RowData>({
  columns, data, getRowId, search = '', onSearchChange, searchPlaceholder = 'Search…', hideToolbar = false,
  page, totalPages, onPageChange, isLoading, isError, errorMessage = 'Failed to load.',
  emptyMessage = 'Nothing found.', columnLabels = {}, onExport, toolbarExtra, enableSelection = false,
  renderBulkBar, groupOf, groupSort, groupMeta,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const grouping = Boolean(groupOf);

  const selectColumn: ColumnDef<typeof DT_FEATURES, T> = {
    id: 'select', enableSorting: false, enableHiding: false,
    // Grouped view uses per-group select-all in each group header instead of a global one.
    header: ({ table }) => grouping ? null : <Cb checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} onChange={(v) => table.toggleAllRowsSelected(v)} />,
    cell: ({ row }) => <Cb checked={row.getIsSelected()} onChange={(v) => row.toggleSelected(v)} />,
  };
  const allColumns = enableSelection ? [selectColumn, ...columns] : columns;

  const table = useTable({
    features: DT_FEATURES, data, columns: allColumns, getRowId,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting, onColumnVisibilityChange: setColumnVisibility, onRowSelectionChange: setRowSelection,
  });

  const selectedIds = enableSelection ? table.getSelectedRowModel().rows.map((r) => getRowId(r.original)) : [];
  const hideable = table.getAllColumns().filter((c) => c.getCanHide());
  const colCount = allColumns.length;
  const modelRows = table.getRowModel().rows;

  // Group the (already sorted) rows, preserving first-appearance order of each label.
  const groups: { label: string; rows: typeof modelRows }[] = [];
  if (grouping) {
    const idx = new Map<string, number>();
    for (const r of modelRows) {
      const raw = groupOf!(r.original);
      const labels = Array.isArray(raw) ? (raw.length ? raw : ['—']) : [raw || '—'];
      for (const label of labels) {
        let at = idx.get(label);
        if (at === undefined) { at = groups.length; idx.set(label, at); groups.push({ label, rows: [] }); }
        groups[at].rows.push(r);
      }
    }
    if (groupSort) groups.sort((a, b) => groupSort(a.label, b.label));
  }
  const toggleGroup = (label: string) => setExpanded((c) => { const n = new Set(c); if (n.has(label)) n.delete(label); else n.add(label); return n; });

  const cellStyle = (colId: string): React.CSSProperties => ({ ...dt.td, width: colId === 'select' ? 44 : colId === 'actions' ? 48 : undefined, textAlign: colId === 'actions' ? 'right' : 'left' });
  const renderRow = (row: typeof modelRows[number], zebra: number) => (
    <tr key={row.id} className="wf-trow" style={{ background: zebra % 2 ? 'color-mix(in srgb, var(--ink) 2.5%, transparent)' : 'transparent' }}>
      {row.getVisibleCells().map((cell) => <td key={cell.id} style={cellStyle(cell.column.id)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
    </tr>
  );

  return (
    <div>
      {/* Toolbar */}
      {!hideToolbar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input value={search} onChange={(e) => onSearchChange?.(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 30px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' }} />
          </div>
          {toolbarExtra}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
            {onExport && <button type="button" style={dt.toolBtn} onClick={onExport}><Download size={14} /> Export</button>}
            <Dropdown align="end" menuWidth={190} trigger={<span style={dt.toolBtn}><SlidersHorizontal size={14} /> Columns</span>}>
              {() => (
                <>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', padding: '4px 9px 6px' }}>Toggle columns</div>
                  {hideable.map((col) => (
                    <label key={col.id} className="wf-opt" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
                      <Cb checked={col.getIsVisible()} onChange={(v) => col.toggleVisibility(v)} />
                      {columnLabels[col.id] ?? col.id}
                    </label>
                  ))}
                </>
              )}
            </Dropdown>
          </span>
        </div>
      )}

      {enableSelection && selectedIds.length > 0 && renderBulkBar?.(selectedIds, () => table.resetRowSelection())}

      {/* Table */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} style={{ background: 'color-mix(in srgb, var(--ink) 3%, transparent)', borderBottom: '1px solid var(--hair)' }}>
                  {hg.headers.map((header) => (
                    <th key={header.id} style={{ ...dt.th, width: header.column.id === 'select' ? 44 : header.column.id === 'actions' ? 48 : undefined }}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={colCount} style={{ ...dt.td, textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</td></tr>
              ) : isError ? (
                <tr><td colSpan={colCount} style={{ ...dt.td, textAlign: 'center', color: 'var(--danger)', padding: '32px 0' }}>{errorMessage}</td></tr>
              ) : modelRows.length === 0 ? (
                <tr><td colSpan={colCount} style={{ ...dt.td, textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>{emptyMessage}</td></tr>
              ) : grouping ? (
                groups.map((g) => {
                  const open = expanded.has(g.label);
                  const groupRows = g.rows.map((r) => r.original);
                  const allSel = enableSelection && g.rows.length > 0 && g.rows.every((r) => r.getIsSelected());
                  const someSel = enableSelection && g.rows.some((r) => r.getIsSelected());
                  return (
                    <Fragment key={g.label}>
                      <tr style={{ background: 'color-mix(in srgb, var(--ink) 4%, transparent)', borderBottom: '1px solid var(--hair)' }}>
                        <td colSpan={colCount} style={{ padding: '9px 12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            {enableSelection && <Cb checked={allSel} indeterminate={someSel && !allSel} onChange={(v) => g.rows.forEach((r) => r.toggleSelected(v))} />}
                            <button type="button" onClick={() => toggleGroup(g.label)} aria-expanded={open} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink)' }}>
                              <ChevronDown size={15} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', color: 'var(--muted)' }} />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{groupMeta ? groupMeta(g.label, groupRows) : `${g.rows.length}`}</span>
                            </button>
                          </span>
                        </td>
                      </tr>
                      {open && g.rows.map((row, i) => renderRow(row, i))}
                    </Fragment>
                  );
                })
              ) : (
                modelRows.map((row, i) => renderRow(row, i))
              )}
            </tbody>
          </table>
        </div>
        {page !== undefined && onPageChange && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--muted)' }}>
            <span>Page {page} of {totalPages ?? 1}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <button type="button" style={{ ...dt.iconBtn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }} disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}><ChevronLeft size={15} /></button>
              <button type="button" style={{ ...dt.iconBtn, opacity: page >= (totalPages ?? 1) ? 0.4 : 1, cursor: page >= (totalPages ?? 1) ? 'not-allowed' : 'pointer' }} disabled={page >= (totalPages ?? 1)} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
