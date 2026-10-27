'use client';

import { useParams } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { ContinuityChecklistPanel } from '@yukthix/ui/frame';
import type { Journey, JourneyTask } from '@yukthix/ui/lifecycle';
import { todayIst } from '../../../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../../../lib/yx-lifecycle';

type Continuity = { move: { from: string; to: string; effectiveDate: string; status: string }; journey: Journey };
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const STATUS: Record<string, string> = { done: 'Done', skipped: 'Skipped', cancelled: 'Cancelled' };
const noteOf = (t: JourneyTask) => (typeof t.answers?.note === 'string' ? t.answers.note : (t.skipReason ?? undefined));

// People › Change action › a move's continuity checklist (PPL-10, P01 YX-ORG-17): the payroll, finance and HR items
// that carry someone over to another legal entity, opened when the move took effect. Open items show in the new
// entity's payroll pre-flight. HR in scope sees it; each owner ticks off their own item (the API checks both).
export default function YxContinuityPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const res = useLife<Continuity>(`/lifecycle/continuity/${encodeURIComponent(id)}`);
  const write = useLifeWrite();
  const err = res.error as { status?: number } | null;
  const m = res.data;
  return (
    <ContinuityChecklistPanel
      today={day(m?.journey.today ?? todayIst())}
      live={{
        state: res.isError ? (err?.status === 403 || err?.status === 404 ? 'no-access' : 'error') : m ? 'ready' : 'loading',
        onRetry: () => void res.refetch(),
        person: m?.journey.person ?? '',
        from: m?.move.from ?? '',
        to: m?.move.to ?? '',
        effective: day(m?.move.effectiveDate ?? todayIst()),
        rows: (m?.journey.tasks ?? []).map((t) => ({ id: t.id, title: t.title, owner: [t.ownerLabel, t.assignee].filter(Boolean).join(' · '), due: day(t.dueOn), status: STATUS[t.status] ?? 'Pending', note: noteOf(t), canDone: t.canComplete })),
        onDone: async (taskId) => {
          const t = m?.journey.tasks.find((x) => x.id === taskId);
          if (!t || !m) return;
          try {
            await write('POST', `/lifecycle/tasks/${encodeURIComponent(taskId)}/complete`, { version: t.version });
            toast({ tone: 'success', title: `${t.title} done for ${m.journey.person}` });
          } catch (e) {
            toast({ tone: 'error', title: `${t.title} is not done`, description: (e as Error).message });
          }
        },
      }}
    />
  );
}
