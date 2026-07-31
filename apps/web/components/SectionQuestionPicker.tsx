'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useQuestions } from '../lib/hooks/useQuestions';
import { useReplaceSectionQuestions } from '../lib/hooks/useExamSections';
import { Modal, Checkbox, Button, Badge, Input, Select, useToast } from '../components/ui';
import { DIFFICULTY_LABEL } from '../lib/question-display';
import { Question, QuestionType, Difficulty } from '../lib/types';

interface SectionQuestionPickerProps {
  examId: string;
  sectionId: string;
  open: boolean;
  onClose: () => void;
  existingQuestionIds: string[];
}

const TYPE_LABELS: Record<QuestionType, string> = {
  single_mcq: 'Single choice',
  multi_mcq: 'Multiple choice',
  true_false: 'True / false',
  code: 'Coding',
};

const DIFFICULTY_VARIANT: Record<Difficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...(Object.keys(TYPE_LABELS) as QuestionType[]).map((value) => ({ value, label: TYPE_LABELS[value] })),
];

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: 'All difficulties' },
  ...(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((value) => ({ value, label: DIFFICULTY_LABEL[value] })),
];

// The searchable haystack for one question: its text plus the metadata a
// recruiter would actually type to find it (topic, category, tag names).
function matchesQuery(question: Question, query: string): boolean {
  if (!query) return true;
  const haystack = [
    question.text,
    question.topic ?? '',
    question.category ?? '',
    ...(question.tags?.map((t) => t.name) ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesFilters(question: Question, typeFilter: string, difficultyFilter: string): boolean {
  if (typeFilter !== 'all' && question.type !== typeFilter) return false;
  if (difficultyFilter !== 'all' && question.difficulty !== difficultyFilter) return false;
  return true;
}

export function SectionQuestionPicker({ examId, sectionId, open, onClose, existingQuestionIds }: SectionQuestionPickerProps) {
  // ponytail: pageSize:100 is the server's max -- an org with >100 active
  // questions silently can't attach #101+ here. Upgrade path: replace with a
  // real paginated/typeahead picker if this becomes a real constraint.
  const { data: questionsResponse } = useQuestions({ pageSize: 100 });
  const allQuestions = questionsResponse?.data;
  const replaceQuestions = useReplaceSectionQuestions(examId, sectionId);
  // Holds only the NEW picks. Questions already in the section are hidden below,
  // and merged back in at save time, so this list never carries them.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const { toast } = useToast();

  // Reset picks, search, and filters only when the picker opens or targets a
  // different section -- not on every parent re-render (a background exam
  // refetch gives existingQuestionIds a fresh identity each time and would
  // otherwise wipe an in-progress selection mid-scroll).
  useEffect(() => {
    if (open) {
      setSelectedIds([]);
      setQuery('');
      setTypeFilter('all');
      setDifficultyFilter('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sectionId]);

  const existingSet = useMemo(() => new Set(existingQuestionIds), [existingQuestionIds]);

  // Add-only: a question already in the section is not offered again.
  const addable = useMemo(
    () => (allQuestions ?? []).filter((q) => !existingSet.has(q.id)),
    [allQuestions, existingSet],
  );
  const visible = useMemo(
    () => addable.filter((q) => matchesQuery(q, query) && matchesFilters(q, typeFilter, difficultyFilter)),
    [addable, query, typeFilter, difficultyFilter],
  );
  const filtersActive = query.trim() !== '' || typeFilter !== 'all' || difficultyFilter !== 'all';

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleSave() {
    if ((allQuestions ?? []).length === 0) {
      toast('Your question bank is empty. Add questions to it before adding them to a section.', 'error');
      return;
    }
    // Merge with what's already in the section so this add-only picker never
    // drops existing questions. Removal happens from the section list itself.
    const merged = Array.from(new Set([...existingQuestionIds, ...selectedIds]));
    replaceQuestions.mutate(merged, {
      onSuccess: onClose,
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to save questions.', 'error'),
    });
  }

  const bankEmpty = (allQuestions ?? []).length === 0;
  const allAlreadyAdded = !bankEmpty && addable.length === 0;

  return (
    <Modal
      open={open}
      title="Add questions to section"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {/* Label stays "Save questions" (the picker's stable action name); the
              live count rides alongside so it doesn't change what the button is. */}
          <Button onClick={handleSave} loading={replaceQuestions.isPending} disabled={selectedIds.length === 0 && !bankEmpty}>
            Save questions{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
          </Button>
        </>
      }
    >
      {bankEmpty ? (
        <p className="text-sm text-recruiter-text-secondary">No questions yet. Add questions to your question bank first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1">
              <Input
                label="Search questions"
                hideLabel
                type="search"
                placeholder="Search by text, topic, category, or tag…"
                value={query}
                onChange={setQuery}
                icon={<Search size={16} />}
              />
            </div>
            <Select label="Type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
            <Select label="Difficulty" value={difficultyFilter} onChange={setDifficultyFilter} options={DIFFICULTY_OPTIONS} />
          </div>

          {allAlreadyAdded ? (
            <p className="py-6 text-center text-sm text-recruiter-text-secondary">
              Every question in your bank is already in this section.
            </p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-recruiter-text-secondary">
              {filtersActive ? 'No questions match your search and filters.' : 'No questions to add.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-recruiter-border">
              {visible.map((question) => (
                <li key={question.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Checkbox
                      label={question.text}
                      checked={selectedIds.includes(question.id)}
                      onChange={(checked) => toggle(question.id, checked)}
                    />
                    <div className="ml-6 mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{TYPE_LABELS[question.type]}</Badge>
                      <Badge variant={DIFFICULTY_VARIANT[question.difficulty]}>{question.difficulty}</Badge>
                      {question.category && <Badge>{question.category}</Badge>}
                      {question.topic && <span className="text-xs text-recruiter-text-tertiary">{question.topic}</span>}
                      {(question.tags ?? []).map((tag) => (
                        <span key={tag.id} className="text-xs text-recruiter-text-tertiary">
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs font-medium text-recruiter-text-secondary">
                    {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
