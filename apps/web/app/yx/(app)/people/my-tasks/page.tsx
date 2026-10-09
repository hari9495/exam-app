'use client';

import { useRouter } from 'next/navigation';
import { MyTasksScreen, type MyTasks } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useTaskActions } from '../../../../../lib/yx-lifecycle';

// People › My checklist tasks (LIFE-1.07; founder D1): onboarding tasks given to me or my team (IT, Admin, Finance,
// managers). Desk requests close themselves when the desk delivers.
export default function YxMyTasksPage() {
  const router = useRouter();
  const tasks = useLife<MyTasks>('/lifecycle/my-tasks');
  const actions = useTaskActions();
  return <MyTasksScreen state={loadState(tasks)} onRetry={() => void tasks.refetch()} data={tasks.data ?? null} {...actions} onOpen={(journeyId) => router.push(`/yx/people/onboarding/${encodeURIComponent(journeyId)}`)} />;
}
