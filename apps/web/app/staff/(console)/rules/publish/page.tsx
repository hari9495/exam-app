'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PublishSchedulerScreen, type LiveImpact, type LiveRuleDetail, type LiveRuleRow } from '@yukthix/ui/console';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { loadState, useConsole, useConsoleWrite } from '../../../../../lib/yx-console';
import { RULES, publishable, rulePath } from '../../../../../lib/yx-console-rules';

// Console › Rule sets › Publish (C-1, YX-03; answers 1041, 1044): a version in review that someone else drafted, its
// date and its impact (how many companies and employees, never who), published with the security key again.
function PublishPage() {
  const params = useSearchParams();
  const router = useRouter();
  const chosen = params.get('id');
  const me = useCurrentUser();
  const sets = useConsole<LiveRuleRow[]>(RULES);
  const detail = useConsole<LiveRuleDetail>(chosen ? rulePath(chosen) : '', Boolean(chosen));
  const impact = useConsole<LiveImpact>(chosen ? `${rulePath(chosen)}/impact` : '', Boolean(chosen));
  const write = useConsoleWrite();
  const [published, setPublished] = useState<LiveRuleRow | null>(null);
  return (
    <PublishSchedulerScreen
      current={chosen ? 'impact' : 'version'}
      live={{
        state: loadState(sets),
        onRetry: () => void sets.refetch(),
        choices: publishable(sets.data ?? [], me.data?.id),
        chosen,
        onChoose: (id) => router.replace(`/staff/rules/publish?id=${encodeURIComponent(id)}`),
        detail: chosen && detail.data?.id === chosen ? detail.data : null,
        impact: impact.data ?? null,
        onPublish: async (id) => {
          const row = (sets.data ?? []).find((r) => r.id === id) ?? null;
          await write(`${rulePath(id)}/publish`, 'POST');
          setPublished(row);
        },
        published,
      }}
    />
  );
}

export default function ConsolePublishPage() {
  return (
    <Suspense>
      <PublishPage />
    </Suspense>
  );
}
