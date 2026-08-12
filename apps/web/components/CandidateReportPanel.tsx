'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import {
  useCandidateReport,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsList,
} from '../lib/hooks/usePanelReports';
import { useSystemEvents } from '../lib/hooks/useSystemEvents';
import { plainEnglish } from '../lib/system-event-message';
import type { WebcamTimelineEntry, FaceMismatchEntry } from '../lib/types';
import { Badge, Button, Card, Modal, StatusBadge, IntegrityBadge, useToast, type StatusTone } from './ui';
import { AuditHistoryLink } from './AuditHistoryLink';
import { TabActivitySummaryCard, TabActivityBanner, hasTabActivityContent } from './TabActivity';

const PASS_FAIL_VARIANT: Record<string, 'success' | 'danger'> = { pass: 'success', fail: 'danger' };
const SEVERITY_TONE: Record<string, StatusTone> = { high: 'danger', medium: 'warning', low: 'neutral' };

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

  const handleRegenerate = () => {
    if (!attemptId) return;
    regenerate.mutateAsync(attemptId).catch((error) => {
      toast(error instanceof Error ? error.message : 'Failed to generate AI insight.', 'error');
    });
  };

  if (isLoading || !candidate) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{candidate.candidateName}</h1>
          <AuditHistoryLink
            entityType="candidate"
            entityId={candidateId}
            entityName={candidate.candidateName}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline print:hidden"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.print()} className="inline-flex items-center print:hidden">
            <Download size={16} className="mr-1.5" />
            Export report
          </Button>
          {candidate.passFail && <Badge variant={PASS_FAIL_VARIANT[candidate.passFail] ?? 'default'}>{candidate.passFail}</Badge>}
          <IntegrityBadge level={integrity?.level} />
        </div>
      </div>

      {integrity && (integrity.narrative || integrity.flags.length > 0) && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Integrity Analysis</h2>
          {integrity.narrative && <p className="mb-3 text-sm text-gray-700">{integrity.narrative}</p>}
          {integrity.flags.length > 0 && (
            <ul className="flex flex-col gap-2">
              {integrity.flags.map((flag, index) => {
                const questionText = flag.questionId ? questionTextById.get(flag.questionId) : undefined;
                const counterpart =
                  flag.type === 'similarity_match' && flag.counterpartAttemptId
                    ? results?.find((row) => row.attemptId === flag.counterpartAttemptId)
                    : undefined;
                return (
                  <li key={index} className="rounded border border-gray-200 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span>{flag.detail}</span>
                      <StatusBadge tone={SEVERITY_TONE[flag.severity] ?? 'neutral'}>{flag.severity}</StatusBadge>
                    </div>
                    {questionText && <p className="text-xs text-gray-500">Question: {questionText}</p>}
                    {counterpart &&
                      (onOpenCandidate ? (
                        <button
                          type="button"
                          onClick={() => onOpenCandidate(counterpart.candidateId, counterpart.attemptId)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View {counterpart.candidateName}&rsquo;s report
                        </button>
                      ) : (
                        <Link
                          href={`/reports/${examId}/candidates/${counterpart.candidateId}?attemptId=${counterpart.attemptId ?? ''}`}
                          className="text-xs font-medium text-primary"
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

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}>
        <Card className="mb-6">
          <p className="text-xs text-gray-500">Score</p>
          <p className="text-2xl font-semibold">
            {candidate.percentage !== null ? `${candidate.percentage.toFixed(1)}%` : '—'}
            {candidate.score !== null && candidate.maxScore !== null && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({candidate.score}/{candidate.maxScore})
              </span>
            )}
          </p>
        </Card>
      </motion.div>

      {candidate.faceEnrolment && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Face Verification</h2>
          <Card>
            {referenceImageUrl ? (
              <>
                <div className="flex items-center gap-3">
                  <img
                    src={referenceImageUrl}
                    alt="Reference photo"
                    className="h-20 w-20 rounded object-cover"
                  />
                  <div className="text-sm text-gray-700">
                    <p className="font-medium capitalize">{candidate.faceEnrolment.status.replace(/_/g, ' ')}</p>
                    {candidate.faceEnrolment.capturedAt && (
                      <p className="text-xs text-gray-500">Captured {new Date(candidate.faceEnrolment.capturedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                {/* Stage 2 is flag-only and the score is uncalibrated (see ExamDetailsForm's note),
                    so this is put in front of a recruiter as evidence to look at, not a verdict --
                    both faces rendered together, at a size a face is actually recognisable at. */}
                {faceMismatches.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
                    <p className="text-xs font-medium uppercase text-gray-400">Flagged snapshots — compare before acting</p>
                    {faceMismatches.map((mismatch, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <div className="text-center">
                          <img
                            src={referenceImageUrl}
                            alt="Reference photo"
                            className="h-24 w-24 rounded object-cover"
                          />
                          <p className="mt-1 text-[10px] text-gray-400">Reference</p>
                        </div>
                        <div className="text-center">
                          {mismatch.snapshotUrl ? (
                            <img src={mismatch.snapshotUrl} alt="Flagged snapshot" className="h-24 w-24 rounded object-cover" />
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                              No image
                            </div>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400">Flagged snapshot</p>
                        </div>
                        <div className="text-sm text-gray-700">
                          <p>{formatSnapshotTime(mismatch.occurredAt)}</p>
                          {mismatch.score !== null && (
                            <p className="text-xs text-gray-500">Similarity score: {mismatch.score.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Not verified — no reference photo was captured</p>
            )}
          </Card>
        </div>
      )}

      {technicalIssues.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Technical Issues During Exam</h2>
          <ul className="flex flex-col gap-1.5">
            {technicalIssues.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2 rounded border border-gray-200 p-2.5 text-sm">
                <span className="whitespace-nowrap text-xs text-gray-500">{new Date(event.occurredAt).toLocaleString()}</span>
                {/* Recruiters read this section, so it gets the same plain-English
                    translation as System Logs; the raw message stays on hover. */}
                <span className="text-gray-800" title={event.message}>
                  {plainEnglish(event).summary}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Webcam Timeline</h2>
        {candidate.webcamTimeline.length === 0 ? (
          <p className="text-sm text-gray-500">No webcam snapshots recorded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {candidate.webcamTimeline.map((entry, index) => {
              const screenshot = typeof entry.screenshot === 'string' && entry.screenshot !== '' ? entry.screenshot : null;
              return (
                <div
                  key={index}
                  className={`rounded border-2 p-2 text-left ${entry.kind === 'violation' ? 'border-red-500' : 'border-gray-200'}`}
                >
                  {entry.snapshot !== '' ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSnapshot(entry)}
                      aria-label={`Webcam snapshot at ${formatSnapshotTime(entry.occurredAt)}`}
                      className="block w-full"
                    >
                      <img src={entry.snapshot} alt="" className="mb-1 h-20 w-full rounded object-cover" />
                    </button>
                  ) : !screenshot && !entry.screenshotCapReached ? (
                    <div className="mb-1 flex h-20 w-full items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                      No image
                    </div>
                  ) : null}
                  {screenshot && (
                    <button
                      type="button"
                      onClick={() => setSelectedScreenshot(screenshot)}
                      aria-label={`Screen capture at ${formatSnapshotTime(entry.occurredAt)}`}
                      className="block w-full"
                    >
                      <p className="text-[10px] font-medium uppercase text-gray-400">Screen capture</p>
                      <img src={screenshot} alt="" className="mb-1 h-20 w-full rounded object-cover" />
                    </button>
                  )}
                  {!screenshot && entry.screenshotCapReached && (
                    <p className="mb-1 text-[10px] text-gray-400">Screen-capture limit reached — no image for this event</p>
                  )}
                  <p className="text-xs text-gray-500">{formatSnapshotTime(entry.occurredAt)}</p>
                  {entry.kind === 'violation' && (
                    <p className="text-xs font-medium text-red-700">
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
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-medium">Tabs &amp; Background Apps</h2>
          <TabActivitySummaryCard summary={candidate.tabActivitySummary ?? []} proctoringAnalysis={candidate.proctoringAnalysis} />
        </div>
      )}

      <Modal
        open={selectedSnapshot !== null}
        title={selectedSnapshot ? formatSnapshotModalTitle(selectedSnapshot) : ''}
        onClose={() => setSelectedSnapshot(null)}
      >
        {selectedSnapshot && selectedSnapshot.snapshot !== '' && (
          <img src={selectedSnapshot.snapshot} alt="Webcam snapshot" className="w-full rounded" />
        )}
      </Modal>

      <Modal open={selectedScreenshot !== null} title="Screen Capture" onClose={() => setSelectedScreenshot(null)}>
        {selectedScreenshot && <img src={selectedScreenshot} alt="Screen capture" className="w-full rounded" />}
      </Modal>

      {attemptId && (
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        >
          <h2 className="mb-2 text-lg font-medium">AI Insight</h2>
          {insightLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : insight?.summary ? (
            <Card>
              <p className="text-sm text-gray-700">{insight.summary}</p>
            </Card>
          ) : insight?.status === 'failed' ? (
            <Card>
              <p className="mb-3 text-sm text-red-700">Generation failed. This is usually temporary — try again.</p>
              <Button variant="secondary" disabled={regenerate.isPending} onClick={handleRegenerate}>
                Retry
              </Button>
            </Card>
          ) : (
            <Card>
              <p className="mb-3 text-sm text-gray-500">Not yet generated</p>
              <Button variant="secondary" disabled={regenerate.isPending} onClick={handleRegenerate}>
                Regenerate
              </Button>
            </Card>
          )}
        </motion.div>
      )}

      <div className="flex flex-col gap-4">
        {candidate.sections.map((section, index) => (
          <motion.div
            key={section.sectionId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + Math.min(index, 8) * 0.05, ease: 'easeOut' }}
          >
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-medium">{section.title}</h3>
                <span className="text-sm text-gray-500">
                  {section.score}/{section.maxScore} · {section.weightPercent}% weight
                  {section.requiredCount != null ? ` · best ${section.requiredCount} of ${section.questions.length} counted` : ''}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {section.questions.map((question) => (
                  <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                    <TabActivityBanner entries={question.tabActivity ?? []} />
                    <p className="mb-2 text-sm text-gray-800">
                      {question.questionText}
                      {question.counted === false && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Not counted</span>
                      )}
                    </p>
                    {question.type === 'code' ? (
                      // A code question has no options, so the loop below would render nothing and
                      // the submission would be invisible here -- the only place it can still be
                      // read once grading has finalized the attempt.
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{question.codeLanguage ?? 'code'}</span>
                          <span>·</span>
                          <span>
                            {question.marksAwarded ?? 0}/{question.marks}
                          </span>
                        </div>
                        <pre className="overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-800">
                          {question.answerText?.trim() ? question.answerText : 'Not attempted.'}
                        </pre>
                        {question.gradingFeedback && (
                          <p className="rounded border border-gray-200 p-2 text-xs text-gray-700">
                            <span className="font-medium">Feedback: </span>
                            {question.gradingFeedback}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {question.options.map((option) => {
                          const wasSelected = question.selectedOptionIds.includes(option.id);
                          const isCorrectOption = question.correctOptionIds.includes(option.id);
                          return (
                            <p
                              key={option.id}
                              className={
                                isCorrectOption
                                  ? 'text-sm font-medium text-green-700'
                                  : wasSelected
                                    ? 'text-sm font-medium text-red-700'
                                    : 'text-sm text-gray-600'
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
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
