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
  /** A number or amount: right-aligned (its heading too), tabular figures, never breaks across lines. */
  num?: boolean;
  /** Marks a cell whose value changed (medium weight). */
  changed?: (row: R) => boolean;
}

/** A row picked out: a tint, a bar on its start edge and a word read out first, so colour is never the only sign. */
export interface PlainTableRowTone {
  tone: 'warning' | 'danger' | 'success' | 'selected';
  /** Read out before the row, e.g. "Flagged", "Error", "Same in both", "Selected". */
  label: string;
}

/** A total row under the body: its label sits in the first column and spans the empty ones up to the first value. */
export interface PlainTableFooterRow {
  id: string;
  label: ReactNode;
  /** Values by column key; columns without one stay empty. */
  cells: Partial<Record<string, ReactNode>>;
}

export interface PlainTableProps<R> {
  /** The table's name for screen readers; also names the sideways-scroll region. */
  label: string;
  /** A visible line above the table; without it the label is read but not shown. */
  caption?: ReactNode;
  columns: PlainTableColumn<R>[];
  rows: R[];
  getRowId: (row: R) => string;
  /** Total rows (semibold), e.g. "Total", "Cost to company". */
  footer?: PlainTableFooterRow[];
  /** Picks out a row (flagged, error, a match, the selected one). */
  rowTone?: (row: R) => PlainTableRowTone | undefined;
  /** Column headings read out but not shown, for a short label-and-value list whose design has no heading row. */
  hideHeader?: boolean;
  className?: string;
}

/**
 * A small read-only table (a few rows, no sort, filter, select or paging): impact previews, policy lists, what we hold,
 * pay workings with totals. Long values wrap; it scrolls sideways only on a narrow screen. For lists people work through,
 * use DataTable.
 */
export function PlainTable<R>({ label, caption, columns, rows, getRowId, footer, rowTone, hideHeader, className }: PlainTableProps<R>) {
  return (
    <div className="yx-scroll-x" tabIndex={0} role="region" aria-label={`${label}, scrolls sideways on small screens`}>
      <table className={cx('yx-plain-table', className)} aria-label={caption ? undefined : label}>
        {caption && <caption className="yx-plain-table__caption">{caption}</caption>}
        <thead className={hideHeader ? 'yx-visually-hidden' : undefined}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-date={c.date || undefined} data-num={c.num || undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = rowTone?.(r);
            return (
              <tr key={getRowId(r)} data-tone={tone?.tone}>
                {columns.map((c, i) => {
                  const Cell = c.rowHeader ? 'th' : 'td';
                  return (
                    <Cell key={c.key} scope={c.rowHeader ? 'row' : undefined} data-date={c.date || undefined} data-num={c.num || undefined} data-changed={c.changed?.(r) || undefined}>
                      {i === 0 && tone && <span className="yx-visually-hidden">{`${tone.label}: `}</span>}
                      {c.cell(r)}
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {footer && footer.length > 0 && (
          <tfoot>
            {footer.map((f) => {
              const span = Math.max(1, columns.findIndex((c) => c.key in f.cells));
              return (
                <tr key={f.id}>
                  <th scope="row" colSpan={span > 1 ? span : undefined}>
                    {f.label}
                  </th>
                  {columns.slice(span).map((c) => (
                    <td key={c.key} data-num={c.num || undefined}>
                      {f.cells[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tfoot>
        )}
      </table>
    </div>
  );
}
