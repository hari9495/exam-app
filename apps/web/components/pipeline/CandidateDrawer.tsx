'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Modal, Button, StatusBadge, StatusTone, useToast } from '../ui';
import { useEntryFeedback, useAddFeedback, useCandidateProfile, useCandidateResumeUrl } from '../../lib/hooks/usePipeline';
import { useCandidateMessages, useResendMessage } from '../../lib/hooks/useCandidateMessages';
import { useCandidateOffers, useWithdrawOffer } from '../../lib/hooks/useOffers';
import { useCandidateInterviews, useCancelInterview } from '../../lib/hooks/useInterviews';
import { BoardRow, EntryExamResult, CandidateProfile, Offer, OfferStatus, Interview, InterviewStatus } from '../../lib/types';
import { SendMessageModal } from './SendMessageModal';
import { CreateOfferModal } from './CreateOfferModal';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';

function parseSkills(parsedSkills: string | null): string[] {
  if (!parsedSkills) return [];
  try {
    const parsed = JSON.parse(parsedSkills);
    return Array.isArray(parsed) ? parsed.filter((skill): skill is string => typeof skill === 'string') : [];
  } catch {
    return [];
  }
}

function statusHint(profile: CandidateProfile | null | undefined): string {
  if (profile?.parseStatus === 'pending' || profile?.parseStatus === 'parsing') return 'Parsing…';
  if (profile?.parseStatus === 'failed') return 'Résumé parse failed';
  if (profile?.resumePath) return 'Résumé on file — parsing unavailable';
  return 'No résumé on file';
}

function CandidateProfileSection({ candidateId }: { candidateId: string }) {
  const { data: profile, isLoading } = useCandidateProfile(candidateId);
  const resumeUrl = useCandidateResumeUrl(candidateId);
  const { toast } = useToast();

  function handleDownload() {
    resumeUrl.mutate(undefined, {
      onSuccess: (result) => window.open(result.url, '_blank', 'noopener,noreferrer'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to open résumé.', 'error'),
    });
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Profile</h3>
      {isLoading ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      ) : profile?.parseStatus === 'done' ? (
        <div className="flex flex-col gap-2">
          {profile.parsedTitle && <p className="text-sm font-medium text-recruiter-text">{profile.parsedTitle}</p>}
          {profile.parsedYearsExperience !== null && (
            <p className="text-sm text-recruiter-text-secondary">{profile.parsedYearsExperience} yrs experience</p>
          )}
          {profile.parsedSummary && <p className="text-sm text-recruiter-text">{profile.parsedSummary}</p>}
          {parseSkills(profile.parsedSkills).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parseSkills(profile.parsedSkills).map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-recruiter-border bg-white px-2.5 py-0.5 text-xs font-medium text-recruiter-text"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-recruiter-text-tertiary">{statusHint(profile)}</p>
      )}
      {profile?.resumePath && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={handleDownload} loading={resumeUrl.isPending}>
          Download résumé
        </Button>
      )}
    </div>
  );
}

