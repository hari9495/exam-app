import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface PlainTableColumn<R> {
  key: string;
  header: ReactNode;
  cell: (row: R) => ReactNode;
  /** The column that names the row (read out first by screen readers). */
  rowHeader?: boolean;
  /** A date ("14 Nov 2026") never breaks across lines. */
  date?: boolean;
  /** Marks a cell whose value changed (medium weight). */
  changed?: (row: R) => boolean;
}

export interface PlainTableProps<R> {
  /** The table's name for screen readers; also names the sideways-scroll region. */
  label: string;
  /** A visible line above the table; without it the label is read but not shown. */
  caption?: ReactNode;
  columns: PlainTableColumn<R>[];
  rows: R[];
  getRowId: (row: R) => string;
  className?: string;
}

/**
 * A small read-only table (a few rows, no sort, filter, select or paging): impact previews, policy lists, what we hold.
 * Long values wrap; it scrolls sideways only on a narrow screen. For lists people work through, use DataTable.
 */
export function PlainTable<R>({ label, caption, columns, rows, getRowId, className }: PlainTableProps<R>) {
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label={`${label}, scrolls sideways on small screens`}>
      <table className={cx('yx-plain-table', className)} aria-label={caption ? undefined : label}>
        {caption && <caption className="yx-plain-table__caption">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-date={c.date || undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={getRowId(r)}>
              {columns.map((c) => {
                const Cell = c.rowHeader ? 'th' : 'td';
                return (
                  <Cell key={c.key} scope={c.rowHeader ? 'row' : undefined} data-date={c.date || undefined} data-changed={c.changed?.(r) || undefined}>
                    {c.cell(r)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
