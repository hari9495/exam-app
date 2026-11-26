'use client';

import { useParams, useRouter } from 'next/navigation';
import { TrainingFeedbackScreen } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';
import { learnState } from '../../my-learning';

// Learning › rate a session: the designed LRN-12 reaction with `live`. Only a confirmed session I attended, once (the
// API checks again).
export default function YxSessionFeedbackPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const due = useLearning<{ sessionId: string; course: string; trainer: string; venue: string; confirmedOn: string }[]>('/feedback/due');
  const write = useLearningWrite();
  const s = due.data?.find((x) => x.sessionId === sessionId);
  return (
    <TrainingFeedbackScreen
      live={{
        mode: 'reaction',
        state: learnState(loadState(due)),
        onRetry: () => void due.refetch(),
        session: s ? { id: s.sessionId, course: s.course, trainer: s.trainer, when: s.venue } : null,
        onReact: (id, v) => write('POST', `/sessions/${encodeURIComponent(id)}/reaction`, v),
        onDone: () => router.push('/yx/learning'),
      }}
    />
  );
}
