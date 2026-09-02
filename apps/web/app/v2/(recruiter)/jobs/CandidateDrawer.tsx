'use client';

// v2 CandidateDrawer — re-skin of components/pipeline/CandidateDrawer on the v2 Dialog + primitives
// (covers the sticky header, soft-grey panel, v2 tokens/buttons). Every hook, mutation and piece of
// logic is verbatim (format only). Opens the v2 sub-modals (Send/Offer/Schedule).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Dialog, Button, Pill, dt } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';
import { useToast } from '../../../../components/ui';
import {
  useEntryFeedback,
  useAddFeedback,
  useCandidateProfile,
  useCandidateResumeUrl,
  useFitAssessment,
  useScoreEntry,
} from '../../../../lib/hooks/usePipeline';
import { useCandidateMessages, useResendMessage } from '../../../../lib/hooks/useCandidateMessages';
import { useCandidateOffers, useWithdrawOffer } from '../../../../lib/hooks/useOffers';
import { useCandidateInterviews, useCancelInterview } from '../../../../lib/hooks/useInterviews';
import { BoardRow, EntryExamResult, CandidateProfile, Offer, OfferStatus, Interview, InterviewStatus } from '../../../../lib/types';
import { SendMessageModal } from './SendMessageModal';
import { CreateOfferModal } from './CreateOfferModal';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';

const muted = 'var(--muted)';
const ink = 'var(--ink)';
const sub: React.CSSProperties['color'] = 'color-mix(in srgb, var(--ink) 72%, transparent)';
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 12, padding: 16 };
const listItem: React.CSSProperties = { borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', padding: 12 };
const textInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: ink, outline: 'none' };
const sectionH: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, margin: '0 0 8px' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 500, color: 'var(--org-primary)', cursor: 'pointer' };

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
      <h3 style={sectionH}>Profile</h3>
      {isLoading ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p>
      ) : profile?.parseStatus === 'done' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profile.parsedTitle && <p style={{ fontSize: 13, fontWeight: 500, color: ink, margin: 0 }}>{profile.parsedTitle}</p>}
          {profile.parsedYearsExperience !== null && <p style={{ fontSize: 13, color: sub, margin: 0 }}>{profile.parsedYearsExperience} yrs experience</p>}
          {profile.parsedSummary && <p style={{ fontSize: 13, color: ink, margin: 0 }}>{profile.parsedSummary}</p>}
          {parseSkills(profile.parsedSkills).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {parseSkills(profile.parsedSkills).map((skill) => (
                <span key={skill} style={{ borderRadius: 99, border: '1px solid var(--hair)', background: 'var(--paper)', padding: '2px 10px', fontSize: 12, fontWeight: 500, color: ink }}>{skill}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>{statusHint(profile)}</p>
      )}
      {profile?.resumePath && (
        <button type="button" onClick={handleDownload} disabled={resumeUrl.isPending} style={{ ...dt.toolBtn, marginTop: 12, opacity: resumeUrl.isPending ? 0.5 : 1 }}>
          {resumeUrl.isPending ? 'Opening…' : 'Download résumé'}
        </button>
      )}
    </div>
  );
}

const FIT_ADVISORY = 'AI-generated guidance — a hiring aid, not a decision. Review the candidate yourself.';

