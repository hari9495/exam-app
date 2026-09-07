import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 5 approval-email-template endpoints (Zoho #9 slice 2).
// Mirrors useBusinessHours.ts. The four event types are inlined here (not imported from
// @exam-platform/shared) because apps/web can't import shared VALUES at runtime -- only types.
export type ApprovalEmailEventType = 'approval.requested' | 'approval.approved' | 'approval.rejected' | 'approval.cancelled';

export const APPROVAL_EMAIL_EVENT_TYPES: ApprovalEmailEventType[] = [
  'approval.requested',
  'approval.approved',
  'approval.rejected',
  'approval.cancelled',
];

export const APPROVAL_EMAIL_EVENT_LABELS: Record<ApprovalEmailEventType, string> = {
  'approval.requested': 'Approval requested',
  'approval.approved': 'Approval approved',
  'approval.rejected': 'Approval rejected',
  'approval.cancelled': 'Approval cancelled',
};

export interface ApprovalEmailTemplateSlot {
  eventType: ApprovalEmailEventType;
  subject: string | null;
  body: string | null;
  enabled: boolean;
}

export function useApprovalEmailTemplates() {
  const { accessToken } = useAuth();
  return useQuery<ApprovalEmailTemplateSlot[]>({
    queryKey: ['approval-email-templates'],
    queryFn: () => apiFetch('/approval-email-templates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpsertApprovalEmailTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventType, subject, body, enabled }: { eventType: ApprovalEmailEventType; subject: string; body: string; enabled?: boolean }) =>
      apiFetch(
        `/approval-email-templates/${eventType}`,
        { method: 'PUT', body: JSON.stringify({ subject, body, enabled }) },
        accessToken ?? undefined,
      ) as Promise<ApprovalEmailTemplateSlot>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval-email-templates'] }),
  });
}
