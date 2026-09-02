'use client';

// v2 CandidateReportPanel — re-skin of components/CandidateReportPanel on the v2 tokens/primitives
// (cards, Dialog, Pill, buttons). Every hook, mutation, conditional and the props signature are
// verbatim (format only — no behaviour/API change). Lives under the .v2 layout where the tokens
// (--paper/--ink/--hair/--muted/--org-primary/--danger/--surface) resolve.
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink } from 'lucide-react';
import {
  useCandidateReport,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsList,
} from '../../../../lib/hooks/usePanelReports';
import { useSystemEvents } from '../../../../lib/hooks/useSystemEvents';
import { plainEnglish } from '../../../../lib/system-event-message';
import type { WebcamTimelineEntry, FaceMismatchEntry } from '../../../../lib/types';
import { useToast, IntegrityBadge } from '../../../../components/ui';
import { AuditHistoryLink } from '../../../../components/AuditHistoryLink';
import { TabActivitySummaryCard, TabActivityBanner, hasTabActivityContent } from '../../../../components/TabActivity';
import { Dialog, Button, Pill, dt } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 18 };
const SEVERITY_COLOR: Record<string, string> = { high: STATUS.bad, medium: STATUS.warn, low: 'var(--muted)' };

function formatSnapshotTime(occurredAt: string): string {
  return new Date(occurredAt).toLocaleString();
}

function formatSnapshotModalTitle(entry: WebcamTimelineEntry): string {
  const time = formatSnapshotTime(entry.occurredAt);
  return entry.kind === 'violation' ? `${time} — ${entry.reason} — strike ${entry.strike}` : time;
}

interface CandidateReportPanelProps {
  examId: string;
  candidateId: string;
  attemptId: string | null;
  /** Rendered above the report header -- the route page passes its BackLink, an
   *  inline embed passes its own back button. */
  backSlot?: ReactNode;
  /** When set, the "View <counterpart>'s report" link on a similarity flag calls
   *  this instead of navigating to the counterpart's report route -- lets an
   *  inline embed swap candidates in place. */
  onOpenCandidate?: (candidateId: string, attemptId: string | null) => void;
}

/**
 * Full candidate report (integrity, score, webcam timeline, AI insight,
 * per-question breakdown) for one attempt. Shared between the panel report
 * route and the exam edit page's Results tab, where it renders inline so the
 * recruiter never leaves the exam.
 */
