'use client';

import { useSearchParams } from 'next/navigation';
import { PolicyEditorScreen } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { APPROVAL_LIMITS, useApprovalLimits, useApprovalPolicies, useApprovalPolicyWrite } from '../../../../../lib/yx-approval-policies';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { useUserGroups } from '../../../../../lib/hooks/useUserGroups';

// Settings › Approvals › Approval policies (S-6, answer 1330; E2): the drawn PLT-12 editor with each request type's
// rules and otherwise route, the PLT-32 rule builder and PLT-57 "Try it". HR's settings key changes them; those who read
// the company settings see them read-only.
export default function YxApprovalPoliciesPage() {
  const perms = useYxPermissions();
  const params = useSearchParams();
  const canEdit = perms.has('org.settings.manage');
  const data = useApprovalPolicies();
  const limits = useApprovalLimits(canEdit);
  const people = useTeammates(canEdit);
  const groups = useUserGroups(canEdit);
  const write = useApprovalPolicyWrite();
  const err = data.error as { status?: number } | null;
  return (
    <PolicyEditorScreen
      live={{
        state: data.isError ? (err?.status === 403 ? 'no-access' : 'error') : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        types: data.data?.types ?? [],
        remindHours: data.data?.remindHours ?? 24,
        escalateHours: data.data?.escalateHours ?? 48,
        canEdit,
        onSave: write.save,
        onReset: write.reset,
        defaultType: params?.get('type') ?? undefined,
        people: (people.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email })),
        groups: (groups.data ?? []).map((g: { id: string; name: string }) => ({ value: g.id, label: g.name })),
        grades: (limits.data?.grades ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.code})` })),
        ...(canEdit ? { onTry: write.tryIt, pastRequests: write.pastRequests, notices: write.notices } : {}),
        limitsHref: APPROVAL_LIMITS,
      }}
    />
  );
}
