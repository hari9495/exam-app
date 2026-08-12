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
  const running = aiJobId !== null && job.data?.status !== 'completed' && job.data?.status !== 'failed';

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
    <Modal open={open} title="Generate questions with AI" onClose={handleClose}>
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

        {output && (
          <div className="space-y-2 text-sm">
            <p>
              {output.requested} requested · {output.created} created · {output.dropped.length} dropped
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

        {job.data?.status === 'failed' && (
          <p role="alert" className="text-sm text-status-danger">
            {job.data.error ?? 'Generation failed.'}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" loading={generate.isPending || running}>
            Generate
          </Button>
        </div>
      </form>
    </Modal>
  );
}
