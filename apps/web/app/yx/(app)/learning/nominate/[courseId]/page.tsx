'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EnrolmentSheet, type LiveCourse } from '@yukthix/ui/learning';
import { useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';

// Learning › Nominate: the designed LRN-06 sheet with `live` (batch G3a). A manager nominates their own team; L&D anyone
// (the API checks again).
export default function YxNominatePage() {
  const router = useRouter();
  const { courseId } = useParams<{ courseId: string }>();
  const [q, setQ] = useState('');
  const mine = useLearning<{ catalogue: LiveCourse[] }>('/my');
  const people = useLearning<{ id: string; name: string }[]>(`/my/nominate/people${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const write = useLearningWrite();
  const course = mine.data?.catalogue.find((c) => c.id === courseId) ?? null;
  return (
    <EnrolmentSheet
      live={{
        course,
        people: people.data ?? [],
        onSearch: setQ,
        today: new Date(),
        onSend: (userIds, dueOn) => write<{ nominated: number }>('POST', `/my/courses/${encodeURIComponent(courseId)}/nominate`, { userIds, ...(dueOn ? { dueOn } : {}) }),
        onClose: () => router.push('/yx/learning'),
      }}
    />
  );
}
