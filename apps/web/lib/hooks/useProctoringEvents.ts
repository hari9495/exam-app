import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { ProctoringEvent } from '../types';

export function useProctoringEvents(attemptId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<ProctoringEvent[]>({
    queryKey: ['proctoring-events', attemptId],
    queryFn: () => apiFetch(`/attempts/${attemptId}/proctoring-events`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && attemptId),
  });
}
