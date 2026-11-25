'use client';

import { useParams, useRouter } from 'next/navigation';
import { CourseBuilderScreen, type LiveCourseBuilder } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';

// Learning › Courses › one course (new or existing): the designed LRN-03 builder with `live` (batch G3a). The API checks
// the key, the items (https links; MP4 and PDF scanned), the skills and publishing again.
export default function YxCourseEditorPage() {
  const router = useRouter();
  const { id } = useParams<{ id?: string }>();
  const course = useLearning<NonNullable<LiveCourseBuilder['course']>>(id ? `/courses/${encodeURIComponent(id)}` : null);
  const skills = useLearning<{ id: string; name: string }[]>('/courses/skills');
  const write = useLearningWrite();
  const state = id ? learningState(course, skills) : learningState(skills);
  return (
    <CourseBuilderScreen
      key={course.data?.id ?? (id ? 'loading' : 'new')}
      live={{
        view: 'edit',
        state: state === 'loading' && id ? 'loading' : state,
        onRetry: () => void course.refetch(),
        course: course.data ?? null,
        skillOptions: skills.data ?? [],
        onSave: async (input) => {
          if (id) return write<{ id: string }>('PUT', `/courses/${encodeURIComponent(id)}`, input);
          const made = await write<{ id: string }>('POST', '/courses', input);
          router.push(`/yx/learning/courses/${encodeURIComponent(made.id)}`);
          return made;
        },
        onUpload: (title, minutes, file) => {
          const body = new FormData();
          body.append('title', title);
          body.append('minutes', String(minutes));
          body.append('file', file);
          return write('POST', `/courses/${encodeURIComponent(id!)}/files`, body);
        },
        onPublish: () => write('POST', `/courses/${encodeURIComponent(id!)}/publish`),
        onDecide: (e, approve, reason) => write('POST', `/courses/enrolments/${encodeURIComponent(e)}/decide`, { approve, ...(reason ? { reason } : {}) }),
        onNominate: () => router.push(`/yx/learning/nominate/${encodeURIComponent(id!)}`),
      }}
    />
  );
}
