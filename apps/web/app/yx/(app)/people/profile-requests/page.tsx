'use client';

import { useRouter } from 'next/navigation';
import { ProfileRequestsScreen, type ProfileRequest } from '@yukthix/ui/access';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { usePeople, usePeopleWrite } from '../../../../../lib/yx-people';

const id = encodeURIComponent;

// People › Identity and bank changes (PPL-32; P02 §4.5, YX-SEC-11/13, M01 YX-EMP-02): the changes the
// signed-in person may decide or raised. Approving asks for a fresh second factor (the client prompts when
// the API needs it); a value on another active record needs a reason.
export default function YxProfileRequestsPage() {
  const router = useRouter();
  const perms = useYxPermissions();
  const list = usePeople<{ rows: ProfileRequest[] }>('/profile-requests');
  const write = usePeopleWrite();
  return (
    <ProfileRequestsScreen
      state={loadState(list)}
      onRetry={() => void list.refetch()}
      rows={list.data?.rows ?? []}
      canDecide={perms.has('employee.identity.approve')}
      onApprove={async (requestId, overrideReason) => void (await write('POST', `/profile-requests/${id(requestId)}/approve`, overrideReason ? { overrideReason } : {}))}
      onReject={async (requestId, reason) => void (await write('POST', `/profile-requests/${id(requestId)}/reject`, { reason }))}
      onOpenProfile={(employeeId) => router.push(`/yx/people/profile?person=${id(employeeId)}`)}
    />
  );
}