function FitSpinner() {
  return (
    <svg style={{ height: 16, width: 16 }} className="animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FitDimensionBar({ dimension }: { dimension: { label: string; weight: number; score: number } }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: sub }}>
        <span>{dimension.label} — {dimension.score}/100</span>
        <span style={{ color: muted }}>weight {dimension.weight}</span>
      </div>
      <div style={{ marginTop: 4, height: 6, borderRadius: 99, background: 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--org-primary)', width: `${dimension.score}%` }} />
      </div>
    </div>
  );
}

// Polls while a scoring run is in flight (see useFitAssessment's opts.poll), driven off state
// updated in an effect keyed on status.
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
      <h3 style={sectionH}>AI Fit</h3>

      {!status && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>No fit assessment yet.</p>
          <button type="button" onClick={handleScore} disabled={scoreEntry.isPending} style={{ ...dt.toolBtn, opacity: scoreEntry.isPending ? 0.5 : 1 }}>Assess fit</button>
        </div>
      )}

      {(status === 'pending' || status === 'processing') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: muted }}><FitSpinner /> Scoring…</div>
      )}

      {status === 'skipped_no_resume' && <p style={{ fontSize: 13, color: muted, margin: 0 }}>Add a résumé to assess fit.</p>}
      {status === 'skipped_no_ai_key' && <p style={{ fontSize: 13, color: muted, margin: 0 }}>Configure an AI provider in settings to use AI fit scoring.</p>}

      {status === 'failed' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontSize: 13, color: muted, margin: 0 }}>Scoring failed.</p>
          <button type="button" onClick={handleScore} disabled={scoreEntry.isPending} style={{ ...dt.toolBtn, opacity: scoreEntry.isPending ? 0.5 : 1 }}>Retry</button>
        </div>
      )}

      {status === 'done' && fit.data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 30, fontWeight: 600, color: ink }}>{fit.data.overallScore}</span>
            <button type="button" onClick={handleScore} disabled={scoreEntry.isPending} style={{ ...dt.toolBtn, opacity: scoreEntry.isPending ? 0.5 : 1 }}>Re-score</button>
          </div>
          {fit.data.summary && <p style={{ fontSize: 13, color: ink, margin: 0 }}>{fit.data.summary}</p>}
          {fit.data.strengths.length > 0 && (
            <div>
              <h4 style={{ ...sectionH, margin: '0 0 4px' }}>Strengths</h4>
              <ul style={{ listStyle: 'disc', paddingLeft: 20, margin: 0, fontSize: 13, color: ink }}>
                {fit.data.strengths.map((strength, i) => <li key={i}>{strength}</li>)}
              </ul>
            </div>
          )}
          {fit.data.concerns.length > 0 && (
            <div>
              <h4 style={{ ...sectionH, margin: '0 0 4px' }}>Concerns</h4>
              <ul style={{ listStyle: 'disc', paddingLeft: 20, margin: 0, fontSize: 13, color: ink }}>
                {fit.data.concerns.map((concern, i) => <li key={i}>{concern}</li>)}
              </ul>
            </div>
          )}
          {fit.data.dimensionScores && fit.data.dimensionScores.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fit.data.dimensionScores.map((dimension) => <FitDimensionBar key={dimension.label} dimension={dimension} />)}
            </div>
          )}
          {fit.data.stale && <p style={{ fontSize: 12, color: STATUS.warn, margin: 0 }}>Job criteria changed — re-score.</p>}
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: muted }}>{FIT_ADVISORY}</p>
    </div>
  );
}

