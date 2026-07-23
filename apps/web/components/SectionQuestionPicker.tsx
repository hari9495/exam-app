'use client';

import { useState, useEffect } from 'react';
import { useQuestions } from '../lib/hooks/useQuestions';
import { useReplaceSectionQuestions } from '../lib/hooks/useExamSections';
import { Modal, Checkbox, Button, useToast } from '../components/ui';

interface SectionQuestionPickerProps {
  examId: string;
  sectionId: string;
  open: boolean;
  onClose: () => void;
  existingQuestionIds: string[];
}

export function SectionQuestionPicker({ examId, sectionId, open, onClose, existingQuestionIds }: SectionQuestionPickerProps) {
  // ponytail: pageSize:100 is the server's max -- an org with >100 active
  // questions silently can't attach #101+ here. Upgrade path: replace with a
  // real paginated/typeahead picker if this becomes a real constraint.
  const { data: questionsResponse } = useQuestions({ pageSize: 100 });
  const questions = questionsResponse?.data;
  const replaceQuestions = useReplaceSectionQuestions(examId, sectionId);
  const [selectedIds, setSelectedIds] = useState<string[]>(existingQuestionIds);
  const { toast } = useToast();

  useEffect(() => {
    setSelectedIds(existingQuestionIds);
  }, [existingQuestionIds, open]);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleSave() {
    if ((questions ?? []).length === 0) {
      toast('Your question bank is empty. Add questions to it before adding them to a section.', 'error');
      return;
    }
    replaceQuestions.mutate(selectedIds, {
      onSuccess: onClose,
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save questions.', 'error'),
    });
  }

  return (
    <Modal open={open} title="Add questions to section" onClose={onClose}>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {(questions ?? []).length === 0 && (
          <p className="text-sm text-gray-500">No questions yet. Add questions to your question bank first.</p>
        )}
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
