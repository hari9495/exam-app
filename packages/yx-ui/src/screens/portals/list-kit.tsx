// T2 list helper for console and partner screens: FilterBar + saved views + DataTable with bulk actions and row drawer.
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu, type FilterFieldDef, type SavedView } from '../../components/filters';
import { matchesFilter, type FilterValue } from '../../lib/table';

export interface FilteredTableProps<R> {
  label: string;
  rows: R[];
  columns: TableColumn<R>[];
  getRowId: (r: R) => string;
  fields: FilterFieldDef[];
  /** Text the search box matches. */
  searchText: (r: R) => string;
  searchPlaceholder?: string;
  views?: SavedView[];
  /** Each saved view is a set of filters. */
  viewFilters?: Record<string, FilterValue[]>;
  defaultView?: string;
  defaultFilters?: FilterValue[];
  state?: 'ready' | 'loading' | 'error';
  empty?: ReactNode;
  bulkActions?: (ids: string[]) => ReactNode;
  rowButtons?: (r: R) => ReactNode;
  rowActions?: (r: R) => ReactNode;
  /** Renders the quick-view drawer for the open row. */
  drawer?: (row: R, close: () => void) => ReactNode;
  defaultOpenId?: string;
  pageSize?: number;
  selectable?: boolean;
  defaultSelected?: string[];
}

export function FilteredTable<R>({
  label,
  rows,
  columns,
  getRowId,
  fields,
  searchText,
  searchPlaceholder = 'Search',
  views,
  viewFilters = {},
  defaultView,
  defaultFilters = [],
  state = 'ready',
  empty,
  bulkActions,
  rowButtons,
  rowActions,
  drawer,
  defaultOpenId,
  pageSize = 25,
  selectable = !!bulkActions,
  defaultSelected = [],
}: FilteredTableProps<R>) {
  const [view, setView] = useState(defaultView ?? views?.[0]?.id ?? '');
  const [filters, setFilters] = useState<FilterValue[]>(defaultFilters.length ? defaultFilters : viewFilters[view] ?? []);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (r) => (!s || searchText(r).toLowerCase().includes(s)) && filters.every((f) => matchesFilter((r as unknown as Record<string, unknown>)[f.key], f)),
    );
  }, [rows, filters, q, searchText]);
  const open = openId ? rows.find((r) => getRowId(r) === openId) ?? null : null;
  const filtered = filters.length > 0 || q !== '';
  const modified = JSON.stringify(filters) !== JSON.stringify(viewFilters[view] ?? []);

  return (
    <>
      <DataTable
        label={label}
        columns={columns}
        rows={shown}
        getRowId={getRowId}
        state={state}
        empty={empty}
        filtered={filtered}
        onClearFilters={() => {
          setFilters([]);
          setQ('');
        }}
        selectable={selectable}
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={bulkActions}
        rowButtons={rowButtons}
        rowActions={rowActions}
        onRowClick={drawer ? (r) => setOpenId(getRowId(r)) : undefined}
        activeRowId={openId}
        pageSize={pageSize}
        toolbar={<FilterBar fields={fields} value={filters} onChange={setFilters} search={q} onSearchChange={setQ} searchPlaceholder={searchPlaceholder} />}
        views={
          views && (
            <SavedViewMenu
              views={views}
              currentId={view}
              modified={modified}
              onSelect={(id) => {
                setView(id);
                setFilters(viewFilters[id] ?? []);
              }}
              onSave={() => undefined}
              onSaveAs={() => undefined}
            />
          )
        }
        onExport={() => undefined}
      />
      {open && drawer?.(open, () => setOpenId(null))}
    </>
  );
}

export const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
