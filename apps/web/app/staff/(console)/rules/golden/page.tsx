'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoldenCasesScreen, type LiveGoldenRun, type LiveRuleDetail, type LiveRuleRow } from '@yukthix/ui/console';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { loadState, useConsole, useConsoleWrite } from '../../../../../lib/yx-console';
import { RULES, reviewQueue, rulePath } from '../../../../../lib/yx-console-rules';

// Console › Rule sets › Golden cases and review (C-1, YX-02; answers 1042, 1043): a dry run of one version's golden cases
// (it saves nothing), and the versions waiting for review. Approving goes on to publishing; asking for changes sends the
// draft back to its drafter with a note.
function GoldenPage() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const me = useCurrentUser();
  const sets = useConsole<LiveRuleRow[]>(RULES);
  const detail = useConsole<LiveRuleDetail>(id ? rulePath(id) : '', Boolean(id));
  const write = useConsoleWrite();
  const [run, setRun] = useState<LiveGoldenRun | null>(null);
  useEffect(() => setRun(null), [id]);
  return (
    <GoldenCasesScreen
      tab={params.get('review') ? 'queue' : 'runner'}
      defaultReviewOpen={Boolean(id && params.get('review'))}
      live={{
        state: loadState(sets),
        onRetry: () => void sets.refetch(),
        me: me.data?.id ?? '',
        detail: id && detail.data?.id === id ? detail.data : null,
        run,
        onRun: async () => {
          if (!id) throw new Error('Open a version first.');
          setRun(await write<LiveGoldenRun>(`${rulePath(id)}/run`, 'POST'));
        },
        queue: reviewQueue(sets.data ?? []),
        onOpen: (other) => router.replace(`/staff/rules/golden?id=${encodeURIComponent(other)}&review=1`),
        onRequestChanges: (other, note) => write(`${rulePath(other)}/request-changes`, 'POST', { note }).then(() => undefined),
        onApprove: (other) => router.push(`/staff/rules/publish?id=${encodeURIComponent(other)}`),
      }}
    />
  );
}

export default function ConsoleGoldenCasesPage() {
  return (
    <Suspense>
      <GoldenPage />
    </Suspense>
  );
}
