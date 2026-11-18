'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { TestBuilderScreen, type BuilderTestView, type ProctorMode, type QuestionChoice } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState, testRows, type ExamListPage } from '../../../../../../../lib/yx-assessments';
import { useYxPermissions } from '../../../../../../../lib/yx-org';
import { apiFetch } from '../../../../../../../lib/api-client';
import { useAuth } from '../../../../../../../lib/auth-context';
import { useTestResults } from '../../../../../../../lib/yx-test-results';

// Assessments AS-2 › Test builder (PRC-04, answers 2007, 2008): one test with its sections, the blueprint of its pools,
// timing, scoring, the proctoring mode, the pre-publish checklist and the approver a big test needs (asmt.high_stakes).
// Sections, their questions and pool skills are edited here (answer 2284). The API checks every call (locked tests, four eyes).
export default function YxTestBuilderPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const test = useApi<BuilderTestView>(`/asmt/tests/${id}`);
  const list = useApi<ExamListPage>('/exams?pageSize=100');
  const defaults = useApi<{ proctorMode: ProctorMode; highStakes: number }>('/asmt/tests/defaults');
  const write = useApiWrite();
  const { accessToken } = useAuth();
  const apiGet = <T,>(path: string) => apiFetch(path, {}, accessToken ?? undefined) as Promise<T>;
  // Answer 2285: skill names readable with the tests key.
  const skills = useApi<{ id: string; name: string }[]>('/asmt/tests/skills');
  const perms = useYxPermissions();
  const open = (other: string) => router.push(`${BANK_BASE}/tests/${other}`);
  const t = `/asmt/tests/${id}`;
  // Answer 2437: the Results tab, for people who read results, once the test is out of draft.
  const results = useTestResults(id, (perms.has('results:view' as never) || perms.has('asmt.results.view' as never)) && Boolean(test.data && test.data.status !== 'draft'));
  const tab = useSearchParams()?.get('tab') === 'results' ? 'results' : 'build';
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
        // Answer 2284: the Sections step's question and skills pickers (the older editor is retired).
        onLoadChoices: (sectionId, f) => {
          const q = new URLSearchParams({ ...(f.search.trim() ? { search: f.search.trim() } : {}), ...(f.difficulty ? { difficulty: f.difficulty } : {}), ...(f.tagId ? { tagId: f.tagId } : {}) });
          return apiGet<{ chosen: QuestionChoice[]; choices: QuestionChoice[] }>(`${t}/sections/${sectionId}/question-choices${q.size ? `?${q}` : ''}`);
        },
        onSetQuestions: async (sectionId, questionIds) => {
          // A pool section becomes a section of chosen questions first.
          if (test.data?.sections.find((s) => s.id === sectionId)?.mode === 'pool') await write('PATCH', `/exams/${id}/sections/${sectionId}`, { selectionMode: 'fixed' });
          await write('PUT', `/exams/${id}/sections/${sectionId}/questions`, { questionIds });
        },
        onSetPool: async (sectionId, v) => void (await write('PATCH', `/exams/${id}/sections/${sectionId}`, { selectionMode: 'pool', poolTagIds: v.tagIds, poolSize: v.poolSize, ...(v.poolDifficulty ? { poolDifficulty: v.poolDifficulty } : {}) })),
        skills: skills.data?.map((k) => ({ id: k.id, name: k.name })),
        // Answer 2153: the designed Sections and Blueprint steps edit sections on the existing routes.
        onAddSection: async (title) => void (await write('POST', `/exams/${id}/sections`, { title })),
        onSaveSection: async (sectionId, v) => void (await write('PATCH', `/exams/${id}/sections/${sectionId}`, v)),
        onDeleteSection: async (sectionId) => void (await write('DELETE', `/exams/${id}/sections/${sectionId}`)),
        onSavePool: async (sectionId, v) => void (await write('PATCH', `/exams/${id}/sections/${sectionId}`, { poolSize: v.poolSize, ...(v.poolDifficulty ? { poolDifficulty: v.poolDifficulty } : {}) })),
        onRequestApproval: async () => void (await write('POST', `${t}/approval/request`)),
        onApprove: async () => void (await write('POST', `${t}/approval/approve`)),
        onPublish: async () => void (await write('POST', `/exams/${id}/publish`)),
        // AS-6 part 2 (answer 2272): an AI-allowed test.
        onSetAiAllowed: async (allowed) => void (await write('PUT', `${t}/ai-allowed`, { allowed })),
        // Answer 2267: proctors (the monitoring socket needs exam:manage) open the test's live console.
        // Answer 2287: Restore an archived test (the API checks the key and audits it).
        // Answer 2307: with a fairness finding still open the screen asks why; the API checks it again.
        onRestore: async (reason) => void (await write('POST', `${t}/restore`, reason ? { reason } : undefined)),
        onLiveConsole: perms.has('exam:manage' as never) ? () => router.push(`${BANK_BASE}/tests/${id}/live`) : undefined,
        results: results ?? undefined,
        tab,
      }}
    />
  );
}
