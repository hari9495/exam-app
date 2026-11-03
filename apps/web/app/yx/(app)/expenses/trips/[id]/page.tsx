'use client';

import { useParams, useRouter } from 'next/navigation';
import { EXP_LINKS, TripScreen, type TripDetail } from '@yukthix/ui/expenses';
import { loadState, todayIst } from '../../../../../../lib/yx-org';
import { useExp, useExpWrite, useReceiptOpen, useWfDecide } from '../../../../../../lib/yx-expenses';

// One trip (EXP-04, the designed screen with `live`): timeline, itinerary and bookings, settlement, claims on it. The
// API decides what each viewer may do (trip.can) and hides the money from the travel desk.
export default function YxTripPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const base = `/trips/${encodeURIComponent(id)}`;
  const trip = useExp<TripDetail>(base);
  const write = useExpWrite();
  const decide = useWfDecide();
  const open = useReceiptOpen();
  return (
    <TripScreen
      live={{
        view: 'record',
        state: loadState(trip),
        onRetry: () => void trip.refetch(),
        trip: trip.data ?? null,
        today: todayIst(),
        onBack: () => router.push(EXP_LINKS.trips),
        onSubmit: () => write('POST', `${base}/submit`, { version: trip.data!.version }),
        onCancel: () => write('POST', `${base}/cancel`),
        onDecide: decide,
        onAddBooking: (b) => {
          const form = new FormData();
          form.append('kind', b.kind);
          form.append('title', b.title);
          form.append('amount', b.amount);
          form.append('paidBy', b.paidBy);
          if (b.file) form.append('file', b.file);
          return write('POST', `${base}/bookings`, form);
        },
        onPartnerBook: (legSeq) => write('POST', `${base}/bookings/partner`, { legSeq }),
        onRemoveBooking: (bookingId) => write('DELETE', `${base}/bookings/${encodeURIComponent(bookingId)}`),
        onOpenBooking: (bookingId) => open(`${base}/bookings/${encodeURIComponent(bookingId)}/file`),
        onNewClaim: async () => {
          const c = await write<{ id: string }>('POST', '/claims', { title: trip.data!.purpose.slice(0, 150), tripId: id });
          router.push(EXP_LINKS.claim(c.id));
        },
        onOpenClaim: (claimId) => router.push(EXP_LINKS.claim(claimId)),
        onOpenAdvance: (advanceId) => router.push(EXP_LINKS.advance(advanceId)),
        onClose: (reason) => write('POST', `${base}/close`, { reason }),
      }}
    />
  );
}
