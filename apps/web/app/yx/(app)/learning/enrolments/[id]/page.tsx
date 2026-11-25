'use client';

import { useParams, useRouter } from 'next/navigation';
import { CoursePlayerScreen, type LiveMySession, type LivePlayer } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningOpen, useLearningWrite } from '../../../../../../lib/yx-learning';

// Learning › a course I am in: the designed LRN-02 player with `live` (batch G3a).
export default function YxCoursePlayerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const data = useLearning<NonNullable<LivePlayer['data']>>(`/my/enrolments/${encodeURIComponent(id)}`);
  const write = useLearningWrite();
  const open = useLearningOpen();
  const state = learningState(data);
  const classroom = data.data && data.data.course.type !== 'self_paced';
  const sessions = useLearning<LiveMySession[]>(classroom ? '/my/sessions' : null);
  const my = (sid: string) => `/my/sessions/${encodeURIComponent(sid)}`;
  return (
    <CoursePlayerScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onOpenFile: (item) => open(`/my/enrolments/${encodeURIComponent(id)}/items/${encodeURIComponent(item)}/file`),
        onDone: (item) => write<{ completed: boolean }>('POST', `/my/enrolments/${encodeURIComponent(id)}/items/${encodeURIComponent(item)}/done`),
        sessions: classroom
          ? {
              sessions: (sessions.data ?? []).filter((s) => s.courseId === data.data?.course.id),
              today: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
              onBook: (sid) => write<{ status: string; position: number | null }>('POST', `${my(sid)}/book`),
              onCancel: (sid) => write('POST', `${my(sid)}/cancel`),
              onCheckIn: (sid, slotId, code) => write('POST', `${my(sid)}/check-in`, { slotId, code }),
              onRate: (sid) => router.push(`/yx/learning/feedback/${encodeURIComponent(sid)}`),
            }
          : undefined,
      }}
    />
  );
}
