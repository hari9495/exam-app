'use client';

import { useParams, useRouter } from 'next/navigation';
import { InterviewScreen, type InterviewView } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../../lib/yx-org';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useHiring, useHiringWrite } from '../../../../../../lib/yx-hiring';

// Hiring › one interview (M10 batch AT5, D7): the panel, the résumé, your scorecard, and colleagues' scorecards once
// yours is in.
export default function YxInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const view = useHiring<InterviewView>(`/interviews/${encodeURIComponent(id)}`);
  const write = useHiringWrite();
  return (
    <InterviewScreen
      state={loadState(view)}
      onRetry={() => void view.refetch()}
      view={view.data ?? null}
      onBack={() => router.push('/yx/hiring/interviews')}
      onResume={view.data ? async () => {
        const { url } = (await apiFetch(`/candidates/${view.data!.interview.candidateId}/resume`, {}, accessToken ?? undefined)) as { url: string };
        window.open(url, '_blank', 'noopener');
      } : undefined}
      onSave={(input) => write('PUT', `/interviews/${id}/scorecard`, input)}
      onSubmit={(input) => write('POST', `/interviews/${id}/scorecard/submit`, input)}
    />
  );
}
