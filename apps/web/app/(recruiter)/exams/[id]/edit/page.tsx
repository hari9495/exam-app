'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExamDetailsForm } from '../../../../../components/ExamDetailsForm';
import { WalkInShareCard } from '../../../../../components/WalkInShareCard';
import { ExamSectionsPanel } from '../../../../../components/ExamSectionsPanel';
import { LiveMonitoringPanel } from '../../../../../components/LiveMonitoringPanel';
import { GradingQueuePanel } from '../../../../../components/GradingQueuePanel';
import { LeaderboardPanel } from '../../../../../components/LeaderboardPanel';
import { CandidatesPanel } from '../../../../../components/CandidatesPanel';
import { ExamResultsPanel } from '../../../../../components/ExamResultsPanel';
import { AuditHistoryLink } from '../../../../../components/AuditHistoryLink';
import {
  useExam,
  useUpdateExam,
  usePublishExam,
  useUnpublishExam,
  useSetWalkInEnabled,
  useSetWalkInListed,
} from '../../../../../lib/hooks/useExams';
import { useAuth } from '../../../../../lib/auth-context';
import { useExamMonitoring } from '../../../../../lib/hooks/useExamMonitoring';
import { useAttentionNotifications } from '../../../../../lib/hooks/useAttentionNotifications';
import { flaggedAttemptIds } from '../../../../../lib/attention-alert';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, Checkbox, useToast } from '../../../../../components/ui';
import { BackLink } from '../../../../../components/BackLink';

