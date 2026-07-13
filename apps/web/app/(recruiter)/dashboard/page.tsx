'use client';

import { useExams } from '../../../lib/hooks/useExams';
import { Card } from '../../../components/ui';

export default function DashboardPage() {
  const { data: exams } = useExams();
  const draftCount = exams?.filter((exam) => exam.status === 'draft').length ?? 0;
  const publishedCount = exams?.filter((exam) => exam.status === 'published').length ?? 0;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-500">Draft exams</p>
          <p className="text-3xl font-semibold">{draftCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500">Published exams</p>
          <p className="text-3xl font-semibold">{publishedCount}</p>
        </Card>
      </div>
    </div>
  );
}
