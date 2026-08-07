'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, MoreHorizontal, Search } from 'lucide-react';
import { useExam } from '../lib/hooks/useExams';
import {
  useCreateSection,
  useDeleteSection,
  useDuplicateSection,
  useReplaceSectionQuestions,
  useUpdateSection,
  usePoolPreview,
  useSectionTitles,
} from '../lib/hooks/useExamSections';
import { SectionQuestionPicker } from './SectionQuestionPicker';
import {
  Button,
  Input,
  Card,
  Modal,
  StatusBadge,
  Table,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  FilterableHeader,
  type Column,
} from '../components/ui';
import { TYPE_TONE, TYPE_LABEL, DIFFICULTY_LABEL, DIFFICULTY_LEVEL } from '../lib/question-display';
import { ExamSection, QuestionType, Difficulty, PoolPreview } from '../lib/types';

const POOL_PREVIEW_COLUMNS: Column<PoolPreview['questions'][number]>[] = [
  { key: 'index', header: '#', render: (_question, index) => index + 1 },
  {
    key: 'text',
    header: 'Question',
    render: (question) => (
      <span className="block max-w-md truncate" title={question.text}>
        {question.text}
      </span>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    render: (question) => <StatusBadge tone={TYPE_TONE[question.type] ?? 'neutral'}>{TYPE_LABEL[question.type] ?? question.type}</StatusBadge>,
  },
  {
    key: 'difficulty',
    header: 'Difficulty',
    render: (question) => DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty,
  },
  { key: 'marks', header: 'Marks', render: (question) => question.marks },
];

// A pool never stores which questions it drew (see the backend comment on
// previewSectionPool) -- this shows what it WOULD currently draw from, and -- the reason this
// exists at all -- whether there are even enough matching questions to fill poolSize. Fetches
// lazily (only while open), since a page can list several pool sections and nobody needs all
// of their previews loaded just from opening the tab.
function PoolPreviewModal({ examId, sectionId, sectionTitle, onClose }: { examId: string; sectionId: string; sectionTitle: string; onClose: () => void }) {
  const { data, isLoading, isError } = usePoolPreview(examId, sectionId, true);
  const shortfall = data ? data.totalMatching < data.poolSize : false;

  return (
    <Modal open title={`Preview Pool — ${sectionTitle}`} onClose={onClose}>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-status-danger">Failed to load the pool preview.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-recruiter-text-secondary">
            <span>Criteria:</span>
            {data.poolDifficulty && <StatusBadge tone="neutral">{DIFFICULTY_LABEL[data.poolDifficulty] ?? data.poolDifficulty}</StatusBadge>}
            {data.poolTags.map((tag) => (
              <StatusBadge key={tag.id} tone="info">
                {tag.name}
              </StatusBadge>
            ))}
            {!data.poolDifficulty && data.poolTags.length === 0 && <span className="text-recruiter-text-tertiary">none</span>}
          </div>
          <p className={`text-sm font-medium ${shortfall ? 'text-status-danger' : 'text-recruiter-text'}`}>
            {data.totalMatching} question{data.totalMatching === 1 ? '' : 's'} currently match{data.totalMatching === 1 ? 'es' : ''} this pool
            {shortfall
              ? ` — fewer than the configured pool size of ${data.poolSize}. Candidates will get a shorter section than intended.`
              : ` (configured pool size: ${data.poolSize}).`}
          </p>
          {data.questions.length === 0 ? (
            <p className="text-sm text-recruiter-text-tertiary">No active questions currently match this pool&apos;s criteria.</p>
          ) : (
            <>
              <div className="max-h-96 overflow-y-auto">
                <Table columns={POOL_PREVIEW_COLUMNS} rows={data.questions} rowKey={(question) => question.id} />
              </div>
              {data.totalMatching > data.questions.length && (
                <p className="text-xs text-recruiter-text-tertiary">
                  Showing the first {data.questions.length} of {data.totalMatching} matching questions.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

type SectionQuestion = ExamSection['questions'][number];
type NumberedSectionQuestion = SectionQuestion & { number: number };

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

  // Number by the section's fixed order (API returns questions sorted by
  // orderIndex) before filtering, so a question's number reflects its actual
  // position in the section regardless of search/type/difficulty filtering.
  const numbered: NumberedSectionQuestion[] = useMemo(
    () => section.questions.map((q, index) => ({ ...q, number: index + 1 })),
    [section.questions],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return numbered.filter((q) => {
      if (query && !(q.question?.text ?? q.questionId).toLowerCase().includes(query)) return false;
      if (typeFilter !== 'all' && q.question?.type !== typeFilter) return false;
      if (difficultyFilter !== 'all' && q.question?.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [numbered, search, typeFilter, difficultyFilter]);

  function handleRemove(questionId: string) {
    const remaining = section.questions.map((q) => q.questionId).filter((id) => id !== questionId);
    replaceQuestions.mutate(remaining, {
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to remove question.', 'error'),
    });
  }

  const columns: Column<NumberedSectionQuestion>[] = [
    {
      key: 'number',
      header: '#',
      render: (q) => <span className="text-recruiter-text-tertiary">{q.number}</span>,
      sortValue: (q) => q.number,
    },
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
      header: <FilterableHeader label="Type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />,
      render: (q) =>
        q.question ? <StatusBadge tone={TYPE_TONE[q.question.type] ?? 'neutral'}>{TYPE_LABEL[q.question.type] ?? q.question.type}</StatusBadge> : '—',
    },
    {
      key: 'difficulty',
      header: <FilterableHeader label="Difficulty" value={difficultyFilter} onChange={setDifficultyFilter} options={DIFFICULTY_OPTIONS} />,
      render: (q) => (q.question ? DIFFICULTY_LABEL[q.question.difficulty] ?? q.question.difficulty : '—'),
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
      </div>
      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-recruiter-text-tertiary">No questions match your search.</p>
      ) : (
        <Table columns={columns} rows={visible} rowKey={(q) => q.questionId} />
      )}
    </div>
  );
}

function SectionWeightInput({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const updateSection = useUpdateSection(examId, section.id);
  const { toast } = useToast();
  const [value, setValue] = useState(String(section.weightPercent));

  if (locked) {
    return <span className="text-sm text-recruiter-text-secondary">{section.weightPercent}% weight</span>;
  }

  // Saved on blur rather than per-keystroke: typing "70" passes through "7", and a PATCH per
  // character would both spam the API and briefly persist a weight the recruiter never meant.
  function handleBlur() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100 || parsed === section.weightPercent) {
      setValue(String(section.weightPercent));
      return;
    }
    updateSection.mutate(
      { weightPercent: parsed },
      {
        onError: (error) => {
          toast(error instanceof Error ? error.message : 'Failed to update weight.', 'error');
          setValue(String(section.weightPercent));
        },
      },
    );
  }

  return (
    <label className="flex items-center gap-1 text-sm text-recruiter-text-secondary">
      Weight
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        aria-label={`Weight % for ${section.title}`}
        className="w-16 rounded border border-recruiter-border px-1.5 py-0.5 text-right"
      />
      %
    </label>
  );
}

function SectionRequiredCountInput({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const updateSection = useUpdateSection(examId, section.id);
  const { toast } = useToast();
  const total = section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length;
  const [value, setValue] = useState(section.requiredCount == null ? '' : String(section.requiredCount));

  if (locked) {
    return section.requiredCount == null ? null : (
      <span className="text-sm text-recruiter-text-secondary">answer any {section.requiredCount} of {total}</span>
    );
  }

  // Blank clears the requirement back to "answer all", which is what null means server-side.
  function handleBlur() {
    const trimmed = value.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > total)) {
      setValue(section.requiredCount == null ? '' : String(section.requiredCount));
      return;
    }
    if (parsed === section.requiredCount) return;
    updateSection.mutate(
      { requiredCount: parsed },
      {
        onError: (error) => {
          toast(error instanceof Error ? error.message : 'Failed to update required answers.', 'error');
          setValue(section.requiredCount == null ? '' : String(section.requiredCount));
        },
      },
    );
  }

  return (
    <label className="flex items-center gap-1 text-sm text-recruiter-text-secondary">
      Required
      <input
        type="number"
        min={1}
        max={total}
        value={value}
        placeholder="all"
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        aria-label={`Required answers for ${section.title}`}
        className="w-16 rounded border border-recruiter-border px-1.5 py-0.5 text-right"
      />
      of {total}
    </label>
  );
}

export function ExamSectionsPanel({ examId }: { examId: string }) {
  const { data: exam } = useExam(examId);
  const { data: sectionTitlesData } = useSectionTitles();
  const sectionTitles = Array.isArray(sectionTitlesData) ? sectionTitlesData : [];
  const createSection = useCreateSection(examId);
  const deleteSection = useDeleteSection(examId);
  const duplicateSection = useDuplicateSection(examId);
  const [newTitle, setNewTitle] = useState('');
  const [pickerSectionId, setPickerSectionId] = useState<string | null>(null);
  const [poolPreviewSectionId, setPoolPreviewSectionId] = useState<string | null>(null);
  const [sectionPendingDelete, setSectionPendingDelete] = useState<ExamSection | null>(null);
  // Accordion: only one section's body is open at a time. Adding a section collapses the
  // rest and opens the one just created, so it's immediately visible without scrolling.
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const { toast } = useToast();
  // Same two lock reasons as the Details tab: a started candidate is permanent, while
  // being published with nobody started yet is reversible via Unpublish.
  const locked = (exam?.hasStartedAttempts || exam?.status === 'published') ?? false;
  const lockedMessage = exam?.hasStartedAttempts
    ? 'Sections and questions are locked because a candidate has already started this exam.'
    : 'This exam is published, so its sections and questions are locked. Click Unpublish above to make changes.';
  // Weight is the one deliberate exception to the started-attempts lock (see
  // ExamsService.updateSection's isWeightOnlySectionUpdate): a recruiter can still rebalance
  // which section counts more toward pass/fail after candidates have submitted, which
  // re-scores their already-settled results. Publishing still locks it, same as everything
  // else -- unpublish first, exactly like the general lock above.
  const weightLocked = exam?.status === 'published';
  const showRescoreNotice = !weightLocked && (exam?.hasStartedAttempts ?? false);
  const sections = (exam?.sections ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  // Surfaced here so the recruiter sees the shortfall while editing, rather than only hitting
  // publish()'s rejection later.
  const weightTotal = sections.reduce((sum, section) => sum + section.weightPercent, 0);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createSection.mutate(
      { title: newTitle },
      {
        onSuccess: (created: ExamSection) => {
          setNewTitle('');
          setExpandedSectionId(created.id);
        },
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
      {locked && <p className="text-sm text-recruiter-text-secondary">{lockedMessage}</p>}
      {showRescoreNotice && (
        <p className="text-sm font-medium text-status-warning">
          Candidates have already started this exam, but section weight can still be changed to adjust the pass/fail
          criteria -- saving a new weight re-scores every candidate who has already submitted.
        </p>
      )}
      {!locked && (
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          {/* list + <datalist>: a native combobox -- pick an existing title from the
              dropdown, or just keep typing to enter a new one manually. */}
          <Input label="New Section Title" value={newTitle} onChange={setNewTitle} required list="section-titles" />
          <datalist id="section-titles">
            {sectionTitles.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
          <Button type="submit">Add section</Button>
        </form>
      )}
      {!weightLocked && sections.length > 0 && (
        <p className={`text-sm font-medium ${weightTotal === 100 ? 'text-status-success' : 'text-status-warning'}`}>
          {weightTotal === 100
            ? `Weights total: ${weightTotal}%`
            : `Weights total: ${weightTotal}% — add ${100 - weightTotal}% more before publishing`}
        </p>
      )}
      {sections
        .map((section) => {
          const isOpen = expandedSectionId === section.id;
          return (
          <Card key={section.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedSectionId(isOpen ? null : section.id)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${section.title}` : `Expand ${section.title}`}
                  className="rounded p-0.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle"
                >
                  <ChevronDown size={16} className={isOpen ? '' : '-rotate-90'} />
                </button>
                <p className="font-medium">{section.title}</p>
                <SectionWeightInput examId={examId} section={section} locked={weightLocked} />
                <SectionRequiredCountInput examId={examId} section={section} locked={locked} />
              </div>
              <div className="flex items-center gap-1.5">
                {!locked && section.selectionMode !== 'pool' && (
                  <Button variant="secondary" onClick={() => setPickerSectionId(section.id)}>
                    Manage questions
                  </Button>
                )}
                {section.selectionMode === 'pool' && (
                  // Available even while locked -- it's read-only, so a candidate having
                  // started doesn't need to block checking what the pool would draw from.
                  <Button variant="secondary" onClick={() => setPoolPreviewSectionId(section.id)}>
                    Preview pool
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
            {isOpen &&
              (section.selectionMode === 'pool' ? (
                <p className="text-sm text-recruiter-text-secondary">
                  Pool of {section.poolSize ?? 0} question{section.poolSize === 1 ? '' : 's'}
                  {section.poolDifficulty ? ` (${section.poolDifficulty})` : ''}
                </p>
              ) : section.questions.length === 0 ? (
                <p className="text-sm text-recruiter-text-tertiary">No questions added yet.</p>
              ) : (
                <SectionQuestionList examId={examId} section={section} locked={locked} />
              ))}
          </Card>
          );
        })}
      {pickerSectionId && (
        <SectionQuestionPicker
          examId={examId}
          sectionId={pickerSectionId}
          open
          onClose={() => setPickerSectionId(null)}
          existingQuestionIds={exam?.sections.find((s) => s.id === pickerSectionId)?.questions.map((q) => q.questionId) ?? []}
        />
      )}
      {poolPreviewSectionId && (
        <PoolPreviewModal
          examId={examId}
          sectionId={poolPreviewSectionId}
          sectionTitle={exam?.sections.find((s) => s.id === poolPreviewSectionId)?.title ?? ''}
          onClose={() => setPoolPreviewSectionId(null)}
        />
      )}
      {sectionPendingDelete && (
        <Modal open title="Delete Section" onClose={() => setSectionPendingDelete(null)}>
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