export default function EditExamPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { organizationSlug } = useAuth();
  const { data: exam } = useExam(params.id);
  const updateExam = useUpdateExam(params.id);
  const publishExam = usePublishExam(params.id);
  const unpublishExam = useUnpublishExam(params.id);
  const setWalkInEnabled = useSetWalkInEnabled(params.id);
  const setWalkInListed = useSetWalkInListed(params.id);
  const monitoring = useExamMonitoring(params.id);

  // The flag is derived from Date.now(), and a burst that stops produces no further
  // socket events -- without this tick nothing would re-render and the badge would
  // stay lit after the candidate had settled down.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  // A recruiter who relaxes proctoring has already acted on this candidate. The bypass
  // suppresses enforcement, not recording, so events keep arriving -- without this the
  // row would show "Proctoring relaxed" and "Needs attention" side by side for the rest
  // of the exam and keep re-notifying about the one candidate already dealt with.
  // Nothing is remembered: revoking the bypass makes the attempt flaggable again.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is otherwise unused but is what drives decay of the flag over time
  const flagged = useMemo(() => {
    const ids = flaggedAttemptIds(monitoring.alerts, Date.now());
    for (const row of monitoring.roster) {
      if (row.attemptId && row.proctoringBypassed) ids.delete(row.attemptId);
    }
    return ids;
  }, [monitoring.alerts, monitoring.roster, tick]);

  const candidateNames = useMemo(
    () => new Map(monitoring.roster.filter((row) => row.attemptId).map((row) => [row.attemptId as string, row.candidateName])),
    [monitoring.roster],
  );
  // The hook must be called unconditionally, before the early return below, and the
  // exam may still be loading -- a notification with an empty title reads as broken,
  // so fall back to something meaningful rather than to ''.
  const notifications = useAttentionNotifications(flagged, candidateNames, exam?.title || 'Live exam', params.id);

  if (!exam) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  // Two independent lock reasons, both enforced server-side too: a candidate having
  // started is permanent (no Unpublish can undo it); being published with nobody
  // started yet is reversible -- Unpublish reopens editing immediately.
  const detailsLocked = exam.hasStartedAttempts || exam.status === 'published';
  const detailsLockedMessage = exam.hasStartedAttempts
    ? undefined // falls back to ExamDetailsForm's own "candidate started" text
    : exam.status === 'published'
      ? 'This exam is published, so its details are locked. Click Unpublish above to make changes.'
      : undefined;

  return (
    <div>
      <BackLink href="/exams" label="Back To Exams" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{exam.title}</h1>
          <AuditHistoryLink
            entityType="exam"
            entityId={exam.id}
            entityName={exam.title}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          />
        </div>
        <div className="flex gap-2">
          <Link href={`/exams/${exam.id}/preview`}>
            <Button variant="secondary">Preview</Button>
          </Link>
          {exam.status === 'draft' && (
            <Button
              onClick={() =>
                publishExam.mutate(undefined, {
                  onSuccess: () => toast('Exam published.'),
                  onError: (error) => {
                    toast(error instanceof Error ? error.message : 'Failed to publish exam.', 'error');
                  },
                })
              }
            >
              Publish
            </Button>
          )}
          {exam.status === 'published' && !exam.hasStartedAttempts && (
            <Button
              variant="secondary"
              loading={unpublishExam.isPending}
              onClick={() =>
                unpublishExam.mutate(undefined, {
                  onSuccess: () => toast('Exam unpublished — you can edit it now.'),
                  onError: (error) => {
                    toast(error instanceof Error ? error.message : 'Failed to unpublish exam.', 'error');
                  },
                })
              }
            >
              Unpublish
            </Button>
          )}
        </div>
      </div>
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sections">Sections &amp; Questions</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="live">Live{flagged.size > 0 ? ` (${flagged.size})` : ''}</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          {/* Grading only ever does anything for code questions -- every other type
              auto-grades. Hidden rather than shown empty for an exam that can't
              produce one. */}
          {exam.requiresManualGrading && <TabsTrigger value="grading">Grading</TabsTrigger>}
        </TabsList>
        <TabsContent value="details">
          <div className="mx-auto max-w-3xl">
            <ExamDetailsForm
              initialExam={exam}
              submitLabel="Save details"
              locked={detailsLocked}
              lockedMessage={detailsLockedMessage}
              hideWalkInField={detailsLocked}
              walkInSlot={
                // Rendered outside the Details form's own disabled fieldset (see
                // hideWalkInField) purely so the share card's Copy/Share buttons keep
                // working once published -- the checkboxes themselves are locked below,
                // same as every other field: change walk-in settings via Unpublish.
                detailsLocked && (
                  <>
                    <Checkbox
                      label="Enable Walk-In Registration For This Exam"
                      checked={exam.walkInEnabled}
                      disabled={detailsLocked}
                      onChange={(checked) =>
                        setWalkInEnabled.mutate(checked, {
                          onSuccess: () => toast(checked ? 'Walk-in registration enabled.' : 'Walk-in registration disabled.'),
                          onError: (error) => {
                            toast(error instanceof Error ? error.message : 'Failed to update walk-in registration.', 'error');
                          },
                        })
                      }
                    />
                    {exam.walkInEnabled && (
                      <>
                        <Checkbox
                          label="Show In The Shared Walk-In Exam List"
                          checked={exam.walkInListed}
                          disabled={detailsLocked}
                          onChange={(checked) =>
                            setWalkInListed.mutate(checked, {
                              onSuccess: () => toast(checked ? 'Now shown in the shared walk-in list.' : 'Hidden from the shared walk-in list.'),
                              onError: (error) => {
                                toast(error instanceof Error ? error.message : 'Failed to update the walk-in list setting.', 'error');
                              },
                            })
                          }
                        />
                        {organizationSlug && <WalkInShareCard examId={exam.id} orgSlug={organizationSlug} />}
                      </>
                    )}
                  </>
                )
              }
              onSubmit={(input) =>
                updateExam.mutate(input, {
                  onSuccess: () => toast('Exam updated.'),
                  onError: (error) => {
                    toast(error instanceof Error ? error.message : 'Failed to update exam.', 'error');
                  },
                })
              }
            />
          </div>
        </TabsContent>
        <TabsContent value="sections">
          <ExamSectionsPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="candidates">
          <CandidatesPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="live">
          <LiveMonitoringPanel
            flagged={flagged}
            roster={monitoring.roster}
            rosterUpdatedAt={monitoring.rosterUpdatedAt}
            onRefresh={monitoring.refresh}
            alerts={monitoring.alerts}
            connectionStatus={monitoring.connectionStatus}
            joinError={monitoring.joinError}
            notificationPermission={notifications.permission}
            onEnableNotifications={notifications.requestPermission}
          />
        </TabsContent>
        <TabsContent value="results">
          <ExamResultsPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="leaderboard">
          <LeaderboardPanel leaderboard={monitoring.leaderboard} />
        </TabsContent>
        {exam.requiresManualGrading && (
          <TabsContent value="grading">
            <GradingQueuePanel examId={exam.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
