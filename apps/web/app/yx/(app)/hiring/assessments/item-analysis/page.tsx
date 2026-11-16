'use client';

import { useRouter } from 'next/navigation';
import { ItemAnalysisScreen, type BankSettings, type ItemStats } from '@yukthix/ui/assessments';
import { useApi } from '../../../../../../lib/yx-hiring';
import { BANK_BASE, itemRows } from '../../../../../../lib/yx-assessments';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';

// Assessments AS-1 › Item analysis (PRC-05): the item statistics the older engine computes (from 20 answers), with the
// company's provisional band (asmt.item_stats.provisional_answers, default 200).
export default function YxItemAnalysisPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const calibration = useApi<Parameters<typeof itemRows>[0]>('/analytics/questions/difficulty-calibration');
  const flagged = useApi<Parameters<typeof itemRows>[1]>('/analytics/questions/flagged');
  const settings = useApi<BankSettings>('/question-bank/settings');
  return (
    <ItemAnalysisScreen
      live={{
        state: calibration.isError || flagged.isError ? 'error' : calibration.isLoading || flagged.isLoading ? 'loading' : 'ready',
        onRetry: () => void Promise.all([calibration.refetch(), flagged.refetch()]),
        rows: itemRows(calibration.data ?? [], flagged.data ?? []),
        provisionalAnswers: settings.data?.provisionalAnswers ?? 200,
        onLoadItem: (id) => apiFetch(`/analytics/questions/${id}`, {}, accessToken ?? undefined) as Promise<ItemStats>,
        onOpenQuestion: (id) => router.push(`${BANK_BASE}/questions/${id}`),
      }}
    />
  );
}
