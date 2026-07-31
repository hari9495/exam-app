'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
import { useExam } from '../lib/hooks/useExams';
import {
  useCreateSection,
  useDeleteSection,
  useDuplicateSection,
  useReplaceSectionQuestions,
} from '../lib/hooks/useExamSections';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import {
  Button,
  Input,
  Card,
  Modal,
  Select,
  StatusBadge,
  Table,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  type Column,
} from '../components/ui';
import { TYPE_TONE, TYPE_LABEL, DIFFICULTY_LABEL, DIFFICULTY_LEVEL } from '../lib/question-display';
import { ExamSection, QuestionType, Difficulty } from '../lib/types';

type SectionQuestion = ExamSection['questions'][number];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...(Object.keys(TYPE_LABEL) as QuestionType[]).map((value) => ({ value, label: TYPE_LABEL[value] })),
];

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: 'All difficulties' },
  ...(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((value) => ({ value, label: DIFFICULTY_LABEL[value] })),
];

// One section's question list, rendered as the shared Salesforce-style table.
// Owns its own replace hook so the remove action is section-scoped -- hooks can't
// be called inside the parent's section.map().
function SectionQuestionList({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const replaceQuestions = useReplaceSectionQuestions(examId, section.id);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return section.questions.filter((q) => {
      if (query && !(q.question?.text ?? q.questionId).toLowerCase().includes(query)) return false;
      if (typeFilter !== 'all' && q.question?.type !== typeFilter) return false;
      if (difficultyFilter !== 'all' && q.question?.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [section.questions, search, typeFilter, difficultyFilter]);

  function handleRemove(questionId: string) {
    const remaining = section.questions.map((q) => q.questionId).filter((id) => id !== questionId);
    replaceQuestions.mutate(remaining, {
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to remove question.', 'error'),
    });
  }

  const columns: Column<SectionQuestion>[] = [
    {
      key: 'text',
      header: 'Question',
      render: (q) => (
        <span className="block max-w-xl truncate font-medium text-recruiter-text" title={q.question?.text}>
          {q.question?.text ?? q.questionId}
        </span>
      ),
      sortValue: (q) => (q.question?.text ?? '').toLowerCase(),
    },
    {
      key: 'type',
      header: 'Type',
      render: (q) =>
        q.question ? <StatusBadge tone={TYPE_TONE[q.question.type] ?? 'neutral'}>{TYPE_LABEL[q.question.type] ?? q.question.type}</StatusBadge> : '—',
      sortValue: (q) => (q.question ? TYPE_LABEL[q.question.type] ?? '' : ''),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      render: (q) => (q.question ? DIFFICULTY_LABEL[q.question.difficulty] ?? q.question.difficulty : '—'),
      sortValue: (q) => (q.question ? DIFFICULTY_LEVEL[q.question.difficulty] ?? 0 : 0),
    },
    {
      key: 'marks',
      header: 'Marks',
      render: (q) => q.question?.marks ?? '—',
      sortValue: (q) => q.question?.marks ?? 0,
    },
  ];

  if (!locked) {
    columns.push({
      key: 'actions',
      header: '',
      render: (q) => (
        <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => handleRemove(q.questionId)}
            disabled={replaceQuestions.isPending}
            className="text-xs font-medium text-status-danger hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this section's questions…"
            aria-label="Search this section's questions"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <Select label="Type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
        <Select label="Difficulty" value={difficultyFilter} onChange={setDifficultyFilter} options={DIFFICULTY_OPTIONS} />
      </div>
      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-recruiter-text-tertiary">No questions match your search.</p>
      ) : (
        <Table columns={columns} rows={visible} rowKey={(q) => q.questionId} />
      )}
    </div>
  );
}

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const createSection = useCreateSection(examId);
  const deleteSection = useDeleteSection(examId);
  const duplicateSection = useDuplicateSection(examId);
  const [newTitle, setNewTitle] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [sectionPendingDelete, setSectionPendingDelete] = useState<ExamSection | null>(null);
  const { toast } = useToast();
  const locked = exam?.hasStartedAttempts ?? false;

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
          Sections and questions are locked because a candidate has already started this exam.
        </p>
      )}
      {!locked && (
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <Input label="New Section Title" value={newTitle} onChange={setNewTitle} required />
          <Button type="submit">Add section</Button>
        </form>
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
                      aria-label="More Actions"
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
              <SectionQuestionList examId={examId} section={section} locked={locked} />
            )}
          </Card>
        ))}
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
