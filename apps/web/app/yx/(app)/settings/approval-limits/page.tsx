'use client';

import { LookupTableScreen } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useApprovalLimits, useApprovalPolicyWrite } from '../../../../../lib/yx-approval-policies';

// Settings › Approval limits (E2, answer 2645; the drawn PLT-34 lookup table): per family of amount requests, the
// largest amount each grade approves. "Up the chain to the approval limit" steps read it. Pay limits also need the pay
// approve key (checked by the server).
export default function YxApprovalLimitsPage() {
  const perms = useYxPermissions();
  const data = useApprovalLimits();
  const write = useApprovalPolicyWrite();
  const err = data.error as { status?: number } | null;
  return (
    <LookupTableScreen
      live={{
        state: data.isError ? (err?.status === 403 ? 'no-access' : 'error') : data.data ? 'ready' : 'loading',
        onRetry: () => void data.refetch(),
        canEdit: perms.has('org.settings.manage'),
        families: data.data?.families ?? [],
        grades: data.data?.grades ?? [],
        onSave: write.saveLimits,
      }}
    />
  );
}
