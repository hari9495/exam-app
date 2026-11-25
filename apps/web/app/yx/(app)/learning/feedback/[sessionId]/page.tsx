'use client';

import { useParams, useRouter } from 'next/navigation';
import { TrainingFeedbackScreen, slotText, type LiveMySession } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';

// Learning › rate a session: the designed LRN-12 reaction survey with `live` (batch G3b). Only a closed session I had
// a seat in, once (the API checks again).
export default function YxSessionFeedbackPage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const mine = useLearning<LiveMySession[]>('/my/sessions');
  const write = useLearningWrite();
  const s = mine.data?.find((x) => x.id === sessionId && x.canRate);
  const state = learningState(mine);
  return (
    <TrainingFeedbackScreen
      live={{
        mode: 'reaction',
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void mine.refetch(),
        session: s ? { id: s.id, course: s.course, trainer: s.trainer, when: [s.slots[0] && slotText(s.slots[0]), s.venue].filter(Boolean).join(' · ') } : null,
        onReact: (id, v) => write('POST', `/my/sessions/${encodeURIComponent(id)}/reaction`, v),
        onDone: () => router.push('/yx/learning'),
      }}
    />
  );
}
