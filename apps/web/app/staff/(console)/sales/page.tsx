'use client';

import { SalesAssistScreen, type LiveSales } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';

// Console › Sales assist (C-8, YX-13; answer 1210): Talk to us requests from nudge cards. Take one, call back before it
// is due, record the outcome.
export default function ConsoleSalesPage() {
  const data = useConsole<{ now: string; rows: LiveSales['rows'] }>('/sales');
  const write = useConsoleWrite();
  const now = data.data ? new Date(data.data.now) : new Date();
  return (
    <SalesAssistScreen
      rows={[]}
      now={now}
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        now,
        rows: data.data?.rows ?? [],
        onTake: (id) => write(`/sales/${encodeURIComponent(id)}/take`, 'POST', {}),
        onOutcome: (id, status, note, version) => write(`/sales/${encodeURIComponent(id)}/outcome`, 'POST', { status, version, ...(note ? { note } : {}) }),
      }}
    />
  );
}
