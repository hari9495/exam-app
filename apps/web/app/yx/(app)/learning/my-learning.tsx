'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { MyLearningScreen, type LearningCourse, type LiveCertificate, type LiveEnrolment, type LiveExternal } from '@yukthix/ui/frame';
import { loadState } from '../../../../lib/yx-org';
import { useLearning, useLearningFiles, useLearningWrite } from '../../../../lib/yx-learning';

type Me = { today: string; employee: boolean; enrolments: LiveEnrolment[]; certificates: LiveCertificate[]; catalogue: LearningCourse[]; external: LiveExternal[] };
const ROUTE = { mine: '/yx/learning', catalogue: '/yx/learning/catalogue', certificates: '/yx/learning/certificates' } as const;
/** The growth screens have no separate no-access state: the API's refusal shows as the error with retry. */
export const learnState = (s: ReturnType<typeof loadState>) => (s === 'no-access' ? 'error' : s);

// Learning › My learning and Catalogue (LRN-01): what is assigned with due dates, what to continue, the published
// catalogue to enrol in (or ask for), and certificates.
export function MyLearningPage({ tab }: { tab: 'mine' | 'catalogue' | 'certificates' }) {
  const router = useRouter();
  const { toast } = useToast();
  const me = useLearning<Me>('/me');
  const write = useLearningWrite();
  const files = useLearningFiles();
  return (
    <MyLearningScreen
      enrolments={[]}
      certificates={[]}
      catalogue={[]}
      recommendations={[]}
      live={{
        state: learnState(loadState(me)),
        onRetry: () => void me.refetch(),
        data: me.data ?? null,
        tab,
        onTab: (t) => router.push(ROUTE[t]),
        onOpen: (id) => router.push(`/yx/learning/enrolments/${encodeURIComponent(id)}`),
        onEnrol: async (course, opts) => {
          try {
            const out = await write<{ id: string; status: string }>('POST', `/courses/${encodeURIComponent(course.id)}/enrol`, opts);
            toast({ tone: 'success', title: out.status === 'Requested' ? `You asked to join ${course.title}` : `You are enrolled in ${course.title}`, ...(out.status === 'Requested' ? { description: 'It starts once it is approved.' } : {}) });
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not work. Try again.' });
            throw e;
          }
        },
        onExternal: async (input) => {
          try {
            await write('POST', '/me/external', input);
            toast({ tone: 'success', title: `You asked for ${input.title}`, description: 'It goes to your manager, then L&D.' });
          } catch (e) {
            toast({ tone: 'error', title: e instanceof Error ? e.message : 'The request was not sent. Try again.' });
            throw e;
          }
        },
        onDownload: (id) => void files.download(`/certificates/${encodeURIComponent(id)}/pdf`, 'certificate.pdf').catch((e) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'The certificate did not download.' })),
      }}
    />
  );
}
