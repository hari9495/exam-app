'use client';

import { useState } from 'react';
import { IntegrityReportsScreen, type LiveIntegrityReportData } from '@yukthix/ui/assessments';
import { apiFetchBlob } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useApi } from '../../../../../../lib/yx-hiring';
import { saveBlob } from '../../../../../../lib/yx-pay';
import { loadState, type ExamListPage } from '../../../../../../lib/yx-assessments';

// Assessments AS-5 part 3 › Integrity reports (PRC-20): a test's collusion clusters (identical wrong answers), code
// similarity pairs from the integrity analysis, and how far two markers agree. For the people who review integrity;
// the export is recorded with who took it.
export default function YxIntegrityReportsPage() {
  const { accessToken } = useAuth();
  const tests = useApi<ExamListPage>('/exams?pageSize=100');
  const [picked, setPicked] = useState<string | null>(null);
  const list = (tests.data?.data ?? []).map((t) => ({ id: t.id, title: t.title }));
  const examId = picked ?? list[0]?.id ?? null;
  const view = useApi<LiveIntegrityReportData>(examId ? `/asmt/integrity-reports/${examId}` : null);
  return (
    <IntegrityReportsScreen
      live={{
        state: loadState({ isLoading: tests.isLoading || (Boolean(examId) && view.isLoading), isError: tests.isError || view.isError }),
        onRetry: () => void view.refetch(),
        tests: list,
        onTest: setPicked,
        data: view.data ?? null,
        onExport: async () => {
          const { blob, filename } = await apiFetchBlob(`/asmt/integrity-reports/${examId}/export`, {}, accessToken ?? undefined);
          saveBlob(blob, filename ?? 'integrity-reports.xlsx');
        },
      }}
    />
  );
}
