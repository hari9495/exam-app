'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { OfferAcceptScreen, type CandidatePageState } from '@yukthix/ui/hiring';
import { publicGet, publicPost } from '../../../../lib/yx-careers';
import type { PublicOffer } from '../../../../lib/types';

// T9-09 offer accept by link (founder decisions 4 and 10): the existing accept-by-link, on the drawn page. The API
// accepts once (a second answer is refused), refuses an expired offer, and answers with the new status only.
export default function YxOfferPage() {
  const { token } = useParams<{ token: string }>();
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [state, setState] = useState<CandidatePageState>('loading');
  useEffect(() => {
    let live = true;
    void publicGet<PublicOffer>(`/offers/${encodeURIComponent(token)}`).then((o) => {
      if (!live) return;
      setOffer(o);
      setState(o ? 'ready' : 'not-found');
    });
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <OfferAcceptScreen
      brand={{ tenant: offer?.orgName ?? '' }}
      state={state}
      offer={offer ? { jobTitle: offer.jobTitle, compensation: offer.compensation, startDate: new Date(offer.startDate), expiresAt: new Date(offer.expiresAt), status: offer.status, pdfUrl: offer.pdfUrl } : null}
      live={{ today: new Date(), onRespond: (action) => publicPost(`/offers/${encodeURIComponent(token)}/respond`, { action }) }}
    />
  );
}
