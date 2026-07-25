'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExamDetailsForm } from '../../../../../components/ExamDetailsForm';
import { ExamSectionsPanel } from '../../../../../components/ExamSectionsPanel';
import { LiveMonitoringPanel } from '../../../../../components/LiveMonitoringPanel';
import { GradingQueuePanel } from '../../../../../components/GradingQueuePanel';
import { LeaderboardPanel } from '../../../../../components/LeaderboardPanel';
import { CandidatesPanel } from '../../../../../components/CandidatesPanel';
import { useExam, useUpdateExam, usePublishExam } from '../../../../../lib/hooks/useExams';
import { useExamMonitoring } from '../../../../../lib/hooks/useExamMonitoring';
import { useAttentionNotifications } from '../../../../../lib/hooks/useAttentionNotifications';
import { flaggedAttemptIds } from '../../../../../lib/attention-alert';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, useToast } from '../../../../../components/ui';

export default function EditExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: exam } = useExam(params.id);
  const updateExam = useUpdateExam(params.id);
  const publishExam = usePublishExam(params.id);
  const monitoring = useExamMonitoring(params.id);

  // The flag is derived from Date.now(), and a burst that stops produces no further
  // socket events -- without this tick nothing would re-render and the badge would
  // stay lit after the candidate had settled down.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is otherwise unused but is what drives decay of the flag over time
  const flagged = useMemo(() => flaggedAttemptIds(monitoring.alerts, Date.now()), [monitoring.alerts, tick]);

  const candidateNames = useMemo(
    () => new Map(monitoring.roster.filter((row) => row.attemptId).map((row) => [row.attemptId as string, row.candidateName])),
    [monitoring.roster],
  );
  // exam?.title falls back to '' while the exam is still loading -- the hook must be
  // called unconditionally, before the early return below.
  const notifications = useAttentionNotifications(flagged, candidateNames, exam?.title ?? '');

  if (!exam) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{exam.title}</h1>
        <div className="flex gap-2">
          <Link href={`/exams/${exam.id}/preview`}>
            <Button variant="secondary">Preview</Button>
          </Link>
          {exam.status === 'draft' && (
            <Button
              onClick={() =>
                publishExam.mutate(undefined, {
                  onSuccess: () => {
                    toast('Exam published.');
                    router.push('/exams');
                  },
                  onError: (error) => {
                    toast(error instanceof Error ? error.message : 'Failed to publish exam.', 'error');
                  },
                })
              }
            >
              Publish
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
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="grading">Grading</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <ExamDetailsForm
            initialExam={exam}
            submitLabel="Save details"
            locked={exam.hasStartedAttempts}
            onSubmit={(input) =>
              updateExam.mutate(input, {
                onSuccess: () => toast('Exam updated.'),
                onError: (error) => {
                  toast(error instanceof Error ? error.message : 'Failed to update exam.', 'error');
                },
              })
            }
          />
        </TabsContent>
        <TabsContent value="sections">
          <ExamSectionsPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="candidates">
          <CandidatesPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="live">
          <LiveMonitoringPanel
            examId={exam.id}
            flagged={flagged}
            roster={monitoring.roster}
            alerts={monitoring.alerts}
            connectionStatus={monitoring.connectionStatus}
            joinError={monitoring.joinError}
            notificationPermission={notifications.permission}
            onEnableNotifications={notifications.requestPermission}
          />
        </TabsContent>
        <TabsContent value="leaderboard">
          <LeaderboardPanel leaderboard={monitoring.leaderboard} />
        </TabsContent>
        <TabsContent value="grading">
          <GradingQueuePanel examId={exam.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
