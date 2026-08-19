'use client';

import { ReactNode, useMemo, useState } from 'react';
import { Table, type Column, Input, useColumnVisibility } from '../../../components/ui';
import { PageSurface } from '../../../components/PageChrome';

interface ListViewProps<T> {
  title: string;
  /** Uppercase kicker above the title, matching the console PageHeader. */
  eyebrow?: string;
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
  eyebrow,
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
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</div>
          )}
          <h1 className="flex items-center gap-2 font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">
            <span aria-hidden="true">{icon}</span>
            {title}
          </h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <PageSurface>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
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

        {isLoading && <p className="px-4 py-4 text-sm text-muted">Loading…</p>}
        {isError && (
          <p role="alert" className="px-4 py-4 text-sm text-status-danger">
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
      </PageSurface>
    </div>
  );
}
