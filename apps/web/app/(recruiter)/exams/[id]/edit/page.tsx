'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExamDetailsForm } from '../../../../../components/ExamDetailsForm';
import { ExamSectionsPanel } from '../../../../../components/ExamSectionsPanel';
import { LiveMonitoringPanel } from '../../../../../components/LiveMonitoringPanel';
import { GradingQueuePanel } from '../../../../../components/GradingQueuePanel';
import { LeaderboardPanel } from '../../../../../components/LeaderboardPanel';
import { CandidatesPanel } from '../../../../../components/CandidatesPanel';
import { useExam, useUpdateExam, usePublishExam } from '../../../../../lib/hooks/useExams';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, useToast } from '../../../../../components/ui';

export default function EditExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: exam } = useExam(params.id);
  const updateExam = useUpdateExam(params.id);
  const publishExam = usePublishExam(params.id);

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
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="grading">Grading</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <ExamDetailsForm
            initialExam={exam}
            submitLabel="Save details"
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
          <LiveMonitoringPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="leaderboard">
          <LeaderboardPanel examId={exam.id} />
        </TabsContent>
        <TabsContent value="grading">
          <GradingQueuePanel examId={exam.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
