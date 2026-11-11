'use client';

import { useParams, useRouter } from 'next/navigation';
import { RuleSetEditorScreen, type LiveRuleDetail, type LiveRuleRow } from '@yukthix/ui/console';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { useCurrentUser } from '../../../../../lib/hooks/useCurrentUser';
import { loadState, useConsole, useConsoleWrite } from '../../../../../lib/yx-console';
import { RULES, copyBody, rulePath } from '../../../../../lib/yx-console-rules';

// Console › Rule sets › one version (C-1, YX-01; answer 1042): the drafter changes their draft (also after changes were
// requested) and sends it for review; others read it, run its golden cases and review it; a published one is copied.
export default function ConsoleRuleSetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const me = useCurrentUser();
  const path = rulePath(id);
  const detail = useConsole<LiveRuleDetail>(path);
  const sets = useConsole<LiveRuleRow[]>(RULES);
  const write = useConsoleWrite();
  const d = detail.data;
  return (
    <RuleSetEditorScreen
      // A fresh editor for each loaded version, so its fields start from what is saved.
      key={d ? `${d.id}-${d.state}-${d.golden.length}-${d.changeNote ?? ''}` : 'loading'}
      openId={id}
      live={{
        state: loadState(detail),
        onRetry: () => void detail.refetch(),
        me: me.data?.id ?? '',
        sets: sets.data ?? [],
        detail: d ?? null,
        onOpen: (other) => router.push(`/staff/rules/${encodeURIComponent(other)}`),
        onCopy: async (from, version) => {
          const src = (await apiFetch(`/platform${rulePath(from)}`, {}, accessToken ?? undefined)) as LiveRuleDetail;
          const made = await write<{ id: string }>(RULES, 'POST', copyBody(src, version));
          router.push(`/staff/rules/${encodeURIComponent(made.id)}`);
        },
        onSave: (input) => write(path, 'PATCH', input).then(() => undefined),
        onSendForReview: () => write(`${path}/send-for-review`, 'POST').then(() => undefined),
        onGolden: () => router.push(`/staff/rules/golden?id=${encodeURIComponent(id)}`),
        onReview: () => router.push(`/staff/rules/golden?id=${encodeURIComponent(id)}&review=1`),
      }}
    />
  );
}
