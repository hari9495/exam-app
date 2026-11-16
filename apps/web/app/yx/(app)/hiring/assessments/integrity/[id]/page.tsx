'use client';

import { useParams, useRouter } from 'next/navigation';
import { IncidentWorkspaceScreen, type LiveIncident } from '@yukthix/ui/assessments';
import { useAuth } from '../../../../../../../lib/auth-context';
import { decodeJwtPayload } from '../../../../../../../lib/jwt';
import { useApi, useApiWrite } from '../../../../../../../lib/yx-hiring';
import { loadState } from '../../../../../../../lib/yx-assessments';

// Assessments AS-5 › Integrity review › one incident (PRC-17, answers 2006, 2008): what the analysis found, the session
// events, and the verdict with a reason. Invalidating the attempt asks for the second factor (apiFetch asks and retries)
// and waits for the second reviewer the first one chose; only that person confirms or sends it back.
export default function YxIncidentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const me = String(decodeJwtPayload(accessToken ?? '')?.sub ?? '');
  const incident = useApi<LiveIncident>(`/asmt/integrity/${id}`);
  const reviewers = useApi<{ id: string; name: string }[]>('/asmt/integrity/reviewers');
  const write = useApiWrite();
  const post = async (path: string, body?: unknown) => {
    await write('POST', `/asmt/integrity/${id}${path}`, body);
  };
  return (
    <IncidentWorkspaceScreen
      live={{
        state: loadState(incident),
        onRetry: () => void incident.refetch(),
        incident: incident.data ?? null,
        me,
        reviewers: reviewers.data ?? [],
        onTake: () => post('/take'),
        onVerdict: (input) => post('/verdict', input),
        onInvalidate: (input) => post('/invalidate', input),
        onSecondReview: (input) => post('/second-review', input),
        onBack: () => router.push('/yx/hiring/assessments/integrity'),
      }}
    />
  );
}
