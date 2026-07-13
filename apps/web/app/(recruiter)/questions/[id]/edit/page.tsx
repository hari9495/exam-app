'use client';

import { useParams, useRouter } from 'next/navigation';
import { QuestionForm } from '../../../../../components/QuestionForm';
import { useQuestion, useUpdateQuestion, useTags } from '../../../../../lib/hooks/useQuestions';
import { useToast } from '../../../../../components/ui';

export default function EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: question } = useQuestion(params.id);
  const { data: tags } = useTags();
  const updateQuestion = useUpdateQuestion(params.id);

  if (!question) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Edit question</h1>
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
          })
        }
      />
    </div>
  );
}
