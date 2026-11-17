'use client';

import { useParams, useRouter } from 'next/navigation';
import { TestBuilderScreen, type BuilderTestView, type ProctorMode } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState, testRows, type ExamListPage } from '../../../../../../../lib/yx-assessments';
import { useYxPermissions } from '../../../../../../../lib/yx-org';

// Assessments AS-2 › Test builder (PRC-04, answers 2007, 2008): one test with its sections, the blueprint of its pools,
// timing, scoring, the proctoring mode, the pre-publish checklist and the approver a big test needs (asmt.high_stakes).
// Sections and questions are still edited on the older editor. The API checks every call (locked tests, four eyes).
export default function YxTestBuilderPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const test = useApi<BuilderTestView>(`/asmt/tests/${id}`);
  const list = useApi<ExamListPage>('/exams?pageSize=100');
  const defaults = useApi<{ proctorMode: ProctorMode; highStakes: number }>('/asmt/tests/defaults');
  const write = useApiWrite();
  const perms = useYxPermissions();
  const open = (other: string) => router.push(`${BANK_BASE}/tests/${other}`);
  const t = `/asmt/tests/${id}`;
  return (
    <TestBuilderScreen
      live={{
        state: loadState(test),
        onRetry: () => void test.refetch(),
        test: test.data ?? null,
        tests: testRows(list.data),
        defaultMode: defaults.data?.proctorMode ?? 'ai',
        onNew: async (title) => open((await write<{ id: string }>('POST', '/exams', { title })).id),
        onCopy: async (other) => open((await write<{ id: string }>('POST', `/exams/${other}/duplicate`)).id),
        onOpen: open,
        onSaveDetails: async (d) => void (await write('PATCH', `/exams/${id}`, { title: d.title, durationMinutes: d.durationMinutes, passCriteriaPercent: d.passMark, expectedCandidates: d.expectedCandidates })),
        onSetMode: async (mode) => void (await write('PUT', `${t}/proctoring-mode`, { mode })),
        // Answer 2154: a section's cut-off (the older section route, which locks a published or started test).
        onSetCutoff: async (sectionId, percent) => void (await write('PATCH', `/exams/${id}/sections/${sectionId}`, { cutoffPercent: percent })),
        onEditSections: () => router.push(`/v2/exams/${id}/edit`),
        onRequestApproval: async () => void (await write('POST', `${t}/approval/request`)),
        onApprove: async () => void (await write('POST', `${t}/approval/approve`)),
        onPublish: async () => void (await write('POST', `/exams/${id}/publish`)),
        // AS-6 part 2 (answer 2272): an AI-allowed test.
        onSetAiAllowed: async (allowed) => void (await write('PUT', `${t}/ai-allowed`, { allowed })),
        // Answer 2267: proctors (the monitoring socket needs exam:manage) open the test's live console.
        onLiveConsole: perms.has('exam:manage' as never) ? () => router.push(`${BANK_BASE}/tests/${id}/live`) : undefined,
      }}
    />
  );
}
