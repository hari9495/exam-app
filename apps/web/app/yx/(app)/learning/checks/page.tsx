'use client';

import { TrainingFeedbackScreen, type LiveFeedback } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../../lib/yx-learning';

// Learning › training checks: the designed LRN-12 manager check with `live` (batch G3b). A manager is asked about their
// own reports some days after they finish a session (company setting learning.check_after_days).
export default function YxTrainingChecksPage() {
  const checks = useLearning<NonNullable<LiveFeedback['checks']>>('/my/sessions/checks');
  const write = useLearningWrite();
  const state = learningState(checks);
  return (
    <TrainingFeedbackScreen
      live={{
        mode: 'manager-check',
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void checks.refetch(),
        checks: checks.data ?? [],
        onCheck: (sessionId, v) => write('POST', `/my/sessions/${encodeURIComponent(sessionId)}/check`, v),
        onDone: () => void checks.refetch(),
      }}
    />
  );
}
