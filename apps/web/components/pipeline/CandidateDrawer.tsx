'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal, Button, StatusBadge, StatusTone, useToast } from '../ui';
import {
  useEntryFeedback,
  useAddFeedback,
  useCandidateProfile,
  useCandidateResumeUrl,
  useFitAssessment,
  useScoreEntry,
} from '../../lib/hooks/usePipeline';
import { useUserDirectory } from '../../lib/hooks/useUserDirectory';
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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Profile</h3>
      {isLoading ? (
        <p className="text-sm text-muted">Loading&hellip;</p>
      ) : profile?.parseStatus === 'done' ? (
        <div className="flex flex-col gap-2">
          {profile.parsedTitle && <p className="text-sm font-medium text-ink">{profile.parsedTitle}</p>}
          {profile.parsedYearsExperience !== null && (
            <p className="text-sm text-muted">{profile.parsedYearsExperience} yrs experience</p>
          )}
          {profile.parsedSummary && <p className="text-sm text-ink">{profile.parsedSummary}</p>}
          {parseSkills(profile.parsedSkills).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parseSkills(profile.parsedSkills).map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-rule bg-white px-2.5 py-0.5 text-xs font-medium text-ink"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{statusHint(profile)}</p>
      )}
      {profile?.resumePath && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={handleDownload} loading={resumeUrl.isPending}>
          Download résumé
        </Button>
      )}
    </div>
  );
}

const FIT_ADVISORY = 'AI-generated guidance — a hiring aid, not a decision. Review the candidate yourself.';

function FitSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FitDimensionBar({ dimension }: { dimension: { label: string; weight: number; score: number } }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {dimension.label} — {dimension.score}/100
        </span>
        <span className="text-muted">weight {dimension.weight}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${dimension.score}%` }} />
      </div>
    </div>
  );
}

// Polls while a scoring run is in flight (see useFitAssessment's opts.poll), driven off state
// updated in an effect keyed on status -- a ref would update in place without forcing the
// re-render that's needed to actually arm the query's refetchInterval.
function FitSection({ entryId, jobId }: { entryId: string; jobId: string }) {
  const [poll, setPoll] = useState(false);
  const fit = useFitAssessment(entryId, { poll });
  const status = fit.data?.status;
  useEffect(() => {
    setPoll(status === 'pending' || status === 'processing');
  }, [status]);

  const scoreEntry = useScoreEntry(jobId);
  const { toast } = useToast();

  function handleScore() {
    scoreEntry.mutate(entryId, {
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to start scoring.', 'error'),
    });
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">AI Fit</h3>

      {!status && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">No fit assessment yet.</p>
          <Button size="sm" variant="secondary" onClick={handleScore} loading={scoreEntry.isPending}>
            Assess fit
          </Button>
        </div>
      )}

      {(status === 'pending' || status === 'processing') && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <FitSpinner />
          Scoring&hellip;
        </div>
      )}

      {status === 'skipped_no_resume' && <p className="text-sm text-muted">Add a résumé to assess fit.</p>}

      {status === 'skipped_no_ai_key' && (
        <p className="text-sm text-muted">Configure an AI provider in settings to use AI fit scoring.</p>
      )}

      {status === 'failed' && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">Scoring failed.</p>
          <Button size="sm" variant="secondary" onClick={handleScore} loading={scoreEntry.isPending}>
            Retry
          </Button>
        </div>
      )}

      {status === 'done' && fit.data && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-3xl font-semibold text-ink">{fit.data.overallScore}</span>
            <Button size="sm" variant="secondary" onClick={handleScore} loading={scoreEntry.isPending}>
              Re-score
            </Button>
          </div>
          {fit.data.summary && <p className="text-sm text-ink">{fit.data.summary}</p>}
          {fit.data.strengths.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Strengths</h4>
              <ul className="list-disc pl-5 text-sm text-ink">
                {fit.data.strengths.map((strength, i) => (
                  <li key={i}>{strength}</li>
                ))}
              </ul>
            </div>
          )}
          {fit.data.concerns.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Concerns</h4>
              <ul className="list-disc pl-5 text-sm text-ink">
                {fit.data.concerns.map((concern, i) => (
                  <li key={i}>{concern}</li>
                ))}
              </ul>
            </div>
          )}
          {fit.data.dimensionScores && fit.data.dimensionScores.length > 0 && (
            <div className="flex flex-col gap-2">
              {fit.data.dimensionScores.map((dimension) => (
                <FitDimensionBar key={dimension.label} dimension={dimension} />
              ))}
            </div>
          )}
          {fit.data.stale && <p className="text-xs text-amber-600">Job criteria changed — re-score.</p>}
        </div>
      )}

      <p className="mt-3 text-xs text-muted">{FIT_ADVISORY}</p>
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Messages</h3>
        <Button size="sm" variant="secondary" onClick={() => setComposing(true)}>
          Send message
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading&hellip;</p>
      ) : (messages ?? []).length === 0 ? (
        <p className="text-sm text-muted">No messages sent yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(messages ?? []).map((message) => (
            <li key={message.id} className="rounded border border-rule p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{message.subject}</span>
                <StatusBadge tone={message.status === 'sent' ? 'success' : 'danger'}>{message.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Offers</h3>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          Create offer
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading&hellip;</p>
      ) : (offers ?? []).length === 0 ? (
        <p className="text-sm text-muted">No offers yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(offers ?? []).map((offer) => (
            <li key={offer.id} className="rounded border border-rule p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{offer.compensation}</span>
                <StatusBadge tone={OFFER_STATUS_TONE[offer.status]}>{offer.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Interviews</h3>
        <Button size="sm" variant="secondary" onClick={() => setScheduling(true)}>
          Schedule interview
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading&hellip;</p>
      ) : (interviews ?? []).length === 0 ? (
        <p className="text-sm text-muted">No interviews scheduled yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(interviews ?? []).map((interview) => (
            <li key={interview.id} className="rounded border border-rule p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{interviewTimeLabel(interview) ?? 'No time proposed'}</span>
                <StatusBadge tone={INTERVIEW_STATUS_TONE[interview.status]}>{interview.status}</StatusBadge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
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

// Pick teammates to @mention/notify on this feedback. Chips over an inline @-autocomplete: far
// simpler, same outcome (their ids go to mentionedUserIds). Backend validates + drops self.
function MentionPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useUserDirectory({ pageSize: 100 });
  const teammates = (data?.data ?? []).filter((u) => u.status === 'active');
  if (teammates.length === 0) return null;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">Notify teammates</span>
      <div className="flex flex-wrap gap-1.5">
        {teammates.map((u) => {
          const on = value.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-rule text-muted hover:border-primary/30'}`}
            >
              @{u.name ?? u.email}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  const [mentions, setMentions] = useState<string[]>([]);

  const canSubmit = Boolean(note.trim() || rating > 0);

  function handleSubmit() {
    addFeedback.mutate(
      { note: note.trim() || undefined, rating: rating > 0 ? rating : undefined, mentionedUserIds: mentions.length ? mentions : undefined },
      {
        onSuccess: () => {
          setNote('');
          setRating(0);
          setMentions([]);
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add feedback.', 'error'),
      },
    );
  }

  return (
    <Modal open title={row.candidateName} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">{row.candidateEmail}</p>

        <CandidateProfileSection candidateId={row.candidateId} />

        <FitSection entryId={row.entryId} jobId={jobId} />

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Exam results</h3>
          {row.examResults.length === 0 ? (
            <p className="text-sm text-muted">No linked exam results yet.</p>
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Feedback</h3>
          {isLoading ? (
            <p className="text-sm text-muted">Loading&hellip;</p>
          ) : (feedback ?? []).length === 0 ? (
            <p className="text-sm text-muted">No feedback yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(feedback ?? []).map((entry) => (
                <li key={entry.id} className="rounded border border-rule p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{entry.authorName ?? 'Unknown'}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  {entry.rating !== null && (
                    <p className="mt-1 text-sm text-amber-500">
                      {'★'.repeat(entry.rating)}
                      {'☆'.repeat(5 - entry.rating)}
                    </p>
                  )}
                  {entry.note && <p className="mt-1 text-sm text-ink">{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-rule pt-4">
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
            <MentionPicker value={mentions} onChange={setMentions} />
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
