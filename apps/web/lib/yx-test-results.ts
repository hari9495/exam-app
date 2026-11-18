import { useRouter } from 'next/navigation';
import type { CompareResult, LiveTestResults, TestResultRow, TestResultsSummary } from '@yukthix/ui/assessments';
import { apiFetch, apiFetchBlob } from './api-client';
import { useAuth } from './auth-context';
import { useApi, useApiWrite } from './yx-hiring';
import { saveBlob } from './yx-pay';
import { BANK_BASE } from './yx-assessments';

type Compared = { invitationId: string; candidateName: string; percentage: number | null; passFail: string | null; integrityAnalysis: { level?: string } | null; sectionScores: { title: string; score: number; maxScore: number }[] };

/**
 * Answer 2437: a test's results for the Results tab and the readers' Test results page. Null when `enabled` is false.
 * Release is offered with the test-writing or evaluating key only (the API checks it again, with a step-up).
 */
export function useTestResults(examId: string | null, enabled: boolean, canRelease = true): LiveTestResults | null {
  const router = useRouter();
  const { accessToken } = useAuth();
  const write = useApiWrite();
  const on = enabled && examId ? examId : null;
  const rows = useApi<TestResultRow[]>(on && `/exams/${on}/results`);
  const summary = useApi<TestResultsSummary>(on && `/exams/${on}/results/summary`);
  if (!on) return null;
  return {
    state: rows.isError ? 'error' : rows.isLoading ? 'loading' : 'ready',
    onRetry: () => void Promise.all([rows.refetch(), summary.refetch()]),
    summary: summary.data ?? null,
    rows: rows.data ?? [],
    onOpen: (r) => router.push(`${BANK_BASE}/reports/${on}/${r.candidateId}`),
    onExport: async (format, ids) => {
      const q = new URLSearchParams({ format, ...(ids.length ? { invitationIds: ids.join(',') } : {}) });
      const { blob, filename } = await apiFetchBlob(`/exams/${on}/results/export?${q}`, {}, accessToken ?? undefined);
      saveBlob(blob, filename ?? `test-results.${format}`);
    },
    onRelease: canRelease ? (notify) => write<{ released: number }>('POST', `/exams/${on}/results/release`, { notify }) : undefined,
    onCompare: async (ids): Promise<CompareResult[]> => {
      const list = (await apiFetch(`/exams/${on}/candidates/compare?invitationIds=${ids.join(',')}`, {}, accessToken ?? undefined)) as Compared[];
      return list.map((c) => ({
        invitationId: c.invitationId,
        candidateName: c.candidateName,
        percentage: c.percentage,
        passFail: c.passFail,
        integrityLevel: c.integrityAnalysis?.level ?? null,
        sections: c.sectionScores.map((x) => ({ title: x.title, percentage: x.maxScore ? (x.score / x.maxScore) * 100 : null })),
      }));
    },
  };
}
