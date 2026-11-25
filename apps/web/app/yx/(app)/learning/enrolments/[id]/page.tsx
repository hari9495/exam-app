'use client';

import { useParams } from 'next/navigation';
import { CoursePlayerScreen, type LivePlayer } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningOpen, useLearningWrite } from '../../../../../../lib/yx-learning';

// Learning › a course I am in: the designed LRN-02 player with `live` (batch G3a).
export default function YxCoursePlayerPage() {
  const { id } = useParams<{ id: string }>();
  const data = useLearning<NonNullable<LivePlayer['data']>>(`/my/enrolments/${encodeURIComponent(id)}`);
  const write = useLearningWrite();
  const open = useLearningOpen();
  const state = learningState(data);
  return (
    <CoursePlayerScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onOpenFile: (item) => open(`/my/enrolments/${encodeURIComponent(id)}/items/${encodeURIComponent(item)}/file`),
        onDone: (item) => write<{ completed: boolean }>('POST', `/my/enrolments/${encodeURIComponent(id)}/items/${encodeURIComponent(item)}/done`),
      }}
    />
  );
}
