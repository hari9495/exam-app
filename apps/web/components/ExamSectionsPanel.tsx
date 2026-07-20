'use client';

import { useState } from 'react';
import { useExam } from '../lib/hooks/useExams';
import { useCreateSection } from '../lib/hooks/useExamSections';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import { Button, Input, Card, useToast } from '../components/ui';

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const createSection = useCreateSection(examId);
  const [newTitle, setNewTitle] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const { toast } = useToast();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSection.mutate(
      { title: newTitle },
      {
        onSuccess: () => setNewTitle(''),
        onError: (error) => toast(error instanceof Error ? error.message : 'Failed to add section.', 'error'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(exam?.sections ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((section) => (
          <Card key={section.id} className="flex items-center justify-between">
            <p className="font-medium">{section.title}</p>
            <Button variant="secondary" onClick={() => setPickerSectionId(section.id)}>
              Manage questions
            </Button>
          </Card>
        ))}
      <form onSubmit={handleAdd} className="flex items-end gap-2">
        <Input label="New section title" value={newTitle} onChange={setNewTitle} />
        <Button type="submit">Add section</Button>
      </form>
      {pickerSectionId && (
        <SectionQuestionPicker
          examId={examId}
          sectionId={pickerSectionId}
          open
          onClose={() => setPickerSectionId(null)}
          existingQuestionIds={exam?.sections.find((s) => s.id === pickerSectionId)?.questions.map((q) => q.questionId) ?? []}
        />
      )}
    </div>
  );
}
