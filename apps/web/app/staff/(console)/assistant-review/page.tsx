'use client';

import { AssistantReviewConsoleScreen, type AssistantReview } from '@yukthix/ui/console';
import { loadState, useConsole } from '../../../../lib/yx-console';

// Console › Ask YukthiX review (answer 2132): how the help assistant's answers are doing, on its own page so the help
// centre writers (platform.helpcentre.write) reach it without the feature-requests key. The API takes either key.
export default function ConsoleAssistantReviewPage() {
  const review = useConsole<AssistantReview>('/assistant/review?days=30');
  return <AssistantReviewConsoleScreen state={loadState(review)} onRetry={() => void review.refetch()} review={review.data ?? null} />;
}
