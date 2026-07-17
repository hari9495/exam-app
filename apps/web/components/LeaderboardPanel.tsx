'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';

export function LeaderboardPanel({ examId }: { examId: string }) {
  const { leaderboard } = useExamMonitoring(examId);

  if (leaderboard.length === 0) {
    return <p className="text-sm text-gray-500">No answers yet — the leaderboard fills in as candidates answer.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      <AnimatePresence>
        {leaderboard.map((row) => (
          <motion.li
            key={row.candidateId}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-right text-sm font-bold text-gray-500">{row.rank}</span>
              <span className="text-sm font-medium text-gray-900">{row.candidateName}</span>
            </div>
            <span className="text-sm font-semibold text-gray-700">{row.correctCount}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
