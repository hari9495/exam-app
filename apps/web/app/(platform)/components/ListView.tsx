'use client';

import { ReactNode, useMemo, useState } from 'react';
import { Table, type Column, Input, useColumnVisibility } from '../../../components/ui';

interface ListViewProps<T> {
  title: string;
  icon: ReactNode;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** `query` arrives already lowercased and trimmed, and is never empty. */
  searchMatch: (row: T, query: string) => boolean;
  /** Namespaces this list's column-visibility preference in localStorage. */
  storageKey: string;
  actions?: ReactNode;
  /** Caller-supplied filter controls, rendered beside the search box. The caller
   *  filters `rows` itself -- ListView holds no filter state. */
  filters?: ReactNode;
  /** Seeds the search box on mount -- e.g. from a ?org= link. */
  initialSearch?: string;
  defaultHiddenColumns?: string[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  isError?: boolean;
  /** Server-reported total. When it exceeds `rows.length`, the shortfall is stated
   *  rather than letting a truncated list read as the whole set. */
  totalCount?: number;
}

export function ListView<T>({
  title,
  icon,
  columns,
  rows,
  rowKey,
  searchMatch,
  storageKey,
  actions,
  filters,
  initialSearch = '',
  defaultHiddenColumns = [],
  searchPlaceholder = 'Search…',
  emptyMessage = 'Nothing here yet.',
  isLoading = false,
  isError = false,
  totalCount,
}: ListViewProps<T>) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<{ key: string; header: string; direction: 'asc' | 'desc' } | null>(null);
  const { visibleColumns, chooser } = useColumnVisibility(storageKey, columns, defaultHiddenColumns);

  const query = search.trim().toLowerCase();
  const visibleRows = useMemo(() => (query ? rows.filter((row) => searchMatch(row, query)) : rows), [rows, query, searchMatch]);

  const truncated = totalCount !== undefined && totalCount > rows.length;

  // Position in the currently sorted/filtered view, 1-based -- defined here (not part of
  // the caller's `columns`) so it can't be hidden via the column chooser, same convention
  // as ExamResultsPanel/CandidatesPanel's own index column.
  const indexColumn: Column<T> = { key: 'index', header: '#', render: (_row, index) => index + 1 };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <span aria-hidden="true">{icon}</span>
          {title}
        </h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-2">
        <p data-testid="list-view-meta" className="text-xs text-muted">
          {visibleRows.length} {visibleRows.length === 1 ? 'item' : 'items'}
          {sort ? ` • Sorted by ${sort.header}` : ''}
          {/* Two different warnings, because the advice differs. With no search
              active the rest can still be reached. Once a search IS active,
              "narrow your search" is wrong advice -- narrowing further cannot
              reveal rows that were never fetched, and the real risk is the user
              believing an incomplete result set is complete. */}
          {truncated
            ? query
              ? ` • searched only the first ${rows.length} of ${totalCount} — there may be more matches`
              : ` • showing ${rows.length} of ${totalCount} — search to reach the rest`
            : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          <Input
            label={searchPlaceholder}
            hideLabel
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={setSearch}
          />
          {chooser}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load {title}.
        </p>
      )}
      {!isLoading && !isError && (
        <Table
          columns={[indexColumn, ...visibleColumns]}
          rows={visibleRows}
          rowKey={rowKey}
          emptyMessage={query ? 'No matches.' : emptyMessage}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}
