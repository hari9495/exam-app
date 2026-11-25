'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { MyChecklistTasks } from '@yukthix/ui/frame';
import type { JourneyTask, MyTasks, TaskActions } from '@yukthix/ui/lifecycle';
import { todayIst, loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useLife, useTaskActions } from '../../../../../lib/yx-lifecycle';

// People › My checklist tasks (PPL-47, designed 20 Oct 2026; LIFE-1.07, founder D1): tasks given to me or my team (IT,
// Admin, Finance, managers) for joiners, leavers and life events, by person. Desk requests close themselves when the
// desk delivers. Each done task is a toast that names the task and the person.
export default function YxMyTasksPage() {
  const router = useRouter();
  const { toast } = useToast();
  const tasks = useLife<MyTasks>('/lifecycle/my-tasks');
  const perms = useYxPermissions();
  const canManage = perms.has('lifecycle.onboarding.manage');
  const actions = useTaskActions();
  const said = (title: (t: JourneyTask) => string) => (t: JourneyTask) => toast({ tone: 'success', title: title(t) });
  const withToasts: TaskActions = {
    onComplete: async (t, payload) => (await actions.onComplete(t, payload), said((x) => `${x.title} done${x.person ? ` for ${x.person}` : ''}`)(t)),
    onSkip: async (t, reason) => (await actions.onSkip(t, reason), said((x) => `${x.title} skipped${x.person ? ` for ${x.person}` : ''}`)(t)),
    // PPL-47: HR uploads the document or issues the letter from here, as on the journey record.
    ...(canManage
      ? {
          onUpload: async (t: JourneyTask, file: File) => (await actions.onUpload!(t, file), said((x) => `${x.title}: file uploaded for ${x.person ?? 'the joiner'}`)(t)),
          ...(perms.has('letter.issue') ? { onPreviewLetter: actions.onPreviewLetter, onIssueLetter: async (t: JourneyTask) => (await actions.onIssueLetter!(t), said((x) => `${x.title}: letter issued to ${x.person ?? 'the joiner'}`)(t)) } : {}),
        }
      : {}),
  };
  return (
    <MyChecklistTasks
      tasks={tasks.data?.tasks ?? []}
      today={new Date(`${tasks.data?.today ?? todayIst()}T00:00:00`)}
      state={loadState(tasks)}
      onRetry={() => void tasks.refetch()}
      actions={withToasts}
      canManage={canManage}
      onOpen={(journeyId) => router.push(`/yx/people/onboarding/${encodeURIComponent(journeyId)}`)}
    />
  );
}
