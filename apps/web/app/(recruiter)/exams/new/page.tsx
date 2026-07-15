'use client';

import { useRouter } from 'next/navigation';
import { ExamDetailsForm } from '../../../../components/ExamDetailsForm';
import { useCreateExam } from '../../../../lib/hooks/useExams';
import { useToast } from '../../../../components/ui';

export default function NewExamPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createExam = useCreateExam();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New exam</h1>
      <ExamDetailsForm
        submitLabel="Create exam"
        onSubmit={(input) =>
          createExam.mutate(input, {
            onSuccess: (created) => {
              toast('Exam created.');
              router.push(`/exams/${created.id}/edit`);
            },
            onError: (error) => {
              toast(error instanceof Error ? error.message : 'Failed to create exam.', 'error');
            },
          })
        }
      />
    </div>
  );
}
