'use client';

import { useRouter } from 'next/navigation';
import { RuleSetEditorScreen, type LiveRuleDetail, type LiveRuleRow } from '@yukthix/ui/console';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';
import { RULES, copyBody, rulePath } from '../../../../lib/yx-console-rules';

// Console › Rule sets (C-1, YX-01; answers 1041 to 1044): every version of every statutory rule set. YukthiX staff with
// the Rules editor key; the API checks it on every call. A new version starts as a copy of the one it replaces.
export default function ConsoleRuleSetsPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const me = useCurrentUser();
  const sets = useConsole<LiveRuleRow[]>(RULES);
  const write = useConsoleWrite();
  return (
    <RuleSetEditorScreen
      live={{
        state: loadState(sets),
        onRetry: () => void sets.refetch(),
        me: me.data?.id ?? '',
        sets: sets.data ?? [],
        onOpen: (id) => router.push(`/staff/rules/${encodeURIComponent(id)}`),
        onCopy: async (id, version) => {
          const d = (await apiFetch(`/platform${rulePath(id)}`, {}, accessToken ?? undefined)) as LiveRuleDetail;
          const made = await write<{ id: string }>(RULES, 'POST', copyBody(d, version));
          router.push(`/staff/rules/${encodeURIComponent(made.id)}`);
        },
      }}
    />
  );
}
