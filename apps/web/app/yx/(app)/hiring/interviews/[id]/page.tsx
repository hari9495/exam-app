'use client';

import { useParams, useRouter } from 'next/navigation';
import { ScorecardScreen, type InterviewView, type LiveScorecard } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../../lib/yx-org';
import { apiFetch } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../../lib/yx-hiring';

// Hiring › one interview (HIR-07): the designed ScorecardScreen with `live`. A panellist fills their own scorecard (a
// draft only they see; submitted = read-only, audited); recruiters and the job's hiring manager read every submitted
// one (D7). Recruiters resend or cancel the interview here (moved from the HIR-05 application, answer 301). The API
// refuses every write while acting for someone else.
export default function YxInterviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const perms = useYxPermissions();
  const { accessToken, impersonating, actingSuperAdmin } = useAuth();
  const view = useHiring<InterviewView>(`/interviews/${encodeURIComponent(id)}`);
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const status = (view.error as { status?: number } | null)?.status;
  const state: LiveScorecard['state'] = view.isError ? (status === 403 ? 'denied' : status === 404 || status === 400 ? 'not-found' : 'error') : view.data ? 'ready' : 'loading';
  const v = view.data;
  return (
    <ScorecardScreen
      live={{
        state,
        onRetry: () => void view.refetch(),
        view: v ?? null,
        canManage: perms.has('pipeline:manage') && !impersonating && !actingSuperAdmin,
        onBack: () => router.push('/yx/hiring/interviews'),
        onOpenCandidate: () => v && router.push(`/yx/hiring/candidates/${encodeURIComponent(v.interview.candidateId)}`),
        onResume: v
          ? async () => {
              const { url } = (await apiFetch(`/candidates/${v.interview.candidateId}/resume`, {}, accessToken ?? undefined)) as { url: string };
              window.open(url, '_blank', 'noopener');
            }
          : undefined,
        onSave: (input) => write('PUT', `/interviews/${id}/scorecard`, input),
        onSubmit: (input) => write('POST', `/interviews/${id}/scorecard/submit`, input),
        onResendInterview: () => apiWrite('POST', `/interviews/${id}/send`),
        onCancelInterview: () => apiWrite('POST', `/interviews/${id}/cancel`),
        // Answer 322: append-only comments under a submitted scorecard; one key per Post press (a retry is the same comment).
        onComment: (scorecardId, body) => write('POST', `/interviews/${id}/scorecards/${encodeURIComponent(scorecardId)}/comments`, { body, requestId: crypto.randomUUID() }),
      }}
    />
  );
}
