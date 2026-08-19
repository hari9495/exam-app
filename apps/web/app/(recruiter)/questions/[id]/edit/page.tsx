'use client';

import { useParams, useRouter } from 'next/navigation';
import { QuestionForm } from '../../../../../components/QuestionForm';
import { BackLink } from '../../../../../components/BackLink';
import { AuditHistoryLink } from '../../../../../components/AuditHistoryLink';
import { QuestionStatisticsPanel } from '../../../../../components/QuestionStatisticsPanel';
import { useQuestion, useUpdateQuestion, useTags, useQuestionAnalytics } from '../../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../../components/ui';

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: question } = useQuestion(params.id);
  const { data: tags } = useTags();
  const { data: analytics } = useQuestionAnalytics(params.id);
  const updateQuestion = useUpdateQuestion(params.id);

  if (!question) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/questions" label="Back To Question Bank" />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Edit Question</h1>
        <AuditHistoryLink entityType="question" entityId={question.id} entityName={question.text} />
      </div>
      <QuestionForm
        initialQuestion={question}
        tags={tags ?? []}
        submitLabel="Save changes"
        onSubmit={(input) =>
          updateQuestion.mutate(input, {
            onSuccess: () => {
              toast('Question updated.');
              router.push('/questions');
            },
            onError: (error) => toast(error instanceof Error ? error.message : 'Failed to update question.', 'error'),
          })
        }
      />
      {analytics && (
        <div className="mt-8">
          <QuestionStatisticsPanel analytics={analytics} />
        </div>
      )}
    </div>
  );
}
