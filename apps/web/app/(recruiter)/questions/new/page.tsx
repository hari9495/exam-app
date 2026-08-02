'use client';

import { useRouter } from 'next/navigation';
import { QuestionForm } from '../../../../components/QuestionForm';
import { BackLink } from '../../../../components/BackLink';
import { useCreateQuestion, useTags } from '../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../components/ui';

export default function NewQuestionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: tags } = useTags();
  const createQuestion = useCreateQuestion();

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/questions" label="Back To Question Bank" />
      <h1 className="mb-6 text-2xl font-semibold">New question</h1>
      <QuestionForm
        tags={tags ?? []}
        submitLabel="Create question"
        onSubmit={(input) =>
          createQuestion.mutate(input, {
            onSuccess: () => {
              toast('Question created.');
              router.push('/questions');
            },
            onError: (error) => toast(error instanceof Error ? error.message : 'Failed to create question.', 'error'),
          })
        }
      />
    </div>
  );
}
