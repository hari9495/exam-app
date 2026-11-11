'use client';

import { WhatsNewConsoleScreen, type NewsEntryRow } from '@yukthix/ui/console';
import { loadState, todayIst, useConsole, useConsoleKeys, useConsoleWrite } from '../../../../lib/yx-console';

// Console › What's new (Help H-4, answer 943): YukthiX staff write the entries people see in Help › What's new, for
// their role and the products their company uses. Every change is in the platform audit log.
export default function ConsoleWhatsNewPage() {
  const data = useConsole<{ today: string; products: { code: string; name: string }[]; entries: NewsEntryRow[] }>('/whats-new');
  const can = useConsoleKeys();
  const write = useConsoleWrite();
  return (
    <WhatsNewConsoleScreen
      state={loadState(data)}
      onRetry={() => void data.refetch()}
      entries={data.data?.entries ?? []}
      products={data.data?.products ?? []}
      today={data.data?.today ?? todayIst()}
      canManage={can('platform.news.manage')}
      onCreate={(input) => write('/whats-new', 'POST', input).then(() => undefined)}
      onUpdate={(id, input) => write(`/whats-new/${encodeURIComponent(id)}`, 'PATCH', input).then(() => undefined)}
      onWithdraw={(id) => write(`/whats-new/${encodeURIComponent(id)}/withdraw`, 'POST').then(() => undefined)}
    />
  );
}
