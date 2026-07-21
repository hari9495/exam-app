'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardGridProps<T> {
  items: T[];
  cardKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
}

export function CardGrid<T>({ items, cardKey, renderCard, emptyMessage = 'No results.' }: CardGridProps<T>) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-recruiter-text-tertiary">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <motion.div
          key={cardKey(item)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04, ease: 'easeOut' }}
          whileHover={{ y: -3 }}
          className="group rounded-2xl border border-recruiter-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          {renderCard(item)}
        </motion.div>
      ))}
    </div>
  );
}
