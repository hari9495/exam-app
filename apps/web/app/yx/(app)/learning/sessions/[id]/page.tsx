'use client';

import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { LiveSessionPageScreen, type LiveSessionPageData, type LiveTrainerRow } from '@yukthix/ui/frame';
import { loadState, useYxPermissions } from '../../../../../../lib/yx-org';
import { useJoinerPlaces } from '../../../../../../lib/yx-lifecycle';
import { useLearning, useLearningWrite } from '../../../../../../lib/yx-learning';
import { learnState } from '../../my-learning';

// Learning › a session (LRN-04): attendees and the waitlist, attendance by slot, results and cost.
export default function YxSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const ld = useYxPermissions().has('learning.manage');
  const enc = encodeURIComponent(id);
  const page = useLearning<LiveSessionPageData>(`/sessions/${enc}`);
  const trainers = useLearning<LiveTrainerRow[]>(ld ? '/trainers' : null);
  const places = useJoinerPlaces(ld);
  const write = useLearningWrite();
  const v = page.data?.session.version ?? 1;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast({ tone: 'success', title: done });
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? e.message : 'That did not work. Try again.' });
      throw e;
    }
  };
  const course = page.data?.session.course ?? 'the course';
  return (
    <LiveSessionPageScreen
      live={{
        state: learnState(loadState(page)),
        onRetry: () => void page.refetch(),
        data: page.data ?? null,
        trainers: (trainers.data ?? []).map((t) => ({ value: t.id, label: t.name })),
        people: ld ? places.managers : [],
        onReschedule: (input) => run(() => write('PATCH', `/sessions/${enc}`, { mode: input.mode, venue: input.venue, seats: input.seats, slots: input.slots, costLines: input.costLines, ...(input.trainerId ? { trainerId: input.trainerId } : {}), version: v }), `${course} rescheduled; everyone is told`),
        onCancel: () => run(() => write('PATCH', `/sessions/${enc}`, { cancel: true, version: v }), `${course} session cancelled; everyone is told`),
        onWithdraw: (e) => run(async () => {
          const out = await write<{ promoted: string | null }>('POST', `/sessions/${enc}/withdraw`, { enrolmentId: e.enrolmentId });
          if (out.promoted) toast({ tone: 'success', title: `${out.promoted} moved off the waitlist`, description: 'They got a seat and were notified.' });
        }, `${e.name} withdrawn`),
        onNominate: (employeeIds) => run(() => write('POST', `/sessions/${enc}/nominate`, { employeeIds }), `${employeeIds.length} ${employeeIds.length === 1 ? 'person' : 'people'} nominated`),
        onMark: (slotId, marks) => run(() => write('POST', `/sessions/${enc}/slots/${encodeURIComponent(slotId)}/attendance`, { marks }), 'Attendance saved'),
        onConfirm: () => run(() => write('POST', `/sessions/${enc}/confirm`, { version: v }), 'Attendance confirmed; results are out'),
        onShowQr: (slotId) => router.push(`/yx/learning/sessions/${enc}/qr/${encodeURIComponent(slotId)}`),
      }}
    />
  );
}
