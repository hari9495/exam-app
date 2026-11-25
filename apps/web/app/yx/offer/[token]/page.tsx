'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { OfferAcceptScreen, type CandidatePageState } from '@yukthix/ui/hiring';
import { publicGet, publicPost, candidateBrand } from '../../../../lib/yx-careers';
import { API_BASE } from '../../../../lib/api-client';
import type { PublicOffer } from '../../../../lib/types';

// T9-09 offer accept by link (founder decisions 4 and 10): the existing accept-by-link, on the drawn page. The API
// accepts once (a second answer is refused), refuses an expired offer, and answers with the new status only. M10 D4: an offer
// issued as a P05 letter shows its reference and downloads the issued letter.
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
      brand={candidateBrand(offer?.brand, offer?.orgName)}
      state={state}
      offer={offer ? { jobTitle: offer.jobTitle, compensation: offer.compensation, startDate: new Date(offer.startDate), expiresAt: new Date(offer.expiresAt), status: offer.status, pdfUrl: offer.letter ? `${API_BASE}/public/offers/${encodeURIComponent(token)}/letter` : offer.pdfUrl, esign: Boolean(offer.esign), letter: offer.letter ?? null } : null}
      live={{
        today: new Date(),
        // HIR-09 answer 337: with e-sign the code and the agreed disclosure go with the acceptance.
        onRespond: (action, sign) => publicPost(`/offers/${encodeURIComponent(token)}/respond`, { action, ...(sign ?? {}) }),
        onSendCode: () => publicPost<{ to: string }>(`/offers/${encodeURIComponent(token)}/esign-code`, {}),
      }}
    />
  );
}
