import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { WalkInExamsResponse } from '../types';

// The endpoint now returns { exams, applyConsentText, applyConsentVersion } (Zoho #21) instead
// of a bare array -- callers read exams via `data.exams` and can also surface the consent text.
export function useWalkInExams(orgSlug: string, groupId?: string | null) {
  return useQuery<WalkInExamsResponse>({
    queryKey: ['walk-in-exams', orgSlug, groupId ?? null],
    queryFn: () => apiFetch(`/public/walk-in/${orgSlug}/exams${groupId ? `?group=${groupId}` : ''}`),
  });
}

interface WalkInRegisterInput {
  examId: string;
  name: string;
  email: string;
  phone?: string;
  consentAccepted?: boolean;
  /** AS-3 (PRC-29): a campus drive's fields. */
  campus?: { institutionId: string; rollNumber: string; branch?: string; graduationYear?: number; cgpa?: number };
}

export function useWalkInRegister(orgSlug: string) {
  return useMutation({
    // A campus drive registers an ineligible student without a link (token null; the reason when the drive tells it).
    mutationFn: (input: WalkInRegisterInput): Promise<{ token: string | null; eligible?: boolean; reason?: string | null }> =>
      apiFetch(`/public/walk-in/${orgSlug}/register`, { method: 'POST', body: JSON.stringify(input) }),
  });
}
