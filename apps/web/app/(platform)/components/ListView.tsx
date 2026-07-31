'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Settings2, Check } from 'lucide-react';
import {
  Table,
  type Column,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '../../../components/ui';

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

function readHiddenColumns(storageKey: string, fallback: string[]): string[] {
  const raw = window.localStorage.getItem(`listview:${storageKey}:hidden`);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : fallback;
  } catch {
    // A hand-edited or half-written value must not blank the whole console.
    return fallback;
  }
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
  const [hidden, setHidden] = useState<string[]>(defaultHiddenColumns);
  const [sort, setSort] = useState<{ key: string; header: string; direction: 'asc' | 'desc' } | null>(null);

  // Read on mount rather than in useState's initializer: this component renders on
  // the server too, where localStorage does not exist, and seeding state from it
  // directly would make the first client render disagree with the server's.
  useEffect(() => {
    setHidden(readHiddenColumns(storageKey, defaultHiddenColumns));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultHiddenColumns is a literal at every call site; depending on it would re-read on every render
  }, [storageKey]);

  function toggleColumn(key: string) {
    setHidden((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      window.localStorage.setItem(`listview:${storageKey}:hidden`, JSON.stringify(next));
      return next;
    });
  }

  const visibleColumns = useMemo(() => columns.filter((column) => !hidden.includes(column.key)), [columns, hidden]);

  const query = search.trim().toLowerCase();
  const visibleRows = useMemo(() => (query ? rows.filter((row) => searchMatch(row, query)) : rows), [rows, query, searchMatch]);

  const truncated = totalCount !== undefined && totalCount > rows.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <span aria-hidden="true">{icon}</span>
          {title}
        </h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-recruiter-border pb-2">
        <p data-testid="list-view-meta" className="text-xs text-recruiter-text-tertiary">
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
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Choose Columns" className="rounded border border-recruiter-border p-2">
              <Settings2 size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {columns
                // A column with no header is a layout slot (the row-action cell);
                // offering "show/hide ''" in the chooser would be meaningless.
                .filter((column) => column.header !== '')
                .map((column) => {
                  const visible = !hidden.includes(column.key);
                  // A non-text header (e.g. a filter dropdown trigger) has no string to
                  // read as the checkbox's accessible name -- fall back the same way
                  // Table's own sort announcement does.
                  const label = column.sortLabel ?? (typeof column.header === 'string' ? column.header : column.key);
                  return (
                    <button
                      key={column.key}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={visible}
                      aria-label={label}
                      onClick={() => toggleColumn(column.key)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-recruiter-bg-subtle"
                    >
                      <Check size={14} className={visible ? 'opacity-100' : 'opacity-0'} aria-hidden="true" />
                      {column.header}
                    </button>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
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
          columns={visibleColumns}
          rows={visibleRows}
          rowKey={rowKey}
          emptyMessage={query ? 'No matches.' : emptyMessage}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}
