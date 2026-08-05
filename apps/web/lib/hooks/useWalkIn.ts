import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { WalkInExamOption } from '../types';

export function useWalkInExams(orgSlug: string, groupId?: string | null) {
  return useQuery<WalkInExamOption[]>({
    queryKey: ['walk-in-exams', orgSlug, groupId ?? null],
    queryFn: () => apiFetch(`/public/walk-in/${orgSlug}/exams${groupId ? `?group=${groupId}` : ''}`),
  });
}

interface WalkInRegisterInput {
  examId: string;
  name: string;
  email: string;
  phone?: string;
}

export function useWalkInRegister(orgSlug: string) {
  return useMutation({
    mutationFn: (input: WalkInRegisterInput): Promise<{ token: string }> =>
      apiFetch(`/public/walk-in/${orgSlug}/register`, { method: 'POST', body: JSON.stringify(input) }),
  });
}
