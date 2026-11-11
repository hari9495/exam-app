'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SupportDeskQueueScreen, type DeskQueueRow } from '@yukthix/ui/console';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { loadState, useConsole } from '../../../../lib/yx-console';
import { notAgent } from '../../../../lib/yx-support-desk';

// Console › Support desk (SD-1.31): companies' tickets with YukthiX, most urgent first.
export default function ConsoleSupportDeskPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
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
      // Answer 1051: a Not found reference in every company that has it (company, when, page; never the record).
      onLookUpReference={(code) => apiFetch(`/platform/support-desk/references/${encodeURIComponent(code)}`, {}, accessToken ?? undefined)}
    />
  );
}
