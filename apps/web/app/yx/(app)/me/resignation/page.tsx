'use client';

import { useToast } from '@yukthix/ui';
import { ResignationSheet } from '@yukthix/ui/frame';
import type { MyResignation, MyVrsScheme } from '@yukthix/ui/lifecycle';
import { loadState } from '../../../../../lib/yx-org';
import { useLife, useLifeWrite } from '../../../../../lib/yx-lifecycle';

// Me › Resign (PPL-18; design §10.2): the designed sheet with my notice from the company policy, my resignation and its withdrawal.
export default function YxResignationPage() {
  const { toast } = useToast();
  const data = useLife<MyResignation>('/lifecycle/me/resignation');
  const write = useLifeWrite();
  const vrs = useLife<{ schemes: MyVrsScheme[] }>('/lifecycle/me/vrs');
  return (
    <ResignationSheet
      live={{
        state: loadState(data),
        onRetry: () => void data.refetch(),
        data: data.data ?? null,
        onResign: async (x) => {
          await write('POST', '/lifecycle/me/resignation', { reasonCode: x.reasonCode, reasonText: x.reasonText, ...(x.requestedLwd ? { requestedLwd: x.requestedLwd } : {}) });
          toast({ tone: 'success', title: 'Resignation sent to your manager' });
        },
        onWithdraw: async (reason) => {
          const r = await write<{ result: 'withdrawn' | 'requested' }>('POST', '/lifecycle/me/resignation/withdraw', { reason });
          toast({ tone: 'success', title: r.result === 'withdrawn' ? 'Resignation withdrawn' : 'Withdrawal sent to your manager and HR' });
        },
        interviewHref: '/yx/me/exit-interview',
        vrs: vrs.data?.schemes.length
          ? {
              schemes: vrs.data.schemes,
              onApply: async (s, x) => {
                await write('POST', '/lifecycle/me/vrs', { schemeId: s.id, requestedLwd: x.requestedLwd, ...(x.reasonText ? { reasonText: x.reasonText } : {}) });
                toast({ tone: 'success', title: `Application for ${s.name} sent to HR` });
              },
            }
          : undefined,
      }}
    />
  );
}
