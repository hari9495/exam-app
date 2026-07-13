'use client';

import { useState } from 'react';
import { useExam } from '../lib/hooks/useExams';
import { useCreateSection } from '../lib/hooks/useExamSections';
import { Button, Input, Card } from '../components/ui';

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const createSection = useCreateSection(examId);
  const [newTitle, setNewTitle] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSection.mutate({ title: newTitle }, { onSuccess: () => setNewTitle('') });
  }

  return (
    <div className="flex flex-col gap-3">
      {(exam?.sections ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((section) => (
          <Card key={section.id}>
            <p className="font-medium">{section.title}</p>
          </Card>
        ))}
      <form onSubmit={handleAdd} className="flex items-end gap-2">
        <Input label="New section title" value={newTitle} onChange={setNewTitle} />
        <Button type="submit">Add section</Button>
      </form>
    </div>
  );
}
