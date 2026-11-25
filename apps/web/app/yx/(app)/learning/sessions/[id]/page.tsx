'use client';

import { useParams, useRouter } from 'next/navigation';
import { SessionsScreen, type LiveSessionPage } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';

// Learning › one session: the designed LRN-04 session page with `live` (batch G3b). L&D or the session's trainer.
export default function YxSessionPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/sessions/${encodeURIComponent(id)}`;
  const page = useLearning<LiveSessionPage>(base);
  const write = useLearningWrite();
  const state = learningState(page);
  return (
    <SessionsScreen
      live={{
        view: 'page',
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void page.refetch(),
        isLd: page.data?.isLd ?? false,
        sessions: [],
        page: page.data ?? null,
        courses: [],
        people: [],
        today: new Date(),
        onOpen: () => {},
        onSchedule: async () => ({ id }),
        onShowCode: () => router.push(`/yx/learning/sessions/${encodeURIComponent(id)}/code`),
        onMarks: (slotId, marks) => write('POST', `${base}/marks`, { slotId, marks }),
        onWithdraw: (userId) => write<{ promoted: string | null }>('POST', `${base}/withdraw`, { userId }),
        onClose: () => write<{ completed: number; noShow: number }>('POST', `${base}/close`),
      }}
    />
  );
}
