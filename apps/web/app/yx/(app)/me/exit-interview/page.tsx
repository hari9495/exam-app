'use client';

import { ExitInterviewScreen, type InterviewForm } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Exit interview (PPL-21; design §10.6): answered once; only HR with the confidential key reads the answers.
export default function YxExitInterviewPage() {
  const data = useLife<InterviewForm>('/lifecycle/me/exit-interview');
  const write = useLifeWrite();
  return <ExitInterviewScreen state={loadState(data)} onRetry={() => void data.refetch()} data={data.data ?? null} onSubmit={(answers) => write('PUT', '/lifecycle/me/exit-interview', { answers })} />;
}
