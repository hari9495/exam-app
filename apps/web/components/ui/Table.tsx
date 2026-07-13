'use client';

import { ReactNode, useState } from 'react';
import clsx from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}

export function Table<T>({ columns, rows, rowKey, emptyMessage = 'No results.' }: TableProps<T>) {
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
    if (sortKey === column.key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column.key);
      setSortDir('asc');
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">{emptyMessage}</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left">
          {columns.map((column) => (
            <th
              key={column.key}
              className={clsx('px-3 py-2 font-medium text-gray-600', column.sortValue && 'cursor-pointer select-none')}
              onClick={() => handleSort(column)}
            >
              {column.header}
              {sortKey === column.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={rowKey(row)} className="border-b border-gray-100 last:border-0">
            {columns.map((column) => (
              <td key={column.key} className="px-3 py-2">
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
