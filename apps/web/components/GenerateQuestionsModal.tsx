'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Select, Checkbox, RequiredFieldsNote } from './ui';
import {
  useGenerateQuestions,
  useAiJob,
  useTags,
  type GenerationOutput,
  type GeneratableQuestionType,
} from '../lib/hooks/useQuestions';
import type { Difficulty } from '../lib/types';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const QUESTION_TYPE_OPTIONS: { value: GeneratableQuestionType; label: string }[] = [
  { value: 'single_mcq', label: 'Single choice' },
  { value: 'multi_mcq', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / False' },
];

/**
 * Must be rendered unconditionally (`<GenerateQuestionsModal open={open} .../>`, never
 * `{open && <GenerateQuestionsModal .../>}`), with `open` toggled to show/hide it. The
 * generation job is a paid, 15-90s background job that keeps polling after the dialog is
 * closed so the page can switch to Drafts when it lands (see the `aiJobId` comment below).
 * Mounting the component only while `open` is true unmounts it on close, which drops
 * `aiJobId` and the React Query observer -- the poll dies and `onCompleted` never fires.
 */
interface GenerateQuestionsModalProps {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export function GenerateQuestionsModal({ open, onClose, onCompleted }: GenerateQuestionsModalProps) {
  const generate = useGenerateQuestions();
  const { data: tags } = useTags();

  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionTypes, setQuestionTypes] = useState<GeneratableQuestionType[]>(['single_mcq']);
  const [count, setCount] = useState('5');
  const [marks, setMarks] = useState('1');
  const [negativeMarks, setNegativeMarks] = useState('0');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Not cleared on close: this is a background job that costs money per run. Closing the
  // modal must not cancel the poll -- the component stays mounted (Modal just hides the
  // dialog), so the job keeps polling and onCompleted still fires when it lands, even if
  // the recruiter isn't looking. Reopening while a job is in flight shows its real progress
  // instead of a blank, enabled form that invites paying for a second run.
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const job = useAiJob(aiJobId);

  // onCompleted switches the page to the Drafts view. Firing it on every poll after completion
  // would yank the filter back while the recruiter is working, so latch it -- keyed on the job
  // id (not a plain boolean) so a second generation is guaranteed to notify again even if a
  // future change makes useAiJob preserve `data` across query-key changes (placeholderData),
  // the way useTags/useQuestions already do.
  const notifiedFor = useRef<string | null>(null);
  useEffect(() => {
    if (job.data?.status === 'completed' && notifiedFor.current !== aiJobId) {
      notifiedFor.current = aiJobId;
      onCompleted();
    }
  }, [job.data?.status, aiJobId, onCompleted]);

  // aiJobId !== null (not job.data) covers the gap between submit resolving and the first
  // poll resolving: `job.data` is still undefined then, but a job is already in flight and a
  // second click must not start (and pay for) another one.
  //
  // If useAiJob ever gains `placeholderData` (as useQuestions/useTags already have, to avoid
  // a loading flash on refetch), that changes this calculation, not just notifiedFor above:
  // `job.data` would keep showing the *previous* job's status for a moment after aiJobId
  // switches to a new id, so `running` would read that old `completed` and briefly report
  // false right after a new submit -- reopening the double-click window this line exists to
  // close. notifiedFor survives that because it's keyed on aiJobId; running is not.
  //
  // job.isError means the poll itself failed (token expiry mid-job, API restart, a 500) --
  // not that the job failed. Without excluding it here, `running` never becomes false, so a
  // failed poll leaves the form disabled and "Generating..." showing forever, with the only
  // recovery being a page reload (aiJobId is deliberately never cleared -- see above).
  const running = aiJobId !== null && !job.isError && job.data?.status !== 'completed' && job.data?.status !== 'failed';

  function toggleQuestionType(type: GeneratableQuestionType, checked: boolean) {
    setQuestionTypes((current) => (checked ? [...current, type] : current.filter((t) => t !== type)));
  }

  function toggleTag(id: string, checked: boolean) {
    setSelectedTagIds((current) => (checked ? [...current, id] : current.filter((t) => t !== id)));
  }

  function handleClose() {
    setFormError(null);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      setFormError('Enter a topic.');
      return;
    }
    if (questionTypes.length === 0) {
      setFormError('Select at least one question type.');
      return;
    }
    setFormError(null);
    try {
      const result = await generate.mutateAsync({
        topic: topic.trim(),
        difficulty,
        questionTypes,
        count: Number(count),
        marks: Number(marks),
        negativeMarks: Number(negativeMarks),
        tagIds: selectedTagIds,
      });
      setAiJobId(result.aiJobId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to start generation.');
    }
  }

  // outputJson is stored text written by the worker. Parse defensively: a malformed value must
  // not blank the modal, leaving the recruiter with no idea whether anything was generated.
  // A valid-JSON-wrong-shape value (e.g. '{}') parses without throwing, so the shape is
  // checked too -- not just that JSON.parse succeeded -- or `output.dropped.length` below
  // throws during render with no error boundary above it, and the recruiter gets a blank page.
  let output: GenerationOutput | null = null;
  if (job.data?.status === 'completed' && job.data.outputJson) {
    try {
      const parsed = JSON.parse(job.data.outputJson);
      output = Array.isArray(parsed?.dropped) && typeof parsed?.requested === 'number' ? parsed : null;
    } catch {
      output = null;
    }
  }

  return (
    <Modal
      open={open}
      title="Generate questions with AI"
      onClose={handleClose}
      closeAriaLabel="Close dialog"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <RequiredFieldsNote />
        <fieldset disabled={generate.isPending || running} className="contents">
          <Input label="Topic" value={topic} onChange={setTopic} required />
          <Select label="Difficulty" value={difficulty} onChange={(v) => setDifficulty(v as Difficulty)} options={DIFFICULTY_OPTIONS} required />

          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-gray-700">Question types</legend>
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <Checkbox
                key={option.value}
                label={option.label}
                checked={questionTypes.includes(option.value)}
                onChange={(checked) => toggleQuestionType(option.value, checked)}
              />
            ))}
          </fieldset>

          <Input label="Count" type="number" min={1} max={20} value={count} onChange={setCount} required />
          <Input label="Marks" type="number" min={1} value={marks} onChange={setMarks} required />
          <Input label="Negative marks" type="number" min={0} value={negativeMarks} onChange={setNegativeMarks} required />

          {tags && tags.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium text-gray-700">Tags</legend>
              {tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  label={tag.name}
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={(checked) => toggleTag(tag.id, checked)}
                />
              ))}
            </fieldset>
          )}
        </fieldset>

        {formError && (
          <p role="alert" className="text-sm text-status-danger">
            {formError}
          </p>
        )}

        {running && (
          <p className="text-sm text-recruiter-text-secondary">
            Generating… This is safe to close — the questions will appear in Drafts when it finishes.
          </p>
        )}

        {/* Hidden (not cleared) when a later submit fails: `output` is still derived from the
            old completed job, and rendering it under a fresh formError would read as though
            those numbers belong to the failed attempt. */}
        {output && !formError && (
          <div className="space-y-2 text-sm">
            <p>
              Last run: {output.requested} requested · {output.created} created · {output.dropped.length} dropped
            </p>
            {output.dropped.length > 0 && (
              <ul className="list-disc pl-5 text-recruiter-text-secondary">
                {[...new Set(output.dropped.map((d) => d.reason))].map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(job.data?.status === 'failed' || job.isError) && (
          <p role="alert" className="text-sm text-status-danger">
            {job.isError ? "Couldn't check on the generation job. Try again." : (job.data?.error ?? 'Generation failed.')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            {running ? 'Close' : 'Cancel'}
          </Button>
          <Button type="submit" loading={generate.isPending || running}>
            Generate
          </Button>
        </div>
      </form>
    </Modal>
  );
}
