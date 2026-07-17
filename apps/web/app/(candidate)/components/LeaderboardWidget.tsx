'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLeaderboard } from '../../../lib/hooks/useAttempt';

export function LeaderboardWidget({ enabled }: { enabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useLeaderboard(enabled);

  if (isLoading && !data) {
    return null;
  }
  if (!data || !data.you) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white text-xs">
      <button
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between px-3 py-2 font-semibold text-gray-700"
      >
        <span>Leaderboard: #{data.you.rank}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-1 border-t border-gray-100 p-2">
          <AnimatePresence>
            {data.top.map((row) => (
              <motion.li
                key={row.label === 'You' ? 'you' : row.label}
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={row.isYou ? 'flex justify-between rounded bg-candidate-primary-light px-2 py-1 font-semibold text-candidate-primary' : 'flex justify-between px-2 py-1 text-gray-600'}
              >
                <span>
                  #{row.rank} <span>{row.label}</span>
                </span>
                <span>{row.correctCount}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
