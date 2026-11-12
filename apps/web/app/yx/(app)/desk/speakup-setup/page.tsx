'use client';

import { SpeakUpSetupScreen, type SpeakUpSetupData } from '@yukthix/ui/desk';
import { deskState, useDesk, useDeskWrite } from '../../../../../lib/yx-desk';

// Helpdesk › Speak-up set-up (speakup.setup.manage, the System Admin): who receives grievances, ethics concerns and
// POSH complaints, and the escalation list for reports about one of them. A 403 shows the no-access state.
export default function YxSpeakUpSetupPage() {
  const data = useDesk<SpeakUpSetupData>('/speakup/setup');
  const write = useDeskWrite();
  return (
    <SpeakUpSetupScreen
      live={{
        state: deskState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onAdd: async (input) => {
          await write('/speakup/setup/members', 'POST', input);
        },
        onRemove: async (m) => {
          await write(`/speakup/setup/members/${encodeURIComponent(m)}/remove`, 'POST');
        },
        rulesHref: '/yx/settings/people/employee-relations-and-cases',
      }}
    />
  );
}
