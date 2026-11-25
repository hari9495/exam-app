'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { InterviewBookingScreen, type CandidatePageState } from '@yukthix/ui/hiring';
import { publicGet, publicPost, candidateBrand } from '../../../../lib/yx-careers';
import type { PublicInterview } from '../../../../lib/types';

// T9-09 interview booking (founder decision 10): the invitation link. Proposed times: confirm one, ask for another time
// or decline. Self-booking: the free times the API works out from the panel's calendars (re-checked when booking).
export default function YxInterviewPage() {
  const { token } = useParams<{ token: string }>();
  const path = `/interviews/${encodeURIComponent(token)}`;
  const [iv, setIv] = useState<PublicInterview | null>(null);
  const [state, setState] = useState<CandidatePageState>('loading');
  useEffect(() => {
    let live = true;
    void publicGet<PublicInterview>(path).then((d) => {
      if (!live) return;
      setIv(d);
      setState(d ? 'ready' : 'not-found');
    });
    return () => {
      live = false;
    };
  }, [path]);
  const respond = (body: Record<string, unknown>) => publicPost(`${path}/respond`, body);
  return (
    <InterviewBookingScreen
      brand={candidateBrand(iv?.brand, iv?.orgName)}
      state={state}
      interview={
        iv
          ? {
              jobTitle: iv.jobTitle,
              location: iv.location || null,
              timeZone: iv.timeZone || 'Asia/Kolkata',
              panel: iv.panel,
              status: iv.status,
              confirmedSlotId: iv.confirmedSlotId,
              slots: iv.slots,
              selfBook: iv.bookingMode === 'self_book' && iv.availableSlots ? { minutes: iv.slotDurationMinutes ?? 30, available: iv.availableSlots } : null,
            }
          : null
      }
      live={{
        onConfirm: (slotId) => respond({ action: 'confirm', slotId }),
        onBook: (slot) => respond({ action: 'book', startsAt: slot.startsAt, endsAt: slot.endsAt }),
        onDecline: () => respond({ action: 'decline' }),
        onReschedule: (note) => respond({ action: 'reschedule', note }),
      }}
    />
  );
}