export function CandidateReportPanel({ examId, candidateId, attemptId, backSlot, onOpenCandidate }: CandidateReportPanelProps) {
  const { data: candidate, isLoading } = useCandidateReport(examId, candidateId, attemptId);
  const { data: insight, isLoading: insightLoading } = useAttemptInsight(attemptId);
  const { data: results } = useResultsList(examId);
  const regenerate = useRegenerateAttemptInsight();
  // Technical issues recorded for this attempt (failed saves, JS crashes, webcam loss).
  // Viewers without audit:view get a 403 -- the hook doesn't retry and the section below
  // silently stays hidden, so panel members see no error for a report they can't access.
  const systemEventsQuery = useSystemEvents({ attemptId: attemptId ?? undefined }, { enabled: Boolean(attemptId) });
  const technicalIssues = systemEventsQuery.data?.data ?? [];
  const { toast } = useToast();
  const [selectedSnapshot, setSelectedSnapshot] = useState<WebcamTimelineEntry | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [selectedFaceImage, setSelectedFaceImage] = useState<{ src: string; title: string } | null>(null);

  const handleRegenerate = () => {
    if (!attemptId) return;
    regenerate.mutateAsync(attemptId).catch((error) => {
      toast(error instanceof Error ? error.message : 'Failed to generate AI insight.', 'error');
    });
  };

  if (isLoading || !candidate) {
    return <p style={{ padding: 32, color: 'var(--muted)' }}>Loading…</p>;
  }

  const integrity = candidate.integrityAnalysis;
  // Absent (not empty) on an attempt from before this feature existed -- default so that report
  // renders exactly as it did before, no error and no empty section.
  const faceMismatches: FaceMismatchEntry[] = candidate.faceMismatches ?? [];
  const referenceImageUrl = candidate.faceEnrolment?.referenceImageUrl ?? null;
  const questionTextById = new Map(
    candidate.sections.flatMap((section) => section.questions.map((question) => [question.questionId, question.questionText] as const)),
  );

  return (
    <div>
      {backSlot}
      <div style={{ marginTop: 12, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>{candidate.candidateName}</h1>
          <AuditHistoryLink
            entityType="candidate"
            entityId={candidateId}
            entityName={candidate.candidateName}
            className="inline-flex items-center gap-1 text-xs font-medium hover:underline print:hidden"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => window.print()} className="v2-hoverbtn print:hidden" style={{ ...dt.toolBtn }}>
            <Download size={16} style={{ marginRight: 6 }} />
            Export report
          </button>
          {candidate.passFail && <Pill c={candidate.passFail === 'pass' ? STATUS.ok : STATUS.bad} label={candidate.passFail} />}
          <IntegrityBadge level={integrity?.level} />
        </div>
      </div>

      {integrity && (integrity.narrative || integrity.flags.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>Integrity Analysis</h2>
          {integrity.narrative && <p style={{ marginBottom: 12, fontSize: 14, color: 'var(--ink)' }}>{integrity.narrative}</p>}
          {integrity.flags.length > 0 && (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
              {integrity.flags.map((flag, index) => {
                const questionText = flag.questionId ? questionTextById.get(flag.questionId) : undefined;
                const counterpart =
                  flag.type === 'similarity_match' && flag.counterpartAttemptId
                    ? results?.find((row) => row.attemptId === flag.counterpartAttemptId)
                    : undefined;
                return (
                  <li key={index} style={{ borderRadius: 8, border: '1px solid var(--hair)', padding: 12, fontSize: 14, color: 'var(--ink)' }}>
                    <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{flag.detail}</span>
                      <Pill c={SEVERITY_COLOR[flag.severity] ?? 'var(--muted)'} label={flag.severity} />
                    </div>
                    {questionText && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Question: {questionText}</p>}
                    {counterpart &&
                      (onOpenCandidate ? (
                        <button
                          type="button"
                          onClick={() => onOpenCandidate(counterpart.candidateId, counterpart.attemptId)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: 'var(--org-primary)' }}
                        >
                          View {counterpart.candidateName}&rsquo;s report
                        </button>
                      ) : (
                        <Link
                          href={`/v2/reports/${examId}/candidates/${counterpart.candidateId}?attemptId=${counterpart.attemptId ?? ''}`}
                          style={{ fontSize: 12, fontWeight: 500, color: 'var(--org-primary)' }}
                        >
                          View {counterpart.candidateName}&rsquo;s report
                        </Link>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div style={{ ...card, marginBottom: 24 }}>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Score</p>
        <p style={{ fontSize: 26, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {candidate.percentage !== null ? `${candidate.percentage.toFixed(1)}%` : '—'}
          {candidate.score !== null && candidate.maxScore !== null && (
            <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>
              ({candidate.score}/{candidate.maxScore})
            </span>
          )}
        </p>
      </div>

      {candidate.faceEnrolment && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>Face Verification</h2>
          <div style={card}>
            {referenceImageUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={referenceImageUrl}
                  alt="Reference photo"
                  style={{ height: 80, width: 80, borderRadius: 8, objectFit: 'cover' }}
                />
                <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                  <p style={{ fontWeight: 500, textTransform: 'capitalize', margin: 0 }}>{candidate.faceEnrolment.status.replace(/_/g, ' ')}</p>
                  {candidate.faceEnrolment.capturedAt && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Captured {new Date(candidate.faceEnrolment.capturedAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ) : faceMismatches.length > 0 ? (
              // FaceRetentionService nulls referenceImagePath 90 days after the attempt finalises but
              // leaves the face_mismatch events alone -- this is the only surface those snapshots are
              // ever visible on, so it must keep showing them even once the reference photo is gone.
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Reference photo no longer retained (90-day retention period elapsed) — flagged snapshots below remain available.</p>
            ) : (
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Not verified — no reference photo was captured</p>
            )}
            {/* Stage 2 is flag-only and the score is uncalibrated (see ExamDetailsForm's note),
                so this is put in front of a recruiter as evidence to look at, not a verdict --
                both faces rendered together, at a size a face is actually recognisable at, and
                click-to-enlarge (same pattern as the webcam timeline below) for when it isn't. */}
            {faceMismatches.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--hair)', paddingTop: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}>Flagged snapshots — compare before acting</p>
                {faceMismatches.map((mismatch, index) => (
                  <div key={index} data-testid="mismatch-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'center' }}>
                      {referenceImageUrl ? (
                        <button
                          type="button"
                          onClick={() => setSelectedFaceImage({ src: referenceImageUrl, title: 'Reference photo' })}
                          aria-label="View reference photo full size"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          {/* Alt text distinguishes this from the header photo above (both would
                              otherwise say "Reference photo", which is noise for screen readers). */}
                          <img src={referenceImageUrl} alt="Reference photo (comparison)" style={{ height: 96, width: 96, borderRadius: 8, objectFit: 'cover' }} />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', height: 96, width: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--surface)', padding: 4, textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>
                          Reference photo no longer retained
                        </div>
                      )}
                      <p style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>Reference</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      {mismatch.snapshotUrl ? (
                        <button
                          type="button"
                          onClick={() => setSelectedFaceImage({ src: mismatch.snapshotUrl as string, title: 'Flagged snapshot' })}
                          aria-label="View flagged snapshot full size"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          <img src={mismatch.snapshotUrl} alt="Flagged snapshot" style={{ height: 96, width: 96, borderRadius: 8, objectFit: 'cover' }} />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', height: 96, width: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--surface)', fontSize: 12, color: 'var(--muted)' }}>
                          No image
                        </div>
                      )}
                      <p style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>Flagged snapshot</p>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                      <p style={{ margin: 0 }}>{formatSnapshotTime(mismatch.occurredAt)}</p>
                      {mismatch.score !== null && (
                        <>
                          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Similarity score: {mismatch.score.toFixed(2)}</p>
                          <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>0–1 scale, higher means more similar. Thresholds are not yet calibrated.</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {technicalIssues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>Technical Issues During Exam</h2>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
            {technicalIssues.map((event) => (
              <li key={event.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderRadius: 8, border: '1px solid var(--hair)', padding: 10, fontSize: 14 }}>
                <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' }}>{new Date(event.occurredAt).toLocaleString()}</span>
                {/* Recruiters read this section, so it gets the same plain-English
                    translation as System Logs; the raw message stays on hover. */}
                <span style={{ color: 'var(--ink)' }} title={event.message}>
                  {plainEnglish(event).summary}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>Webcam Timeline</h2>
        {candidate.webcamTimeline.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>No webcam snapshots recorded.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {candidate.webcamTimeline.map((entry, index) => {
              const screenshot = typeof entry.screenshot === 'string' && entry.screenshot !== '' ? entry.screenshot : null;
              return (
                <div
                  key={index}
                  style={{ borderRadius: 10, border: `2px solid ${entry.kind === 'violation' ? 'var(--danger)' : 'var(--hair)'}`, padding: 8, textAlign: 'left' }}
                >
                  {entry.snapshot !== '' ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSnapshot(entry)}
                      aria-label={`Webcam snapshot at ${formatSnapshotTime(entry.occurredAt)}`}
                      style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <img src={entry.snapshot} alt="" style={{ marginBottom: 4, height: 80, width: '100%', borderRadius: 8, objectFit: 'cover' }} />
                    </button>
                  ) : !screenshot && !entry.screenshotCapReached ? (
                    <div style={{ marginBottom: 4, display: 'flex', height: 80, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--surface)', fontSize: 12, color: 'var(--muted)' }}>
                      No image
                    </div>
                  ) : null}
                  {screenshot && (
                    <button
                      type="button"
                      onClick={() => setSelectedScreenshot(screenshot)}
                      aria-label={`Screen capture at ${formatSnapshotTime(entry.occurredAt)}`}
                      style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <p style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}>Screen capture</p>
                      <img src={screenshot} alt="" style={{ marginBottom: 4, height: 80, width: '100%', borderRadius: 8, objectFit: 'cover' }} />
                    </button>
                  )}
                  {!screenshot && entry.screenshotCapReached && (
                    <p style={{ marginBottom: 4, fontSize: 10, color: 'var(--muted)' }}>Screen-capture limit reached — no image for this event</p>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{formatSnapshotTime(entry.occurredAt)}</p>
                  {entry.kind === 'violation' && (
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--danger)', margin: 0 }}>
                      {entry.reason} — strike {entry.strike}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {hasTabActivityContent(candidate.tabActivitySummary ?? [], candidate.proctoringAnalysis) && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>Tabs &amp; Background Apps</h2>
          <TabActivitySummaryCard summary={candidate.tabActivitySummary ?? []} proctoringAnalysis={candidate.proctoringAnalysis} />
        </div>
      )}

      <Dialog
        open={selectedSnapshot !== null}
        onClose={() => setSelectedSnapshot(null)}
        title={selectedSnapshot ? formatSnapshotModalTitle(selectedSnapshot) : ''}
        width={560}
      >
        {selectedSnapshot && selectedSnapshot.snapshot !== '' && (
          <img src={selectedSnapshot.snapshot} alt="Webcam snapshot" style={{ width: '100%', borderRadius: 8 }} />
        )}
      </Dialog>

      <Dialog open={selectedScreenshot !== null} onClose={() => setSelectedScreenshot(null)} title="Screen Capture" width={900}>
        {selectedScreenshot && (
          <div style={{ position: 'relative' }}>
            <a
              href={selectedScreenshot}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open screen capture in a new tab"
              style={{ position: 'absolute', right: 8, top: 8, display: 'inline-flex', borderRadius: 8, background: 'rgba(0,0,0,.6)', padding: 6, color: '#fff' }}
            >
              <ExternalLink size={16} />
            </a>
            {/* A fixed-height, centered presentation box (not a bare max-h/max-w img)
             *  so a real proctoring screenshot's aspect ratio -- which is usually wider
             *  than this modal's content width, making height the binding constraint --
             *  shrinks the rendered image on BOTH axes and centers it, instead of the
             *  browser's default flush-left alignment dumping all the resulting slack
             *  as blank space on one side. object-contain never crops the evidence. */}
            <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 8, background: 'var(--surface)' }}>
              <img src={selectedScreenshot} alt="Screen capture" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={selectedFaceImage !== null} onClose={() => setSelectedFaceImage(null)} title={selectedFaceImage?.title ?? ''} width={560}>
        {selectedFaceImage && <img src={selectedFaceImage.src} alt={selectedFaceImage.title} style={{ width: '100%', borderRadius: 8 }} />}
      </Dialog>

      {attemptId && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' }}>AI Insight</h2>
          {insightLoading ? (
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Loading…</p>
          ) : insight?.summary ? (
            <div style={card}>
              <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0 }}>{insight.summary}</p>
            </div>
          ) : insight?.status === 'skipped_no_ai_key' ? (
            // Deliberately NO Retry button: this is not a transient failure. An entire
            // 104-candidate round at one org saw the "usually temporary -- try again" copy
            // below for a missing key, and Retry could never have succeeded. Say what it is
            // and where the fix lives.
            <div style={card}>
              <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0 }}>
                AI insight is not available because this organization has no AI provider configured. An organization
                administrator can add one under Settings → Integrations; existing reports can then be regenerated.
              </p>
            </div>
          ) : insight?.status === 'failed' ? (
            <div style={card}>
              <p style={{ marginBottom: 12, fontSize: 14, color: 'var(--danger)' }}>Generation failed. This is usually temporary — try again.</p>
              <button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: regenerate.isPending ? 0.5 : 1 }} disabled={regenerate.isPending} onClick={handleRegenerate}>
                Retry
              </button>
            </div>
          ) : (
            <div style={card}>
              <p style={{ marginBottom: 12, fontSize: 14, color: 'var(--muted)' }}>Not yet generated</p>
              <button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: regenerate.isPending ? 0.5 : 1 }} disabled={regenerate.isPending} onClick={handleRegenerate}>
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {candidate.sections.map((section) => (
          <div key={section.sectionId} style={card}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{section.title}</h3>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {section.score}/{section.maxScore} · {section.weightPercent}% weight
                {section.requiredCount != null ? ` · best ${section.requiredCount} of ${section.questions.length} counted` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {section.questions.map((question, qIndex) => (
                <div key={question.questionId} style={qIndex === 0 ? { paddingTop: 0 } : { borderTop: '1px solid var(--hair)', paddingTop: 12, marginTop: 12 }}>
                  <TabActivityBanner entries={question.tabActivity ?? []} />
                  <p style={{ marginBottom: 8, fontSize: 14, color: 'var(--ink)' }}>
                    {question.questionText}
                    {question.counted === false && (
                      <span style={{ marginLeft: 8, borderRadius: 6, background: 'var(--surface)', color: 'var(--muted)', padding: '1px 6px', fontSize: 11 }}>Not counted</span>
                    )}
                  </p>
                  {question.type === 'code' ? (
                    // A code question has no options, so the loop below would render nothing and
                    // the submission would be invisible here -- the only place it can still be
                    // read once grading has finalized the attempt.
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                        <span>{question.codeLanguage ?? 'code'}</span>
                        <span>·</span>
                        <span>
                          {question.marksAwarded ?? 0}/{question.marks}
                        </span>
                      </div>
                      <pre style={{ overflowX: 'auto', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', padding: 12, fontSize: 12 }}>
                        {question.answerText?.trim() ? question.answerText : 'Not attempted.'}
                      </pre>
                      {question.gradingFeedback && (
                        <p style={{ border: '1px solid var(--hair)', borderRadius: 8, padding: 8, fontSize: 12, color: 'var(--ink)' }}>
                          <span style={{ fontWeight: 500 }}>Feedback: </span>
                          {question.gradingFeedback}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {question.options.map((option) => {
                        const wasSelected = question.selectedOptionIds.includes(option.id);
                        const isCorrectOption = question.correctOptionIds.includes(option.id);
                        return (
                          <p
                            key={option.id}
                            style={
                              isCorrectOption
                                ? { fontSize: 14, fontWeight: 500, color: VIZ.green, margin: 0 }
                                : wasSelected
                                  ? { fontSize: 14, fontWeight: 500, color: 'var(--danger)', margin: 0 }
                                  : { fontSize: 14, color: 'var(--muted)', margin: 0 }
                            }
                          >
                            {wasSelected ? '◉' : '○'} {option.text}
                            {isCorrectOption ? ' (correct)' : ''}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
