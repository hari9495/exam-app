'use client';

import { NudgeEditorScreen, type LiveNudges } from '@yukthix/ui/console';
import { loadState, useConsole, useConsoleWrite } from '../../../../lib/yx-console';

type Overview = Pick<LiveNudges, 'features' | 'nudges' | 'weeklyLimit'>;

// Console › Nudges (C-8, YX-12): the in-app text per feature switch; another staff member approves each before it goes
// live. Companies see it only when the switch allows it, only people who can act, and at most the weekly limit.
export default function ConsoleNudgesPage() {
  const data = useConsole<Overview>('/nudges');
  const write = useConsoleWrite();
  return (
    <NudgeEditorScreen
      nudges={[]}
      me=""
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        features: data.data?.features ?? [],
        nudges: data.data?.nudges ?? [],
        weeklyLimit: data.data?.weeklyLimit ?? 2,
        onWrite: (input) => write('/nudges', 'POST', input),
        onReview: (id, approve, note) => write(`/nudges/${encodeURIComponent(id)}/review`, 'POST', { approve, ...(note ? { note } : {}) }),
        onRetire: (id) => write(`/nudges/${encodeURIComponent(id)}/retire`, 'POST', {}),
      }}
    />
  );
}
