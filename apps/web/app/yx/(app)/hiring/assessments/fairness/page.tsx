'use client';

import { useState } from 'react';
import { FairnessScreen, type FairnessData } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { loadState, type ExamListPage } from '../../../../../../lib/yx-assessments';

// Assessments AS-6 › Fairness (answers 2019, 2165): a test's pass rates per group from voluntary answers only, hidden
// below the company's least group size; a finding opens a review (test writers). Counts only, never who.
export default function YxFairnessPage() {
  const perms = useYxPermissions();
  const tests = useApi<ExamListPage>('/exams?pageSize=100');
  const [picked, setPicked] = useState<string | null>(null);
  const list = (tests.data?.data ?? []).map((t) => ({ id: t.id, title: t.title }));
  const examId = picked ?? list[0]?.id ?? null;
  const view = useApi<FairnessData>(examId ? `/asmt/fairness/${examId}` : null);
  const write = useApiWrite();
  const writer = perms.has('asmt.test.manage') || perms.has('exam:manage');
  return (
    <FairnessScreen
      live={{
        state: loadState({ isLoading: tests.isLoading || (Boolean(examId) && view.isLoading), isError: tests.isError || view.isError }),
        onRetry: () => void view.refetch(),
        data: view.data ?? null,
        tests: list,
        onTest: setPicked,
        ...(writer
          ? {
              onOpenReview: async () => void (await write('POST', `/asmt/fairness/${examId}/review`)),
              onDecide: async (id, decision, reason) => void (await write('POST', `/asmt/fairness/reviews/${id}/decide`, { decision, reason })),
            }
          : {}),
      }}
    />
  );
}
