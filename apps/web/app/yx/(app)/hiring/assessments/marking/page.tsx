'use client';

import { useState } from 'react';
import { EvaluatorConsoleScreen, type MarkingItem } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { loadState } from '../../../../../../lib/yx-assessments';

interface QueueRow {
  attemptId: string;
  questionId: string;
}

// Assessments AS-6 › Marking (PRC-19): written, code, file and spoken answers waiting for me, blind by the company's
// setting, with a second marker and a moderator when the company asks, and the AI suggestion only after my own mark.
// People who mark (asmt.evaluate or exam:manage); the API checks every rule again.
export default function YxMarkingPage() {
  const queue = useApi<QueueRow[]>('/asmt/marking');
  const [at, setAt] = useState(0);
  const rows = queue.data ?? [];
  const row = rows.length ? rows[Math.min(at, rows.length - 1)] : null;
  const path = row ? `/asmt/marking/${row.attemptId}/${row.questionId}` : null;
  const item = useApi<MarkingItem>(path);
  const write = useApiWrite();
  return (
    <EvaluatorConsoleScreen
      live={{
        state: loadState({ isLoading: queue.isLoading || (Boolean(path) && item.isLoading), isError: queue.isError || item.isError }),
        onRetry: () => {
          void queue.refetch();
          void item.refetch();
        },
        position: row ? { index: Math.min(at, rows.length - 1), total: rows.length } : null,
        item: row ? (item.data ?? null) : null,
        onMark: async (marks, feedback) => void (await write('POST', `${path}/mark`, { marks, ...(feedback ? { feedback } : {}) })),
        onSuggest: async () => void (await write('POST', `${path}/suggestion`)),
        onNext: () => setAt((i) => (rows.length ? (i + 1) % rows.length : 0)),
        onFinish: async () => void (await write('POST', `/attempts/${row!.attemptId}/finalize-manual-grade`)),
      }}
    />
  );
}
