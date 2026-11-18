'use client';

import { useRouter } from 'next/navigation';
import { IcConsoleScreen, type CaseListRow, type LiveIcConsole } from '@yukthix/ui/desk';
import { deskState, useDesk } from '../../../../../lib/yx-desk';

// Helpdesk › Internal Committee: the designed CMP-11 console with `live` (batch F item 13). Only the committee's own
// members (everyone else gets not found, 404, from the API); the committee and the POSH complaints the member is on.
export default function YxIcConsolePage() {
  const router = useRouter();
  const ic = useDesk<{ company: string; members: LiveIcConsole['members'] }>('/speakup/ic');
  const list = useDesk<(CaseListRow & { filedOn?: string | null })[]>(ic.data ? '/cases' : null);
  const notMember = (ic.error as { status?: number } | null)?.status === 404;
  return (
    <IcConsoleScreen
      today={new Date()}
      live={{
        state: notMember ? 'no-access' : deskState(ic, list),
        onRetry: () => void Promise.all([ic.refetch(), list.refetch()]),
        company: ic.data?.company ?? '',
        members: ic.data?.members ?? [],
        cases: (list.data ?? []).filter((c) => c.kind === 'posh').map((c) => ({ id: c.id, ref: c.ref, filedOn: c.filedOn ?? null, location: c.location, stage: c.stage, next: c.next, overdue: c.overdue, status: c.status })),
        onOpen: (c) => router.push(`/yx/desk/cases/${encodeURIComponent(c)}`),
      }}
    />
  );
}
