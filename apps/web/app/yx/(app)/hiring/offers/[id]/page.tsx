'use client';

import { useParams, useRouter } from 'next/navigation';
import { OfferRecordScreen } from '@yukthix/ui/hiring';
import { apiFetchBlob } from '../../../../../../lib/api-client';
import { useAuth } from '../../../../../../lib/auth-context';
import { builderState, useOfferActions, useOfferRecord } from '../../../../../../lib/yx-offers';

// Hiring › Offer (HIR-09 offer record with the HIR-29 conditions tab): the designed record with `live`. Amounts only
// with the offer-pay key (the API leaves them out otherwise); approvers decide in the approvals inbox.
export default function YxOfferPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken } = useAuth();
  const record = useOfferRecord(id);
  const { write, sendOn } = useOfferActions();
  const o = record.data ?? null;
  const path = `/hiring/offers/${encodeURIComponent(id)}`;
  return (
    <OfferRecordScreen
      live={{
        state: builderState(record),
        onRetry: () => void record.refetch(),
        offer: o,
        now: new Date(),
        onBack: () => router.push(o ? `/yx/hiring/candidates/${encodeURIComponent(o.candidate.id)}?entry=${encodeURIComponent(o.entryId)}` : '/yx/hiring/candidates'),
        onRevise: () => router.push(`/yx/hiring/offers/${encodeURIComponent(id)}/revise`),
        onSubmit: () => sendOn(id),
        onSend: async () => void (await write('POST', `/offers/${encodeURIComponent(id)}/send`)),
        onWithdraw: async () => void (await write('POST', `/offers/${encodeURIComponent(id)}/withdraw`)),
        onCancelApproval: async () => void (await write('POST', `/offers/${encodeURIComponent(id)}/approval/cancel`)),
        onLetter: async () => {
          const { blob } = await apiFetchBlob(`/offers/${encodeURIComponent(id)}/pdf`, {}, accessToken ?? undefined);
          window.open(URL.createObjectURL(blob), '_blank', 'noopener');
        },
        // Answer 377: the sealed copy of an e-signed acceptance (downloaded), or made again when it is missing.
        onSealedCopy: async () => {
          const { blob, filename } = await apiFetchBlob(`/offers/${encodeURIComponent(id)}/acceptance-copy`, {}, accessToken ?? undefined);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename ?? 'offer-accepted.pdf';
          a.click();
          URL.revokeObjectURL(a.href);
        },
        onMakeSealedCopy: async () => void (await write('POST', `/offers/${encodeURIComponent(id)}/acceptance-copy`)),
        onRemind: async () => ((await write<{ kind: string }>('POST', `${path}/remind`)).kind === 'documents' ? 'Reminder sent: what is still due' : 'Reminder sent: answer the offer'),
        onCreateEmployee: () => router.push('/yx/people/ready-to-onboard'),
        onAddCondition: async (name, dueOn) => void (await write('POST', `${path}/conditions`, { name, dueOn })),
        onMet: async (cid) => void (await write('POST', `${path}/conditions/${encodeURIComponent(cid)}/met`, {})),
        onWaive: async (cid, reason) => void (await write('POST', `${path}/conditions/${encodeURIComponent(cid)}/waive`, { reason })),
      }}
    />
  );
}
