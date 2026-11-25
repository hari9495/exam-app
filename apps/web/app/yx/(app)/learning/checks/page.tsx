'use client';

import { TrainingFeedbackScreen, type LiveFeedback } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../lib/yx-learning';
import { learnState } from '../my-learning';

// Learning › training checks: the designed LRN-12 manager check with `live`. A manager is asked about their own reports
// some days after they complete a session (company setting learning.check_after_days).
export default function YxTrainingChecksPage() {
  const checks = useLearning<NonNullable<LiveFeedback['checks']>>('/checks');
  const write = useLearningWrite();
  return (
    <TrainingFeedbackScreen
      live={{
        mode: 'manager-check',
        state: learnState(loadState(checks)),
        onRetry: () => void checks.refetch(),
        checks: checks.data ?? [],
        onCheck: (enrolmentId, v) => write('POST', `/checks/${encodeURIComponent(enrolmentId)}`, v),
        onDone: () => void checks.refetch(),
      }}
    />
  );
}
