'use client';

import { ApprovalRoutesScreen, type ApprovalRoute } from '@yukthix/ui/hiring';
import { loadState } from '../../../../../lib/yx-org';
import { useApprovalChains, useUpsertApprovalChain } from '../../../../../lib/hooks/useApprovals';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { useUserGroups } from '../../../../../lib/hooks/useUserGroups';

// Hiring › Approvals (M10 batch AT2, founder D1 / D3): who approves requisitions and offers. Replaces the older
// /v2/settings/approvals page on the same API; requisitions now run on YukthiX Approvals.
export default function YxHiringApprovalRoutesPage() {
  const chains = useApprovalChains();
  const upsert = useUpsertApprovalChain();
  const people = useTeammates();
  const groups = useUserGroups();
  const route = (c: { enabled: boolean; steps: ApprovalRoute['steps'] } | undefined): ApprovalRoute | null => (c ? { enabled: c.enabled, steps: c.steps.map((s) => ({ name: s.name, approverType: s.approverType, approverUserIds: s.approverUserIds, managerLevel: s.managerLevel, groupId: s.groupId })) } : null);
  return (
    <ApprovalRoutesScreen
      state={loadState(chains)}
      onRetry={() => void chains.refetch()}
      requisition={route(chains.data?.requisition)}
      offer={route(chains.data?.offer)}
      people={(people.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email }))}
      groups={(groups.data ?? []).map((g: { id: string; name: string }) => ({ value: g.id, label: g.name }))}
      onSave={(gate, r) => upsert.mutateAsync({ gate, enabled: r.enabled, steps: r.steps.map((s) => ({ name: s.name.trim(), approverType: s.approverType, ...(s.approverType === 'users' ? { approverUserIds: s.approverUserIds } : {}), ...(s.approverType === 'reporting_manager' ? { managerLevel: s.managerLevel ?? 1 } : {}), ...(s.approverType === 'group' && s.groupId ? { groupId: s.groupId } : {}) })) })}
    />
  );
}
