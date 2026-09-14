import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the bulk candidate-email endpoints. Both send routes enqueue a background batch
// and return a batchId; useBulkEmailBatch polls GET :batchId for live {sent, skipped, failed} progress.
export interface BulkEmailCompose {
  templateId?: string | null;
  subject: string;
  body: string;
  senderAddressId?: string;
}

export interface EnqueueBulkEmailResult {
  batchId: string;
  total: number;
  unresolvedCandidateIds: string[];
}

export interface BulkEmailBatch {
  id: string;
  status: 'pending' | 'processing' | 'completed';
  total: number;
  sent: number;
  skipped: number;
  failed: number;
}

export function useSendBulkEmailByEntries() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (payload: BulkEmailCompose & { entryIds: string[] }) =>
      apiFetch('/bulk-candidate-email/by-entries', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined) as Promise<EnqueueBulkEmailResult>,
  });
}

export function useSendBulkEmailByCandidates() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (payload: BulkEmailCompose & { candidateIds: string[] }) =>
      apiFetch('/bulk-candidate-email/by-candidates', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined) as Promise<EnqueueBulkEmailResult>,
  });
}

export function useBulkEmailBatch(batchId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<BulkEmailBatch>({
    queryKey: ['bulk-email-batch', batchId],
    queryFn: () => apiFetch(`/bulk-candidate-email/${batchId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && batchId),
    // Poll while the batch is still running; stop once it's completed.
    refetchInterval: (query) => (query.state.data && query.state.data.status === 'completed' ? false : 1500),
  });
}
