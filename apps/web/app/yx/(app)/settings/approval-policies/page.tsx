'use client';

import { useSearchParams } from 'next/navigation';
import { PolicyEditorScreen } from '@yukthix/ui/hiring';
import { useYxPermissions } from '../../../../../lib/yx-org';
import { useApprovalPolicies, useApprovalPolicyWrite } from '../../../../../lib/yx-approval-policies';

// Settings › Approvals › Approval policies (S-6, answer 1330): the drawn PLT-12 editor with the company's steps per
// request type. HR's settings key changes them; those who read the company settings see them read-only.
export default function YxApprovalPoliciesPage() {
  const perms = useYxPermissions();
  const params = useSearchParams();
  const data = useApprovalPolicies();
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
        canEdit: perms.has('org.settings.manage'),
        onSave: write.save,
        onReset: write.reset,
        defaultType: params?.get('type') ?? undefined,
      }}
    />
  );
}
