'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SupportDeskQueueScreen, type DeskQueueRow } from '@yukthix/ui/console';
import { loadState, useConsole } from '../../../../lib/yx-console';
import { notAgent } from '../../../../lib/yx-support-desk';

// Console › Support desk (SD-1.31): companies' tickets with YukthiX, most urgent first.
export default function ConsoleSupportDeskPage() {
  const router = useRouter();
  const [show, setShow] = useState<'open' | 'all'>('open');
  const q = useConsole<DeskQueueRow[]>(`/support-desk/tickets?state=${show}`);
  return (
    <SupportDeskQueueScreen
      state={loadState(q)}
      onRetry={() => void q.refetch()}
      blocked={notAgent(q.error)}
      rows={q.data ?? []}
      show={show}
      onShow={setShow}
      onOpen={(id) => router.push(`/staff/support-desk/${encodeURIComponent(id)}`)}
    />
  );
}
