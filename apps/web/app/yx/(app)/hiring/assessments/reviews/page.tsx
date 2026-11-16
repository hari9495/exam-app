'use client';

import { useRouter } from 'next/navigation';
import { QuestionReviewQueueScreen, type ReviewChange, type ReviewTranslation } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState } from '../../../../../../lib/yx-assessments';

// Assessments AS-1 › Question review (PRC-03, answer 2009): new questions, changes and translations other people
// submitted. The author never sees their own; a second approver is a third person (the API and the database refuse both).
export default function YxQuestionReviewPage() {
  const router = useRouter();
  const queue = useApi<{ changes: ReviewChange[]; translations: ReviewTranslation[] }>('/question-bank/reviews');
  const write = useApiWrite();
  return (
    <QuestionReviewQueueScreen
      live={{
        state: loadState(queue),
        onRetry: () => void queue.refetch(),
        changes: queue.data?.changes ?? [],
        translations: queue.data?.translations ?? [],
        onOpenQuestion: (id) => router.push(`${BANK_BASE}/questions/${id}`),
        onApprove: (c, comments) => write('POST', `/question-bank/reviews/${c.id}/approve`, { rowVersion: c.rowVersion, comments }),
        onRequestChanges: (c, note, comments) => write('POST', `/question-bank/reviews/${c.id}/changes`, { rowVersion: c.rowVersion, note, comments }),
        onClearDuplicate: (c) => write('POST', `/question-bank/reviews/${c.id}/not-duplicate`, { rowVersion: c.rowVersion }),
        onDecideTranslation: (t, approve, note) => write('POST', `/question-bank/translations/${t.id}/decide`, { rowVersion: t.rowVersion, approve, ...(note ? { note } : {}) }),
      }}
    />
  );
}
