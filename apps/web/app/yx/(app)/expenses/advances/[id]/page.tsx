'use client';

import { useParams, useRouter } from 'next/navigation';
import { AdvanceScreen, EXP_LINKS, type AdvanceDetail } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../../lib/yx-org';
import { useExp, useExpWrite, useWfDecide } from '../../../../../../lib/yx-expenses';

// One advance (EXP-05, the designed screen with `live`): its balance ledger; the approver may lower the amount; finance
// pays it and records returns. The API decides what each viewer may do (advance.can).
export default function YxAdvancePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/advances/${encodeURIComponent(id)}`;
  const advance = useExp<AdvanceDetail>(base);
  const write = useExpWrite();
  const decide = useWfDecide();
  return (
    <AdvanceScreen
      live={{
        view: 'record',
        state: loadState(advance),
        onRetry: () => void advance.refetch(),
        advance: advance.data ?? null,
        today: todayIst(),
        onBack: () => router.push(EXP_LINKS.advances),
        onChangeAmount: (amount, reason) => write('PATCH', `${base}/amount`, { amount, ...(reason ? { reason } : {}) }),
        onDecide: decide,
        onPay: (paidOn, ref, fxRate) => write('POST', `${base}/pay`, { paidOn, ref, version: advance.data!.version, ...(fxRate ? { fxRate } : {}) }),
        onReturn: (amount, on, ref, fxRate) => write('POST', `${base}/return`, { amount, on, ref, ...(fxRate ? { fxRate } : {}) }),
        onNewClaim: async () => {
          const c = await write<{ id: string }>('POST', '/claims', { title: advance.data!.purpose.slice(0, 150), advanceId: id });
          router.push(EXP_LINKS.claim(c.id));
        },
        onOpenTrip: (tripId) => router.push(EXP_LINKS.trip(tripId)),
        onOpenClaim: (claimId) => router.push(EXP_LINKS.claim(claimId)),
      }}
    />
  );
}
