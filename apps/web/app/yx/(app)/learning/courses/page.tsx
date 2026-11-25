'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { CoursesListScreen, type CourseRow } from '@yukthix/ui/frame';
import { loadState } from '../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../lib/yx-learning';
import { learnState } from '../my-learning';

// Learning › Course builder (LRN-03, learning.manage): every course with its status; a new course starts as a draft.
export default function YxCoursesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const courses = useLearning<CourseRow[]>('/admin/courses');
  const write = useLearningWrite();
  return (
    <CoursesListScreen
      live={{
        state: learnState(loadState(courses)),
        onRetry: () => void courses.refetch(),
        rows: courses.data ?? null,
        onOpen: (id) => router.push(`/yx/learning/courses/${encodeURIComponent(id)}`),
        onCreate: async (input) => {
          try {
            const out = await write<{ id: string }>('POST', '/admin/courses', { ...input, provider: input.provider || null, description: input.description || null });
            toast({ tone: 'success', title: `${input.title} created as a draft`, description: 'Add its content, then publish it.' });
            router.push(`/yx/learning/courses/${encodeURIComponent(out.id)}`);
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'The course was not created. Try again.' });
            throw e;
          }
        },
      }}
    />
  );
}