// Tone → v2 colour, replacing the old StatusBadge tones.
const OFFER_STATUS_COLOR: Record<OfferStatus, string> = {
  draft: muted, sent: VIZ.azure, accepted: STATUS.ok, declined: STATUS.bad, expired: STATUS.warn, withdrawn: muted,
};
const INTERVIEW_STATUS_COLOR: Record<InterviewStatus, string> = {
  proposed: VIZ.azure, confirmed: STATUS.ok, declined: STATUS.bad, reschedule_requested: STATUS.warn, cancelled: muted,
};

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ ...sectionH, margin: 0 }}>Messages</h3>
        <button type="button" onClick={() => setComposing(true)} style={dt.toolBtn}>Send message</button>
      </div>
      {isLoading ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p>
      ) : (messages ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>No messages sent yet.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {(messages ?? []).map((message) => (
            <li key={message.id} style={listItem}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>{message.subject}</span>
                <Pill c={message.status === 'sent' ? STATUS.ok : STATUS.bad} label={message.status} />
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: muted }}>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
                {message.status === 'failed' && (
                  <button type="button" onClick={() => handleResend(message.id)} disabled={resendMessage.isPending} style={{ ...linkBtn, opacity: resendMessage.isPending ? 0.5 : 1 }}>Resend</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {composing && <SendMessageModal entryId={entryId} candidateId={candidateId} candidateName={candidateName} onClose={() => setComposing(false)} />}
    </div>
  );
}

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ ...sectionH, margin: 0 }}>Offers</h3>
        <button type="button" onClick={() => setCreating(true)} style={dt.toolBtn}>Create offer</button>
      </div>
      {isLoading ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p>
      ) : (offers ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>No offers yet.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {(offers ?? []).map((offer) => (
            <li key={offer.id} style={listItem}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>{offer.compensation}</span>
                <Pill c={OFFER_STATUS_COLOR[offer.status]} label={offer.status} />
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: muted }}>
                <span>{offerTimestampLabel(offer)}</span>
                {offer.status === 'sent' && (
                  <button type="button" onClick={() => handleWithdraw(offer.id)} disabled={withdrawOffer.isPending} style={{ ...linkBtn, opacity: withdrawOffer.isPending ? 0.5 : 1 }}>Withdraw</button>
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

function interviewTimeLabel(interview: Interview): string | null {
  const slot = interview.confirmedSlotId ? interview.slots.find((s) => s.id === interview.confirmedSlotId) : interview.slots[0];
  if (!slot) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: interview.timeZone }).format(new Date(slot.startsAt));
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ ...sectionH, margin: 0 }}>Interviews</h3>
        <button type="button" onClick={() => setScheduling(true)} style={dt.toolBtn}>Schedule interview</button>
      </div>
      {isLoading ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p>
      ) : (interviews ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: muted, margin: 0 }}>No interviews scheduled yet.</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {(interviews ?? []).map((interview) => (
            <li key={interview.id} style={listItem}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: ink }}>{interviewTimeLabel(interview) ?? 'No time proposed'}</span>
                <Pill c={INTERVIEW_STATUS_COLOR[interview.status]} label={interview.status} />
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: muted }}>
                <span>{interview.location}</span>
                {interview.status === 'proposed' && (
                  <button type="button" onClick={() => handleCancel(interview.id)} disabled={cancelInterview.isPending} style={{ ...linkBtn, opacity: cancelInterview.isPending ? 0.5 : 1 }}>Cancel</button>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`} aria-pressed={value >= n} onClick={() => onChange(n)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 18, lineHeight: 1, color: value >= n ? VIZ.amber : 'color-mix(in srgb, var(--ink) 20%, transparent)' }}>★</button>
      ))}
    </div>
  );
}

// Candidate details + full exam results + feedback timeline/compose. Fed with the BoardRow the
// caller already has from useJobPipeline — no separate candidate fetch needed.
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
        onSuccess: () => { setNote(''); setRating(0); },
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add feedback.', 'error'),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} width={720}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-disp)', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', color: ink, margin: 0 }}>{row.candidateName}</h2>
          <p style={{ fontSize: 13, color: sub, margin: '4px 0 0' }}>{row.candidateEmail}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} style={{ display: 'inline-flex', background: 'none', border: 'none', padding: 4, color: muted, cursor: 'pointer' }}><X size={18} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        <div style={card}><CandidateProfileSection candidateId={row.candidateId} /></div>

        <div style={card}><FitSection entryId={row.entryId} jobId={jobId} /></div>

        <div style={card}>
          <h3 style={sectionH}>Exam results</h3>
          {row.examResults.length === 0 ? (
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>No linked exam results yet.</p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', padding: 0, margin: 0 }}>
              {row.examResults.map((result) => (
                <li key={result.examId}>
                  <Link href={`/reports/${result.examId}/candidates/${row.candidateId}`} style={{ fontSize: 13, color: 'var(--org-primary)', textDecoration: 'none' }}>{chipLabel(result)}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={card}>
          <h3 style={sectionH}>Feedback</h3>
          {isLoading ? (
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>Loading…</p>
          ) : (feedback ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: muted, margin: 0 }}>No feedback yet.</p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, listStyle: 'none', padding: 0, margin: 0 }}>
              {(feedback ?? []).map((entry) => (
                <li key={entry.id} style={listItem}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: muted }}>
                    <span>{entry.authorName ?? 'Unknown'}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  {entry.rating !== null && <p style={{ marginTop: 4, fontSize: 13, color: VIZ.amber }}>{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</p>}
                  {entry.note && <p style={{ marginTop: 4, fontSize: 13, color: ink, margin: '4px 0 0' }}>{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--hair)', paddingTop: 16 }}>
            <label htmlFor="feedback-note" className="v2-label" style={{ marginBottom: 0 }}>Add feedback</label>
            <textarea id="feedback-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Notes for the team…" style={{ ...textInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            <StarPicker value={rating} onChange={setRating} />
            <div>
              <Button onClick={handleSubmit} loading={addFeedback.isPending} disabled={!canSubmit}>Post feedback</Button>
            </div>
          </div>
        </div>

        <div style={card}><MessagesSection entryId={row.entryId} candidateId={row.candidateId} candidateName={row.candidateName} /></div>
        <div style={card}><OffersSection entryId={row.entryId} candidateId={row.candidateId} /></div>
        <div style={card}><InterviewsSection entryId={row.entryId} candidateId={row.candidateId} /></div>
      </div>
    </Dialog>
  );
}
