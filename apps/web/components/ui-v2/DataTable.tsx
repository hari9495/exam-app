'use client';

// Shared v2 data table — the ONE table format for the product (zebra-polished TanStack v9). Owns the
// chrome: toolbar (search + Export + Columns), sortable headers, zebra rows + hover, optional row
// selection + bulk bar, server pagination, and empty/loading/error states. Owns sort / column-
// visibility / selection state internally; surfaces supply columns, data, and server search/page.
import { useState, type ReactNode } from 'react';
import {
  tableFeatures, useTable, createSortedRowModel, rowSortingFeature, rowSelectionFeature,
  columnVisibilityFeature, flexRender, type ColumnDef, type SortingState, type ColumnVisibilityState, type RowSelectionState, type RowData,
} from '@tanstack/react-table';
import { Search, ChevronsUpDown, ArrowUp, ArrowDown, SlidersHorizontal, Download, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Dropdown } from './Dropdown';

export const DT_FEATURES = tableFeatures({ rowSortingFeature, rowSelectionFeature, columnVisibilityFeature, sortedRowModel: createSortedRowModel() });

// Shared cell/toolbar styles so surface-rendered cells stay consistent with the table chrome.
export const dt = {
  th: { textAlign: 'left', padding: '13px 12px 11px', whiteSpace: 'nowrap' } as React.CSSProperties,
  td: { padding: '11px 12px', fontSize: 13, color: 'var(--ink)', verticalAlign: 'middle' } as React.CSSProperties,
  toolBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' } as React.CSSProperties,
  iconBtn: { display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' } as React.CSSProperties,
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: 'none', background: 'var(--org-primary)', color: 'var(--org-on-primary)', cursor: 'pointer' } as React.CSSProperties,
  muted: { color: 'var(--muted)' } as React.CSSProperties,
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
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  columnLabels?: Record<string, string>;
  onExport?: () => void;
  enableSelection?: boolean;
  /** Rendered above the table when rows are selected. */
  renderBulkBar?: (selectedIds: string[], clearSelection: () => void) => ReactNode;
}

export function DataTable<T extends RowData>({
  columns, data, getRowId, search, onSearchChange, searchPlaceholder = 'Search…',
  page, totalPages, onPageChange, isLoading, isError, errorMessage = 'Failed to load.',
  emptyMessage = 'Nothing found.', columnLabels = {}, onExport, enableSelection = false, renderBulkBar,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectColumn: ColumnDef<typeof DT_FEATURES, T> = {
    id: 'select', enableSorting: false, enableHiding: false,
    header: ({ table }) => <Cb checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} onChange={(v) => table.toggleAllRowsSelected(v)} />,
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

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 30px', fontSize: 13, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>
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

      {/* Bulk bar */}
      {enableSelection && selectedIds.length > 0 && renderBulkBar?.(selectedIds, () => table.resetRowSelection())}

      {/* Table */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
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
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={colCount} style={{ ...dt.td, textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>{emptyMessage}</td></tr>
              ) : table.getRowModel().rows.map((row, i) => (
                <tr key={row.id} className="wf-trow" style={{ background: i % 2 ? 'color-mix(in srgb, var(--ink) 2.5%, transparent)' : 'transparent' }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ ...dt.td, width: cell.column.id === 'select' ? 44 : cell.column.id === 'actions' ? 48 : undefined, textAlign: cell.column.id === 'actions' ? 'right' : 'left' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--muted)' }}>
          <span>Page {page} of {totalPages}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button type="button" style={{ ...dt.iconBtn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }} disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}><ChevronLeft size={15} /></button>
            <button type="button" style={{ ...dt.iconBtn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button>
          </span>
        </div>
      </div>
    </div>
  );
}
