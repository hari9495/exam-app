'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { TrainerQrScreen, type LiveSessionPage } from '@yukthix/ui/learning';
import { learningState, useLearning, useLearningWrite } from '../../../../../../../lib/yx-learning';

// Learning › a session's attendance code: the designed LRN-05 phone screen with `live` (batch G3b). The code comes from
// the API and changes every 30 seconds; the screen asks again when it runs out.
export default function YxSessionCodePage() {
  const { id } = useParams<{ id: string }>();
  const base = `/sessions/${encodeURIComponent(id)}`;
  const page = useLearning<LiveSessionPage>(base);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [picked, setPicked] = useState<string | null>(null);
  const slots = page.data?.slots ?? [];
  const slotId = picked ?? (slots.find((s) => s.date === today) ?? slots[0])?.id ?? null;
  const code = useLearning<{ code: string; secondsLeft: number }>(slotId && page.data?.status === 'scheduled' ? `${base}/code?slotId=${encodeURIComponent(slotId)}` : null);
  const write = useLearningWrite();
  const state = learningState(page);
  return (
    <TrainerQrScreen
      live={{
        state: state === 'no-access' ? 'error' : state,
        onRetry: () => void page.refetch(),
        page: page.data ?? null,
        slotId,
        onSlot: setPicked,
        code: code.data ?? null,
        onRefresh: () => {
          void code.refetch();
          void page.refetch();
        },
        onMarks: (s, marks) => write('POST', `${base}/marks`, { slotId: s, marks }),
      }}
    />
  );
}
