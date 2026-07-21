import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { WalkInExamOption } from '../types';

export function useWalkInExams(orgSlug: string) {
  return useQuery<WalkInExamOption[]>({
    queryKey: ['walk-in-exams', orgSlug],
    queryFn: () => apiFetch(`/public/walk-in/${orgSlug}/exams`),
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
