'use client';

import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { CourseBuilderScreen, type LiveBuilder } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';
import { learnState } from '../../my-learning';

// Learning › a course in the builder (LRN-03): content items in order, required or not; certificate, skills and
// settings; publish once a required item is there.
export default function YxCourseBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const enc = encodeURIComponent(id);
  const course = useLearning<NonNullable<LiveBuilder['data']>>(`/admin/courses/${enc}`);
  const write = useLearningWrite();
  const run = async (fn: () => Promise<unknown>, done: string, failed: string) => {
    try {
      await fn();
      toast({ tone: 'success', title: done });
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? e.message : failed });
      throw e;
    }
  };
  const c = course.data?.course;
  return (
    <CourseBuilderScreen
      course={{ id, title: '', type: 'Self-paced', source: '', duration: '', skills: [], cost: 0 }}
      items={[]}
      live={{
        state: learnState(loadState(course)),
        onRetry: () => void course.refetch(),
        data: course.data ?? null,
        onBack: () => router.push('/yx/learning/courses'),
        onSave: (d) => run(() => write('PATCH', `/admin/courses/${enc}`, { ...d, provider: d.provider || null, description: d.description || null, version: c!.version }), `${d.title} saved`, 'The course was not saved. Try again.'),
        onStatus: (status) => run(() => write('POST', `/admin/courses/${enc}/status`, { status, version: c!.version }), status === 'published' ? `${c!.title} is in the catalogue` : `${c!.title} is off the catalogue`, 'That did not work. Try again.'),
        onAddItem: (input, file) => {
          let body: unknown = input;
          if (file) {
            const form = new FormData();
            form.append('title', input.title);
            form.append('kind', input.kind);
            form.append('minutes', String(input.minutes));
            form.append('required', String(input.required));
            form.append('file', file);
            body = form;
          }
          return run(() => write('POST', `/admin/courses/${enc}/items`, body), `${input.title} added`, 'The item was not added. Try again.');
        },
        onItem: (item, change) => run(() => write('PATCH', `/admin/courses/${enc}/items/${encodeURIComponent(item.id)}`, change), change.move ? `${item.title} moved` : `${item.title} is ${change.required ? 'required' : 'optional'}`, 'That did not save. Try again.'),
        onRemove: (item) => run(() => write('DELETE', `/admin/courses/${enc}/items/${encodeURIComponent(item.id)}`), `${item.title} removed`, 'The item was not removed. Try again.'),
      }}
    />
  );
}
