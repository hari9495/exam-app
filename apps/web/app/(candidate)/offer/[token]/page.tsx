'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-client';
import { PublicOffer } from '../../../../lib/types';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

// Why the offer isn't respondable right now, derived purely from what the public GET returns --
// no separate closed/expired flag from the API, matching the brief's "deliberately generic" status.
function closedReason(offer: PublicOffer): string | null {
  if (new Date(offer.expiresAt).getTime() < Date.now()) return 'This offer has expired.';
  if (offer.status === 'accepted' || offer.status === 'declined') return 'You already responded to this offer.';
  if (offer.status === 'expired') return 'This offer has expired.';
  if (offer.status !== 'sent') return 'This offer is no longer available.';
  return null;
}

export default function OfferPage() {
  const { token } = useParams<{ token: string }>();
  const [offer, setOffer] = useState<PublicOffer | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [responded, setResponded] = useState<'accept' | 'decline' | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/offers/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: PublicOffer) => {
        if (!cancelled) setOffer(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleRespond(action: 'accept' | 'decline') {
    setRespondError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/offers/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Could not submit your response. Please try again.');
      setResponded(action);
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Could not submit your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadFailed) {
    return <TerminalCard tone="neutral" title="Offer unavailable" body="This offer is no longer available." />;
  }

  if (!offer) {
    return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;
  }

  if (responded) {
    return (
      <TerminalCard
        tone={responded === 'accept' ? 'success' : 'neutral'}
        title={responded === 'accept' ? 'Offer accepted' : 'Offer declined'}
        body={responded === 'accept' ? "You've accepted this offer. We'll be in touch with next steps." : "You've declined this offer."}
      />
    );
  }

  const reason = closedReason(offer);
  if (reason) {
    return <TerminalCard tone="neutral" title="Offer closed" body={reason} />;
  }

  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-4 sm:p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-candidate-text-secondary">{offer.orgName}</p>
        <h1 className="mb-4 font-display text-xl font-bold text-candidate-text">{offer.jobTitle}</h1>

        <dl className="mb-6 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-candidate-text-secondary">Compensation</dt>
            <dd className="font-medium text-candidate-text">{offer.compensation}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-candidate-text-secondary">Start date</dt>
            <dd className="font-medium text-candidate-text">{new Date(offer.startDate).toLocaleDateString()}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-candidate-text-secondary">Offer expires</dt>
            <dd className="font-medium text-candidate-text">{new Date(offer.expiresAt).toLocaleDateString()}</dd>
          </div>
        </dl>

        {offer.pdfUrl ? (
          <a
            href={offer.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 inline-block text-sm font-medium text-candidate-primary underline"
          >
            Download PDF
          </a>
        ) : null}

        {respondError ? (
          <p role="alert" className="mb-4 rounded-md bg-candidate-danger-bg px-3 py-2 text-sm text-candidate-danger">
            {respondError}
          </p>
        ) : null}

        <div className="flex gap-3">
          <CandidateButton className="flex-1" disabled={submitting} onClick={() => handleRespond('accept')}>
            Accept offer
          </CandidateButton>
          <CandidateButton variant="secondary" className="flex-1" disabled={submitting} onClick={() => handleRespond('decline')}>
            Decline
          </CandidateButton>
        </div>
      </div>
    </div>
  );
}
