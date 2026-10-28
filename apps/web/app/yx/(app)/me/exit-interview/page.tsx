'use client';

import { useToast } from '@yukthix/ui';
import { ExitInterview } from '@yukthix/ui/frame';
import type { InterviewForm } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Exit interview (PPL-21; design §10.6): answered once; only HR with the confidential key reads the answers.
export default function YxExitInterviewPage() {
  const { toast } = useToast();
  const data = useLife<InterviewForm>('/lifecycle/me/exit-interview');
  const write = useLifeWrite();
  return (
    <ExitInterview
      live={{
        kind: 'mine',
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onSubmit: async (answers) => {
          await write('PUT', '/lifecycle/me/exit-interview', { answers });
          toast({ tone: 'success', title: 'Thank you. Your answers are with HR' });
        },
      }}
    />
  );
}
