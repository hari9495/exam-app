'use client';

import { useState, useEffect } from 'react';
import { useQuestions } from '../lib/hooks/useQuestions';
import { useReplaceSectionQuestions } from '../lib/hooks/useExamSections';
import { Modal, Checkbox, Button } from '../components/ui';

interface SectionQuestionPickerProps {
  examId: string;
  sectionId: string;
  open: boolean;
  onClose: () => void;
  existingQuestionIds: string[];
}

export function SectionQuestionPicker({ examId, sectionId, open, onClose, existingQuestionIds }: SectionQuestionPickerProps) {
  const { data: questionsResponse } = useQuestions({ pageSize: 100 });
  const questions = questionsResponse?.data;
  const replaceQuestions = useReplaceSectionQuestions(examId, sectionId);
  const [selectedIds, setSelectedIds] = useState<string[]>(existingQuestionIds);

  useEffect(() => {
    setSelectedIds(existingQuestionIds);
  }, [existingQuestionIds, open]);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleSave() {
    replaceQuestions.mutate(selectedIds, { onSuccess: onClose });
  }

  return (
    <Modal open={open} title="Add questions to section" onClose={onClose}>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {(questions ?? []).map((question) => (
          <div key={question.id} className="flex items-center justify-between gap-2">
            <Checkbox
              label={question.text}
              checked={selectedIds.includes(question.id)}
              onChange={(checked) => toggle(question.id, checked)}
            />
            <span className="text-xs text-gray-500">{question.marks} marks</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave}>Save questions</Button>
      </div>
    </Modal>
  );
}
