'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SessionsScreen, type LiveCourse, type LiveSessionRow } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../../lib/yx-learning';

// Learning › Sessions: the designed LRN-04 list with `live` (batch G3b). L&D (learning.manage) sees every session and
// schedules; a trainer sees the sessions they train (the API decides).
export default function YxSessionsPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const list = useLearning<LiveSessionRow[]>('/sessions');
  const courses = useLearning<LiveCourse[]>('/courses');
  const isLd = courses.isSuccess;
  const people = useLearning<{ id: string; name: string }[]>(isLd ? `/my/nominate/people${q ? `?q=${encodeURIComponent(q)}` : ''}` : null);
  const write = useLearningWrite();
  const state = learningState(list);
  return (
    <SessionsScreen
      live={{
        view: 'list',
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void list.refetch(),
        isLd,
        sessions: list.data ?? [],
        courses: (courses.data ?? []).filter((c) => c.status === 'published' && c.type !== 'self_paced'),
        people: people.data ?? [],
        onSearchPeople: setQ,
        today: new Date(),
        onOpen: (id) => router.push(`/yx/learning/sessions/${encodeURIComponent(id)}`),
        onSchedule: (input) => write<{ id: string }>('POST', '/sessions', input),
        onShowCode: () => {},
        onMarks: async () => undefined,
        onWithdraw: async () => ({ promoted: null }),
        onClose: async () => ({ completed: 0, noShow: 0 }),
      }}
    />
  );
}
