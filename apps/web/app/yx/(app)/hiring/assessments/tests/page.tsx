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
  const defaults = useApi<{ proctorMode: ProctorMode; highStakes: number; aiDrafts?: boolean }>('/asmt/tests/defaults');
  // Answer 2151: the company's skills to map a job description to (question tags).
  const tags = useApi<{ id: string; name: string }[]>(defaults.data?.aiDrafts ? '/tags' : null);
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
        ...(defaults.data?.aiDrafts
          ? {
              skills: (tags.data ?? []).map((t) => ({ id: t.id, name: t.name })),
              onProposeFromJd: (jobDescription: string) => write<{ level: 'easy' | 'medium' | 'hard'; skills: { name: string; tagId: string | null; percent: number }[] }>('POST', '/asmt/tests/from-job-description/propose', { jobDescription }),
              onCreateFromJd: async (d: { title: string; level: 'easy' | 'medium' | 'hard'; total: number; skills: { tagId: string; percent: number }[] }) => open((await write<{ id: string }>('POST', '/asmt/tests/from-job-description', d)).id),
            }
          : {}),
        onSaveDetails: async () => {},
        onSetMode: async () => {},
        onRequestApproval: async () => {},
        onApprove: async () => {},
        onPublish: async () => {},
      }}
    />
  );
}
