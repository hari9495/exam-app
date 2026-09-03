'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-client';
import { PublicInterview } from '../../../../lib/types';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

function formatSlot(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(new Date(startsAt));
}

type RespondAction = 'confirm' | 'decline' | 'reschedule';
type RespondedState = { action: RespondAction; slotId?: string } | null;

export default function InterviewPage() {
  const { token } = useParams<{ token: string }>();
  const [interview, setInterview] = useState<PublicInterview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [responded, setResponded] = useState<RespondedState>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedNote, setReschedNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/interviews/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: PublicInterview) => {
        if (!cancelled) {
          setInterview(data);
          // A single-slot invite has nothing to pick -- Confirm can post it directly.
          if (data.slots.length === 1) setSelectedSlotId(data.slots[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function respond(action: RespondAction, extra?: { slotId?: string; note?: string }) {
    setRespondError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/interviews/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) throw new Error('Could not submit your response. Please try again.');
      setResponded({ action, slotId: extra?.slotId });
    } catch (err) {
      setRespondError(err instanceof Error ? err.message : 'Could not submit your response. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadFailed) {
    return <TerminalCard tone="neutral" title="Interview unavailable" body="This interview invitation is no longer available." />;
  }

  if (!interview) {
    return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;
  }

  if (responded) {
    if (responded.action === 'confirm') {
      const slot = interview.slots.find((s) => s.id === responded.slotId);
      return (
        <TerminalCard
          tone="success"
          title="Interview confirmed"
          body={slot ? `You're confirmed for ${formatSlot(slot.startsAt, interview.timeZone)}.` : "You're confirmed for this interview."}
        />
      );
    }
    if (responded.action === 'decline') {
      return <TerminalCard tone="neutral" title="Interview declined" body="You've declined this interview." />;
    }
    return (
      <TerminalCard tone="neutral" title="Reschedule requested" body="We've sent your request to the team and will follow up." />
    );
  }

  if (interview.status !== 'proposed') {
    const confirmedSlot = interview.confirmedSlotId ? interview.slots.find((s) => s.id === interview.confirmedSlotId) : null;
    return (
      <TerminalCard
        tone="neutral"
        title="Interview closed"
        body={
          interview.status === 'confirmed' && confirmedSlot
            ? `This interview is confirmed for ${formatSlot(confirmedSlot.startsAt, interview.timeZone)}.`
            : 'This interview invitation is no longer available.'
        }
      />
    );
  }

  return (
    <div className="mx-auto flex flex-1 max-w-xl flex-col justify-center gap-6 p-4 sm:p-8">
      <div className="rounded-lg border border-candidate-border bg-white p-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-candidate-text-secondary">{interview.orgName}</p>
        <h1 className="mb-4 font-display text-xl font-bold text-candidate-text">{interview.jobTitle}</h1>

        <dl className="mb-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-candidate-text-secondary">Location</dt>
            <dd className="font-medium text-candidate-text">{interview.location}</dd>
          </div>
          {interview.panel.length > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-candidate-text-secondary">Panel</dt>
              <dd className="font-medium text-candidate-text">{interview.panel.join(', ')}</dd>
            </div>
          )}
        </dl>

        <fieldset className="mb-6 flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-candidate-text">Proposed time{interview.slots.length > 1 ? 's' : ''}</legend>
          {interview.slots.map((slot) => (
            <label key={slot.id} className="flex items-center gap-2 text-sm text-candidate-text">
              {interview.slots.length > 1 && (
                <input type="radio" name="slot" checked={selectedSlotId === slot.id} onChange={() => setSelectedSlotId(slot.id)} />
              )}
              {formatSlot(slot.startsAt, interview.timeZone)}
            </label>
          ))}
        </fieldset>

        {respondError ? (
          <p role="alert" className="mb-4 rounded-md bg-candidate-danger-bg px-3 py-2 text-sm text-candidate-danger">
            {respondError}
          </p>
        ) : null}

        <div className="flex gap-3">
          <CandidateButton
            className="flex-1"
            disabled={submitting || !selectedSlotId}
            onClick={() => selectedSlotId && respond('confirm', { slotId: selectedSlotId })}
          >
            Confirm
          </CandidateButton>
          <CandidateButton variant="secondary" className="flex-1" disabled={submitting} onClick={() => respond('decline')}>
            Decline
          </CandidateButton>
        </div>

        {reschedOpen ? (
          <div className="mt-4 flex flex-col gap-2">
            <label htmlFor="resched-note" className="text-sm font-medium text-candidate-text">
              What times would work better?
            </label>
            <textarea
              id="resched-note"
              value={reschedNote}
              onChange={(e) => setReschedNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-candidate-border px-3 py-2 text-sm focus:border-candidate-primary focus:outline-none focus:ring-2 focus:ring-candidate-primary/20"
            />
            <CandidateButton disabled={submitting} onClick={() => respond('reschedule', { note: reschedNote })}>
              Send request
            </CandidateButton>
          </div>
        ) : (
          <button type="button" className="mt-4 text-sm font-medium text-candidate-primary underline" onClick={() => setReschedOpen(true)}>
            Request reschedule
          </button>
        )}
      </div>
    </div>
  );
}
