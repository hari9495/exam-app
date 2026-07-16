import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export function useUnblockAttempt() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (attemptId: string) => apiFetch(`/attempts/${attemptId}/unblock`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
  });
}
