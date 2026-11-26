'use client';

import { PolicyEditorScreen } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { APPROVAL_LIMITS, useApprovalLimits, useApprovalPolicies, useApprovalPolicyWrite, useHiringMove } from '../../../../../lib/yx-approval-policies';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { useUserGroups } from '../../../../../lib/hooks/useUserGroups';

// Hiring › Approvals (answer 2650): the same approval rules editor as Settings, filtered to requisitions and offers, with
// the move from the old hiring routes (2789: old approvers next to the new ones; only matching types move).
const HIRING = ['ats.requisition', 'ats.offer'];
export default function YxHiringApprovalRoutesPage() {
  const perms = useYxPermissions();
  const canEdit = perms.has('org.settings.manage');
  const data = useApprovalPolicies();
  const move = useHiringMove(canEdit);
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
        only: HIRING,
        remindHours: data.data?.remindHours ?? 24,
        escalateHours: data.data?.escalateHours ?? 48,
        canEdit,
        onSave: write.save,
        onReset: write.reset,
        people: (people.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email })),
        groups: (groups.data ?? []).map((g: { id: string; name: string }) => ({ value: g.id, label: g.name })),
        grades: (limits.data?.grades ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.code})` })),
        ...(canEdit ? { onTry: write.tryIt, pastRequests: write.pastRequests, notices: write.notices, move: { rows: move.data ?? null, onMove: write.move } } : {}),
        limitsHref: APPROVAL_LIMITS,
      }}
    />
  );
}
