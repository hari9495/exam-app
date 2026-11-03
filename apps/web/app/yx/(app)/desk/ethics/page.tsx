'use client';

import { useRouter } from 'next/navigation';
import { EthicsDeskScreen, type EthicsRow } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › Ethics desk: the designed HLP-09 whistleblower queue with `live`. The open fraud and ethics reports the
// person is an officer on; "Route to chair" with a reason. The API checks membership and routing (map 4f).
export default function YxEthicsDeskPage() {
  const router = useRouter();
  const rows = useDesk<EthicsRow[]>('/ethics/reports');
  const write = useDeskWrite();
  return (
    <EthicsDeskScreen
      live={{
        state: deskState(rows),
        onRetry: () => void rows.refetch(),
        rows: rows.data ?? [],
        onOpen: (c) => router.push(`/yx/desk/cases/${encodeURIComponent(c)}`),
        onRoute: async (c, reason) => {
          await write(`/ethics/reports/${encodeURIComponent(c)}/route`, 'POST', { reason });
        },
      }}
    />
  );
}
