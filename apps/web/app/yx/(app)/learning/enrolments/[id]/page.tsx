'use client';

import { useParams } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { CoursePlayerScreen, type LivePlayer } from '@yukthix/ui/frame';
import { loadState } from '../../../../../../lib/yx-org';
import { useLearning, useLearningFiles, useLearningWrite } from '../../../../../../lib/yx-learning';
import { learnState } from '../../my-learning';

// Learning › a course (LRN-02): the outline, each item opened in a new tab, Mark as done; the last required item
// completes the course and issues its certificate.
export default function YxCoursePlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const enc = encodeURIComponent(id);
  const player = useLearning<NonNullable<LivePlayer['data']>>(`/enrolments/${enc}`);
  const write = useLearningWrite();
  const files = useLearningFiles();
  const failed = (e: unknown, what: string) => toast({ tone: 'error', title: e instanceof Error ? e.message : what });
  const course = player.data?.course;
  return (
    <CoursePlayerScreen
      course={course ?? { id, title: '', type: 'Self-paced', source: '', duration: '', skills: [], cost: 0 }}
      items={[]}
      currentId=""
      live={{
        state: learnState(loadState(player)),
        onRetry: () => void player.refetch(),
        data: player.data ?? null,
        onOpenItem: (item) => {
          if (item.kind === 'Link' && item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
          else void files.open(`/items/${encodeURIComponent(item.id)}/file`).catch((e) => failed(e, 'The file did not open. Try again.'));
        },
        onDone: async (item) => {
          try {
            const out = await write<{ completed: boolean }>('POST', `/enrolments/${enc}/items/${encodeURIComponent(item.id)}/done`);
            toast({ tone: 'success', title: out.completed ? `You completed ${course?.title ?? 'the course'}` : `${item.title} done` });
          } catch (e) {
            failed(e, 'That did not save. Try again.');
          }
        },
        onDownload: (certId) => void files.download(`/certificates/${encodeURIComponent(certId)}/pdf`, 'certificate.pdf').catch((e) => failed(e, 'The certificate did not download.')),
      }}
    />
  );
}
