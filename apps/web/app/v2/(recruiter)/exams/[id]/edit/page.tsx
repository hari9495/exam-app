'use client';

// v2 Edit exam page — v2 shell (header + tabs) and v2 ExamDetailsForm for the Details tab. The
// monitoring/flag/notification logic and lock rules are preserved verbatim from the old page. The
// Sections and data panels are reused as-is inside the v2 shell for now (v2 restyle is a follow-up).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ExamDetailsForm } from '../../ExamDetailsForm';
import { WalkInShareCard } from '../../../../../../components/WalkInShareCard';
import { ExamSectionsPanel } from '../../ExamSectionsPanel';
import { LiveMonitoringPanel } from '../../../../../../components/LiveMonitoringPanel';
import { GradingQueuePanel } from '../../GradingQueuePanel';
import { LeaderboardPanel } from '../../LeaderboardPanel';
import { CandidatesPanel } from '../../CandidatesPanel';
import { ExamResultsPanel } from '../../ExamResultsPanel';
import { AuditHistoryLink } from '../../../../../../components/AuditHistoryLink';
import { useExam, useUpdateExam, usePublishExam, useUnpublishExam, useSetWalkInEnabled, useSetWalkInListed } from '../../../../../../lib/hooks/useExams';
import { useAuth } from '../../../../../../lib/auth-context';
import { useExamMonitoring } from '../../../../../../lib/hooks/useExamMonitoring';
import { useAttentionNotifications } from '../../../../../../lib/hooks/useAttentionNotifications';
import { flaggedAttemptIds } from '../../../../../../lib/attention-alert';
import { Checkbox, useToast } from '../../../../../../components/ui';
import { Tabs, dt } from '../../../../../../components/ui-v2';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };

export default function V2EditExamPage() {
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
  const [activeTab, setActiveTab] = useState('details');

  // The flag is derived from Date.now(); a burst that stops produces no further socket events, so
  // this tick re-renders to let the badge decay. (Verbatim from the old page.)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is otherwise unused but drives decay of the flag over time
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
  const notifications = useAttentionNotifications(flagged, candidateNames, exam?.title || 'Live exam', params.id);

  if (!exam) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>;

  const detailsLocked = exam.hasStartedAttempts || exam.status === 'published';
  const detailsLockedMessage = exam.hasStartedAttempts
    ? undefined
    : exam.status === 'published'
      ? 'This exam is published, so its details are locked. Click Unpublish above to make changes.'
      : undefined;

  const tabs = [
    { value: 'details', label: 'Details' },
    { value: 'sections', label: 'Sections & Questions' },
    { value: 'candidates', label: 'Candidates' },
    { value: 'live', label: 'Live', badge: flagged.size || undefined },
    { value: 'results', label: 'Results' },
    { value: 'leaderboard', label: 'Leaderboard' },
    ...(exam.requiresManualGrading ? [{ value: 'grading', label: 'Grading' }] : []),
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Link href="/v2/exams" style={backLink}><ArrowLeft size={15} /> Back to Exams</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, margin: '10px 0 16px' }}>
        <div>
          <h1 className="v2-title" style={{ fontSize: 22, margin: '0 0 4px' }}>{exam.title}</h1>
          <AuditHistoryLink entityType="exam" entityId={exam.id} entityName={exam.title} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/exams/${exam.id}/preview`} style={{ ...dt.toolBtn, textDecoration: 'none' }}>Preview</Link>
          {exam.status === 'draft' && (
            <button type="button" style={dt.primaryBtn} disabled={publishExam.isPending}
              onClick={() => publishExam.mutate(undefined, {
                onSuccess: () => toast('Exam published.'),
                onError: (error) => toast(error instanceof Error ? error.message : 'Failed to publish exam.', 'error'),
              })}>
              Publish
            </button>
          )}
          {exam.status === 'published' && !exam.hasStartedAttempts && (
            <button type="button" style={dt.toolBtn} disabled={unpublishExam.isPending}
              onClick={() => unpublishExam.mutate(undefined, {
                onSuccess: () => toast('Exam unpublished — you can edit it now.'),
                onError: (error) => toast(error instanceof Error ? error.message : 'Failed to unpublish exam.', 'error'),
              })}>
              Unpublish
            </button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'details' && (
        <div style={{ maxWidth: 760 }}>
          <ExamDetailsForm
            initialExam={exam} submitLabel="Save details" submitting={updateExam.isPending}
            locked={detailsLocked} lockedMessage={detailsLockedMessage} hideWalkInField={detailsLocked}
            walkInSlot={detailsLocked && (
              <>
                <Checkbox label="Enable Walk-In Registration For This Exam" checked={exam.walkInEnabled} disabled={detailsLocked}
                  onChange={(checked) => setWalkInEnabled.mutate(checked, {
                    onSuccess: () => toast(checked ? 'Walk-in registration enabled.' : 'Walk-in registration disabled.'),
                    onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update walk-in registration.', 'error'),
                  })} />
                {exam.walkInEnabled && (
                  <>
                    <Checkbox label="Show In The Shared Walk-In Exam List" checked={exam.walkInListed} disabled={detailsLocked}
                      onChange={(checked) => setWalkInListed.mutate(checked, {
                        onSuccess: () => toast(checked ? 'Now shown in the shared walk-in list.' : 'Hidden from the shared walk-in list.'),
                        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update the walk-in list setting.', 'error'),
                      })} />
                    {organizationSlug && <WalkInShareCard examId={exam.id} orgSlug={organizationSlug} />}
                  </>
                )}
              </>
            )}
            onSubmit={(input) => updateExam.mutate(input, {
              onSuccess: () => toast('Exam updated.'),
              onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update exam.', 'error'),
            })}
          />
        </div>
      )}
      {activeTab === 'sections' && <ExamSectionsPanel examId={exam.id} />}
      {activeTab === 'candidates' && <CandidatesPanel examId={exam.id} />}
      {activeTab === 'live' && (
        <LiveMonitoringPanel
          flagged={flagged} roster={monitoring.roster} rosterUpdatedAt={monitoring.rosterUpdatedAt}
          onRefresh={monitoring.refresh} alerts={monitoring.alerts} connectionStatus={monitoring.connectionStatus}
          joinError={monitoring.joinError} notificationPermission={notifications.permission}
          onEnableNotifications={notifications.requestPermission}
        />
      )}
      {activeTab === 'results' && <ExamResultsPanel examId={exam.id} />}
      {activeTab === 'leaderboard' && <LeaderboardPanel leaderboard={monitoring.leaderboard} />}
      {activeTab === 'grading' && exam.requiresManualGrading && <GradingQueuePanel examId={exam.id} />}
    </div>
  );
}
