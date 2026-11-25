'use client';

import { useRouter } from 'next/navigation';
import { MyLearningScreen, type LiveMyLearning } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../lib/yx-learning';

// Learning › My learning: the designed LRN-01 with `live` (batch G3a): my courses, the catalogue and my certificates.
// Managers and L&D nominate from the catalogue (the API checks the reporting line or the key).
export default function YxMyLearningPage() {
  const router = useRouter();
  const mine = useLearning<Pick<LiveMyLearning, 'enrolments' | 'certificates' | 'catalogue'>>('/my');
  const people = useLearning<{ id: string }[]>('/my/nominate/people');
  const write = useLearningWrite();
  const state = learningState(mine);
  return (
    <MyLearningScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void mine.refetch(),
        enrolments: mine.data?.enrolments ?? [],
        certificates: mine.data?.certificates ?? [],
        catalogue: mine.data?.catalogue ?? [],
        today: new Date(),
        onOpen: (id) => router.push(`/yx/learning/enrolments/${encodeURIComponent(id)}`),
        onEnrol: (id) => write<{ status: string }>('POST', `/my/courses/${encodeURIComponent(id)}/enrol`),
        onDecline: (id, reason) => write('POST', `/my/enrolments/${encodeURIComponent(id)}/decline`, { reason }),
        onNominate: people.data?.length ? (id) => router.push(`/yx/learning/nominate/${encodeURIComponent(id)}`) : undefined,
      }}
    />
  );
}
