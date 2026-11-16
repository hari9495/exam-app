'use client';

import { useRouter } from 'next/navigation';
import { QuestionBankScreen, type BankRow, type BankSettings, type ItemStats } from '@yukthix/ui/assessments';
import { useApi, useApiWrite } from '../../../../../../lib/yx-hiring';
import { BANK_BASE, loadState } from '../../../../../../lib/yx-assessments';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';

// Assessments AS-1 › Question bank (PRC-01, answers 2009, 2010, 2017): the designed bank with the company's questions,
// their review state, versions and languages. question_bank:manage on the API (TODO(AS-0): asmt.bank.manage).
// Not in the menu until AS-0 merges. Import and Draft with AI stay on the older page for now (they land as drafts here).
export default function YxQuestionBankPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const rows = useApi<BankRow[]>('/question-bank/questions');
  const settings = useApi<BankSettings>('/question-bank/settings');
  const calibration = useApi<{ questionId: string; responses: number; percentCorrect: number }[]>('/analytics/questions/difficulty-calibration');
  const write = useApiWrite();
  return (
    <QuestionBankScreen
      live={{
        state: loadState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        stats: Object.fromEntries((calibration.data ?? []).map((c) => [c.questionId, { responses: c.responses, percentCorrect: c.percentCorrect }])),
        settings: settings.data ?? null,
        onOpen: (id) => router.push(`${BANK_BASE}/questions/${id}`),
        onImport: () => router.push('/v2/questions'),
        onDraftWithAi: () => router.push('/v2/questions'),
        onSubmit: (id) => write('POST', `/question-bank/questions/${id}/submit`),
        onRetire: (id) => write('POST', `/questions/${id}/archive`),
        onLoadStats: (id) => apiFetch(`/analytics/questions/${id}`, {}, accessToken ?? undefined) as Promise<ItemStats>,
      }}
    />
  );
}
