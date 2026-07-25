import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export function useUnblockAttempt() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (attemptId: string) => apiFetch(`/attempts/${attemptId}/unblock`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
  });
}

export function useBypassProctoring() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: ({ attemptId, reason }: { attemptId: string; reason: string }) =>
      apiFetch(`/attempts/${attemptId}/proctoring-bypass`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken ?? undefined),
  });
}

export function useRevokeProctoringBypass() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/attempts/${attemptId}/proctoring-bypass/revoke`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
  });
}
