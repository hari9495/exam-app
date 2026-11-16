'use client';

import { useRouter } from 'next/navigation';
import { TestBuilderScreen, type ProctorMode } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState, testRows, type ExamListPage } from '../../../../../../lib/yx-assessments';

// Assessments AS-2 › Tests (PRC-04, start): the company's tests to open or copy, and a new test (proctored in the
// company's default mode, Settings 6.5). Test writers only (the API checks every call).
export default function YxTestsPage() {
  const router = useRouter();
  const list = useApi<ExamListPage>('/exams?pageSize=100');
  const defaults = useApi<{ proctorMode: ProctorMode; highStakes: number }>('/asmt/tests/defaults');
  const write = useApiWrite();
  const open = (id: string) => router.push(`${BANK_BASE}/tests/${id}`);
  return (
    <TestBuilderScreen
      live={{
        state: loadState(list),
        onRetry: () => void list.refetch(),
        test: null,
        tests: testRows(list.data),
        defaultMode: defaults.data?.proctorMode ?? 'ai',
        onNew: async (title) => open((await write<{ id: string }>('POST', '/exams', { title })).id),
        onCopy: async (id) => open((await write<{ id: string }>('POST', `/exams/${id}/duplicate`)).id),
        onOpen: open,
        onSaveDetails: async () => {},
        onSetMode: async () => {},
        onEditSections: () => {},
        onRequestApproval: async () => {},
        onApprove: async () => {},
        onPublish: async () => {},
      }}
    />
  );
}
