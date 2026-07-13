'use client';

import { useParams } from 'next/navigation';
import { useExam } from '../../../../../lib/hooks/useExams';
import { Card } from '../../../../../components/ui';

export default function PreviewPage() {
  const params = useParams<{ id: string }>();
  const { data: exam } = useExam(params.id);

  if (!exam) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold">{exam.title}</h1>
      {exam.instructions && <p className="mb-6 text-sm text-gray-600">{exam.instructions}</p>}
      <div className="flex flex-col gap-4">
        {exam.sections
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((section) => (
            <Card key={section.id}>
              <h2 className="font-medium">{section.title}</h2>
            </Card>
          ))}
      </div>
    </div>
  );
}
