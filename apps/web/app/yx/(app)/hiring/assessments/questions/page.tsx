'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { QuestionBankScreen, type BankRow, type BankSettings, type ItemStats } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState } from '../../../../../../lib/yx-assessments';
import { apiFetch, apiFetchBlob } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';

// Assessments AS-1 › Question bank (PRC-01, answers 2009, 2010, 2017): the designed bank with the company's questions,
// their review state, versions and languages. question_bank:manage on the API (TODO(AS-0): asmt.bank.manage).
// Hire › Assessments (answer 2001). Import and Draft with AI are here (answer 2121): every question lands as a draft in
// the review queue; the older /v2/questions page redirects here.
export default function YxQuestionBankPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const rows = useApi<BankRow[]>('/question-bank/questions');
  const settings = useApi<BankSettings>('/question-bank/settings');
  const calibration = useApi<{ questionId: string; responses: number; percentCorrect: number }[]>('/analytics/questions/difficulty-calibration');
  const write = useApiWrite();
  const queryClient = useQueryClient();
  return (
    <QuestionBankScreen
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        stats: Object.fromEntries((calibration.data ?? []).map((c) => [c.questionId, { responses: c.responses, percentCorrect: c.percentCorrect }])),
        settings: settings.data ?? null,
        onOpen: (id) => router.push(`${BANK_BASE}/questions/${id}`),
        onImport: async (file) => {
          const form = new FormData();
          form.append('file', file);
          const r = (await apiFetch('/questions/bulk-upload', { method: 'POST', body: form }, accessToken ?? undefined)) as { created: unknown[]; errors: { row: number; message: string }[] };
          await queryClient.invalidateQueries({ queryKey: ['api'] });
          return { created: r.created.length, errors: r.errors };
        },
        onDownloadTemplate: async () => {
          const { blob, filename } = await apiFetchBlob('/questions/bulk-upload/template', {}, accessToken ?? undefined);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename ?? 'question-bulk-upload-template.xlsx';
          a.click();
          URL.revokeObjectURL(a.href);
        },
        onDraftWithAi: (input) => write('POST', '/questions/ai-generate', input),
        onSubmit: (id) => write('POST', `/question-bank/questions/${id}/submit`),
        onRetire: (id) => write('POST', `/questions/${id}/archive`),
        onRestore: (id) => write('POST', `/question-bank/questions/${id}/restore`),
        onLoadStats: (id) => apiFetch(`/analytics/questions/${id}`, {}, accessToken ?? undefined) as Promise<ItemStats>,
      }}
    />
  );
}