function MessagesSection({ entryId, candidateId, candidateName }: { entryId: string; candidateId: string; candidateName: string }) {
  const { data: messages, isLoading } = useCandidateMessages(candidateId);
  const resendMessage = useResendMessage(candidateId);
  const { toast } = useToast();
  const [composing, setComposing] = useState(false);

  function handleResend(messageId: string) {
    resendMessage.mutate(messageId, {
      onSuccess: () => toast('Message resent.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to resend message.', 'error'),
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Messages</h3>
        <Button size="sm" variant="secondary" onClick={() => setComposing(true)}>
          Send message
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      ) : (messages ?? []).length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">No messages sent yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(messages ?? []).map((message) => (
            <li key={message.id} className="rounded border border-recruiter-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-recruiter-text">{message.subject}</span>
                <StatusBadge tone={message.status === 'sent' ? 'success' : 'danger'}>{message.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-recruiter-text-tertiary">
                <span>{new Date(message.createdAt).toLocaleString()}</span>
                {message.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => handleResend(message.id)}
                    disabled={resendMessage.isPending}
                    className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Resend
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {composing && (
        <SendMessageModal entryId={entryId} candidateId={candidateId} candidateName={candidateName} onClose={() => setComposing(false)} />
      )}
    </div>
  );
}

const OFFER_STATUS_TONE: Record<OfferStatus, StatusTone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
  withdrawn: 'neutral',
};

function offerTimestampLabel(offer: Offer): string {
  if (offer.respondedAt) return `Responded ${new Date(offer.respondedAt).toLocaleString()}`;
  if (offer.sentAt) return `Sent ${new Date(offer.sentAt).toLocaleString()}`;
  return `Created ${new Date(offer.createdAt).toLocaleString()}`;
}

function OffersSection({ entryId, candidateId }: { entryId: string; candidateId: string }) {
  const { data: offers, isLoading } = useCandidateOffers(candidateId);
  const withdrawOffer = useWithdrawOffer(candidateId);
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  function handleWithdraw(offerId: string) {
    withdrawOffer.mutate(offerId, {
      onSuccess: () => toast('Offer withdrawn.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to withdraw offer.', 'error'),
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Offers</h3>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          Create offer
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      ) : (offers ?? []).length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">No offers yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(offers ?? []).map((offer) => (
            <li key={offer.id} className="rounded border border-recruiter-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-recruiter-text">{offer.compensation}</span>
                <StatusBadge tone={OFFER_STATUS_TONE[offer.status]}>{offer.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-recruiter-text-tertiary">
                <span>{offerTimestampLabel(offer)}</span>
                {offer.status === 'sent' && (
                  <button
                    type="button"
                    onClick={() => handleWithdraw(offer.id)}
                    disabled={withdrawOffer.isPending}
                    className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateOfferModal entryId={entryId} candidateId={candidateId} onClose={() => setCreating(false)} />}
    </div>
  );
}

const INTERVIEW_STATUS_TONE: Record<InterviewStatus, StatusTone> = {
  proposed: 'info',
  confirmed: 'success',
  declined: 'danger',
  reschedule_requested: 'warning',
  cancelled: 'neutral',
};

function interviewTimeLabel(interview: Interview): string | null {
  const slot = interview.confirmedSlotId
    ? interview.slots.find((s) => s.id === interview.confirmedSlotId)
    : interview.slots[0];
  if (!slot) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: interview.timeZone }).format(
    new Date(slot.startsAt),
  );
}

function InterviewsSection({ entryId, candidateId }: { entryId: string; candidateId: string }) {
  const { data: interviews, isLoading } = useCandidateInterviews(candidateId);
  const cancelInterview = useCancelInterview(candidateId);
  const { toast } = useToast();
  const [scheduling, setScheduling] = useState(false);

  function handleCancel(interviewId: string) {
    cancelInterview.mutate(interviewId, {
      onSuccess: () => toast('Interview cancelled.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to cancel interview.', 'error'),
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Interviews</h3>
        <Button size="sm" variant="secondary" onClick={() => setScheduling(true)}>
          Schedule interview
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
      ) : (interviews ?? []).length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">No interviews scheduled yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(interviews ?? []).map((interview) => (
            <li key={interview.id} className="rounded border border-recruiter-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-recruiter-text">{interviewTimeLabel(interview) ?? 'No time proposed'}</span>
                <StatusBadge tone={INTERVIEW_STATUS_TONE[interview.status]}>{interview.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-recruiter-text-tertiary">
                <span>{interview.location}</span>
                {interview.status === 'proposed' && (
                  <button
                    type="button"
                    onClick={() => handleCancel(interview.id)}
                    disabled={cancelInterview.isPending}
                    className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {scheduling && <ScheduleInterviewModal entryId={entryId} candidateId={candidateId} onClose={() => setScheduling(false)} />}
    </div>
  );
}

function chipLabel(result: EntryExamResult): string {
  if (result.passFail === null) return `${result.examTitle} · Pending`;
  const label = result.passFail === 'pass' ? 'Passed' : 'Failed';
  return `${result.examTitle} · ${label}${result.score !== null ? ` ${result.score}%` : ''}`;
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value >= n}
          onClick={() => onChange(n)}
          className={value >= n ? 'text-amber-500' : 'text-gray-300'}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// Candidate details + full exam results + feedback timeline/compose. Fed with the BoardRow
// the caller already has from useJobPipeline -- no separate candidate fetch needed, the
// board's row already carries name/email/examResults.
export function CandidateDrawer({ jobId, row, onClose }: { jobId: string; row: BoardRow; onClose: () => void }) {
  const { data: feedback, isLoading } = useEntryFeedback(row.entryId);
  const addFeedback = useAddFeedback(row.entryId, jobId);
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [rating, setRating] = useState(0);

  const canSubmit = Boolean(note.trim() || rating > 0);

  function handleSubmit() {
    addFeedback.mutate(
      { note: note.trim() || undefined, rating: rating > 0 ? rating : undefined },
      {
        onSuccess: () => {
          setNote('');
          setRating(0);
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add feedback.', 'error'),
      },
    );
  }

  return (
    <Modal open title={row.candidateName} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-recruiter-text-secondary">{row.candidateEmail}</p>

        <CandidateProfileSection candidateId={row.candidateId} />

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Exam results</h3>
          {row.examResults.length === 0 ? (
            <p className="text-sm text-recruiter-text-tertiary">No linked exam results yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {row.examResults.map((result) => (
                <li key={result.examId}>
                  <Link href={`/reports/${result.examId}/candidates/${row.candidateId}`} className="text-sm text-primary hover:underline">
                    {chipLabel(result)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">Feedback</h3>
          {isLoading ? (
            <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>
          ) : (feedback ?? []).length === 0 ? (
            <p className="text-sm text-recruiter-text-tertiary">No feedback yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(feedback ?? []).map((entry) => (
                <li key={entry.id} className="rounded border border-recruiter-border p-3">
                  <div className="flex items-center justify-between text-xs text-recruiter-text-tertiary">
                    <span>{entry.authorName ?? 'Unknown'}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  {entry.rating !== null && (
                    <p className="mt-1 text-sm text-amber-500">
                      {'★'.repeat(entry.rating)}
                      {'☆'.repeat(5 - entry.rating)}
                    </p>
                  )}
                  {entry.note && <p className="mt-1 text-sm text-recruiter-text">{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-recruiter-border pt-4">
            <label htmlFor="feedback-note" className="text-sm font-medium text-gray-700">
              Add feedback
            </label>
            <textarea
              id="feedback-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Notes for the team…"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <StarPicker value={rating} onChange={setRating} />
            <div>
              <Button size="sm" onClick={handleSubmit} loading={addFeedback.isPending} disabled={!canSubmit}>
                Post feedback
              </Button>
            </div>
          </div>
        </div>

        <MessagesSection entryId={row.entryId} candidateId={row.candidateId} candidateName={row.candidateName} />

        <OffersSection entryId={row.entryId} candidateId={row.candidateId} />

        <InterviewsSection entryId={row.entryId} candidateId={row.candidateId} />
      </div>
    </Modal>
  );
}
