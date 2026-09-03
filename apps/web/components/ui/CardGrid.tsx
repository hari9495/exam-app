'use client';

import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, Inbox } from 'lucide-react';
import { Select } from './Select';
import { EmptyState } from './EmptyState';

export interface SortOption<T> {
  key: string;
  label: string;
  sortValue: (item: T) => string | number;
}

interface CardGridProps<T> {
  items: T[];
  cardKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
  sortOptions?: SortOption<T>[];
}

const DEFAULT_SORT_KEY = 'default';

export function CardGrid<T>({ items, cardKey, renderCard, emptyMessage = 'No results.', sortOptions }: CardGridProps<T>) {
  const [sortKey, setSortKey] = useState(DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  if (items.length === 0) {
    return <EmptyState icon={<Inbox size={20} />} title={emptyMessage} />;
  }

  const activeSort = sortOptions?.find((option) => option.key === sortKey);
  const sorted = activeSort
    ? [...items].sort((a, b) => {
        const av = activeSort.sortValue(a);
        const bv = activeSort.sortValue(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : items;

  return (
    <div>
      {sortOptions && sortOptions.length > 0 && (
        <div className="mb-3 flex items-end gap-2">
          <Select
            label="Sort By"
            value={sortKey}
            onChange={setSortKey}
            options={[
              { value: DEFAULT_SORT_KEY, label: 'Default order' },
              ...sortOptions.map((option) => ({ value: option.key, label: option.label })),
            ]}
          />
          <button
            type="button"
            aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
            disabled={!activeSort}
            onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
            className="rounded-lg border border-rule p-2 text-muted transition-colors hover:bg-ground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item, index) => (
          <motion.div
            key={cardKey(item)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04, ease: 'easeOut' }}
            whileHover={{ y: -3 }}
            // Depth without a soft shadow: the whileHover lift + a border that warms to primary
            // on hover. Matches Card's hairline-on-paper language.
            className="group rounded-lg border border-rule bg-paper p-4 transition-colors hover:border-primary/30"
          >
            {renderCard(item)}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
