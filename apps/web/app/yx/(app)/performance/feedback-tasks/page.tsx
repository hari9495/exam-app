'use client';

import { useRouter } from 'next/navigation';
import { FeedbackTasksScreen, type FeedbackTask } from '@yukthix/ui/performance';
import { loadState } from '../../../../../lib/yx-org';
import { usePerf } from '../../../../../lib/yx-performance';

// Feedback I was asked for (PRF-07, M06 batch PM5): colleagues' reviews I am an approved nominee on.
export default function YxFeedbackTasksPage() {
  const router = useRouter();
  const tasks = usePerf<FeedbackTask[]>('/my-feedback-tasks');
  return (
    <FeedbackTasksScreen
      state={loadState(tasks)}
      onRetry={() => void tasks.refetch()}
      tasks={tasks.data ?? []}
      onOpen={(reviewId) => router.push(`/yx/performance/feedback-tasks/${encodeURIComponent(reviewId)}`)}
    />
  );
}
