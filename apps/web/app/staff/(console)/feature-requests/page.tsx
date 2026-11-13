'use client';

import { FeatureRequestsConsoleScreen, type AssistantReview, type FeatureRequestRow } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Feature requests (Ask YukthiX, answer 2105): requests sent from the assistant, grouped with how many
// companies asked; Planned, Not now, Done (Done tells everyone who asked). The Ask YukthiX review on the second tab.
// The help centre writers' key (platform.helpcentre.write); every decision is in the platform audit log.
export default function ConsoleFeatureRequestsPage() {
  const requests = useConsole<FeatureRequestRow[]>('/feature-requests');
  const review = useConsole<AssistantReview>('/assistant/review?days=30');
  const write = useConsoleWrite();
  return (
    <FeatureRequestsConsoleScreen
      state={loadState(requests)}
      onRetry={() => void requests.refetch()}
      requests={requests.data ?? []}
      review={review.data ?? null}
      onDecide={(id, change) => write(`/feature-requests/${encodeURIComponent(id)}`, 'PUT', change)}
    />
  );
}
