'use client';

import { useRouter } from 'next/navigation';
import { CourseBuilderScreen, type LiveCourseBuilder } from '@yukthix/ui/learning';
import { learningState, useLearning } from '../../../../../lib/yx-learning';

// Learning › Courses (learning.manage, whole company): the LRN-03 builder's list with `live` (batch G3a).
export default function YxCoursesPage() {
  const router = useRouter();
  const list = useLearning<NonNullable<LiveCourseBuilder['list']>>('/courses');
  return (
    <CourseBuilderScreen
      live={{
        view: 'list',
        state: learningState(list),
        onRetry: () => void list.refetch(),
        list: list.data ?? [],
        onNew: () => router.push('/yx/learning/courses/new'),
        onOpen: (id) => router.push(`/yx/learning/courses/${encodeURIComponent(id)}`),
      }}
    />
  );
}
