'use client';

import { ReactNode, useState } from 'react';
import clsx from 'clsx';
import { ArrowUp, ArrowDown, Inbox } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  /** Usually plain text, but can be any header content (e.g. a filter dropdown
   *  trigger) -- see sortLabel below for how that interacts with onSortChange. */
  header: ReactNode;
  /** Text label for the "Sorted by X" announcement when header isn't plain text.
   *  Defaults to header if it's a string, else falls back to key so a non-text
   *  header (a filter dropdown, say) never renders as "[object Object]". */
  sortLabel?: string;
  /** index is the row's position in the currently sorted/visible list (0-based) --
   *  handy for a display-only row-number column. Most callers ignore it. */
  render: (row: T, index: number) => ReactNode;
  sortValue?: (row: T) => string | number;
  /** Opt-in, e.g. '28%' or '4rem'. Only meant for a caller that renders several
   *  independent <Table>s meant to line up as one (grouped views) -- browsers size
   *  each table's columns from its OWN rows, so two tables with different content
   *  drift out of alignment unless every column's width is pinned the same way in
   *  both. Leaving this unset on every column keeps the existing auto-sized
   *  behavior identical for every other caller. */
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  /** Optional icon + action for the empty state, e.g. a "New exam" button. */
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  /** When true, renders a row-shaped shimmer placeholder instead of the table or empty state. */
  isLoading?: boolean;
  /** Fires whenever the user changes the sort. Sort state stays owned here; this
   *  only reports it, so a caller can label the active sort without lifting it. */
  onSortChange?: (sort: { key: string; header: string; direction: 'asc' | 'desc' }) => void;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'No results.',
  emptyIcon,
  emptyAction,
  isLoading = false,
  onSortChange,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return 0;
    const av = column.sortValue(a);
    const bv = column.sortValue(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSort(column: Column<T>) {
    if (!column.sortValue) return;
    const nextDir = sortKey === column.key && sortDir === 'asc' ? 'desc' : 'asc';
    setSortKey(column.key);
    setSortDir(nextDir);
    const header = column.sortLabel ?? (typeof column.header === 'string' ? column.header : column.key);
    onSortChange?.({ key: column.key, header, direction: nextDir });
  }

  if (isLoading) {
    return <TableSkeleton cols={columns.length || 5} />;
  }

  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon ?? <Inbox size={20} />} title={emptyMessage} action={emptyAction} />;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableCellElement>, column: Column<T>) {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.key === ' ') event.preventDefault();
      handleSort(column);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full border-collapse text-sm', columns.some((c) => c.width) && 'table-fixed')}>
        <thead>
          <tr className="border-b border-rule bg-ground text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                className={clsx(
                  'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted',
                  column.sortValue && 'cursor-pointer select-none',
                )}
                onClick={column.sortValue ? () => handleSort(column) : undefined}
                tabIndex={column.sortValue ? 0 : undefined}
                role={column.sortValue ? 'button' : undefined}
                onKeyDown={column.sortValue ? (event) => handleKeyDown(event, column) : undefined}
                aria-sort={column.sortValue ? (sortKey === column.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
              >
                {column.header}
                {sortKey === column.key &&
                  (sortDir === 'asc' ? (
                    <ArrowUp size={12} className="ml-1 inline" />
                  ) : (
                    <ArrowDown size={12} className="ml-1 inline" />
                  ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={rowKey(row)} className="group border-b border-rule/60 last:border-0 hover:bg-ground">
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2.5 text-ink">
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
