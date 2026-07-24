'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useExam } from '../lib/hooks/useExams';
import { useCreateSection, useDeleteSection, useDuplicateSection } from '../lib/hooks/useExamSections';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import {
  Button,
  Input,
  Card,
  Modal,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../components/ui';
import { ExamSection } from '../lib/types';

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const createSection = useCreateSection(examId);
  const deleteSection = useDeleteSection(examId);
  const duplicateSection = useDuplicateSection(examId);
  const [newTitle, setNewTitle] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [sectionPendingDelete, setSectionPendingDelete] = useState<ExamSection | null>(null);
  const { toast } = useToast();
  const locked = exam?.status === 'published' && exam.invitationCount > 0;

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

  function handleDuplicateSection(sectionId: string) {
    duplicateSection.mutate(sectionId, {
      onSuccess: () => toast('Section duplicated.'),
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to duplicate section.', 'error'),
    });
  }

  function handleConfirmDeleteSection() {
    if (!sectionPendingDelete) return;
    deleteSection.mutate(sectionPendingDelete.id, {
      onSuccess: () => {
        toast('Section deleted.');
        setSectionPendingDelete(null);
      },
      onError: (error) => {
        toast(error instanceof Error ? error.message : 'Failed to delete section.', 'error');
        setSectionPendingDelete(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {locked && (
        <p className="text-sm text-recruiter-text-secondary">
          Sections and questions are locked because candidates have already been invited to this published exam.
        </p>
      )}
      {(exam?.sections ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((section) => (
          <Card key={section.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{section.title}</p>
              <div className="flex items-center gap-1.5">
                {!locked && (
                  <Button variant="secondary" onClick={() => setPickerSectionId(section.id)}>
                    Manage questions
                  </Button>
                )}
                {!locked && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="More actions"
                      className="rounded p-1.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle"
                    >
                      <MoreHorizontal size={16} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => handleDuplicateSection(section.id)}>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem className="text-status-danger" onSelect={() => setSectionPendingDelete(section)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {section.selectionMode === 'pool' ? (
              <p className="text-sm text-recruiter-text-secondary">
                Pool of {section.poolSize ?? 0} question{section.poolSize === 1 ? '' : 's'}
                {section.poolDifficulty ? ` (${section.poolDifficulty})` : ''}
              </p>
            ) : section.questions.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No questions added yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 border-t border-recruiter-border pt-2 text-sm text-recruiter-text-secondary">
                {section.questions.map((q) => (
                  <li key={q.questionId} className="flex items-center justify-between gap-2">
                    <span>{q.question?.text ?? q.questionId}</span>
                    {q.question && <span className="text-xs text-recruiter-text-tertiary">{q.question.marks} marks</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      {!locked && (
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <Input label="New section title" value={newTitle} onChange={setNewTitle} required />
          <Button type="submit">Add section</Button>
        </form>
      )}
      {pickerSectionId && (
        <SectionQuestionPicker
          examId={examId}
          sectionId={pickerSectionId}
          open
          onClose={() => setPickerSectionId(null)}
          existingQuestionIds={exam?.sections.find((s) => s.id === pickerSectionId)?.questions.map((q) => q.questionId) ?? []}
        />
      )}
      {sectionPendingDelete && (
        <Modal open title="Delete section" onClose={() => setSectionPendingDelete(null)}>
          <p className="mb-4 text-sm text-recruiter-text-secondary">
            Delete &ldquo;{sectionPendingDelete.title}&rdquo; and remove its questions from this exam?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSectionPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteSection.isPending} onClick={handleConfirmDeleteSection}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
