'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Select, Checkbox } from './ui';
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

  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const job = useAiJob(aiJobId);

  // onCompleted switches the page to the Drafts view. Firing it on every poll after completion
  // would yank the filter back while the recruiter is working, so latch it.
  const notified = useRef(false);
  useEffect(() => {
    if (job.data?.status === 'completed' && !notified.current) {
      notified.current = true;
      onCompleted();
    }
  }, [job.data?.status, onCompleted]);

  const running = job.data?.status === 'pending' || job.data?.status === 'processing';

  function toggleQuestionType(type: GeneratableQuestionType, checked: boolean) {
    setQuestionTypes((current) => (checked ? [...current, type] : current.filter((t) => t !== type)));
  }

  function toggleTag(id: string, checked: boolean) {
    setSelectedTagIds((current) => (checked ? [...current, id] : current.filter((t) => t !== id)));
  }

  function handleClose() {
    setAiJobId(null);
    notified.current = false;
    setFormError(null);
    onClose();
  }

  async function handleGenerate() {
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
      notified.current = false;
      setAiJobId(result.aiJobId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to start generation.');
    }
  }

  // outputJson is stored text written by the worker. Parse defensively: a malformed value must
  // not blank the modal, leaving the recruiter with no idea whether anything was generated.
  let output: GenerationOutput | null = null;
  if (job.data?.status === 'completed' && job.data.outputJson) {
    try {
      output = JSON.parse(job.data.outputJson) as GenerationOutput;
    } catch {
      output = null;
    }
  }

  return (
    <Modal open={open} title="Generate questions with AI" onClose={handleClose}>
      <div className="flex flex-col gap-3">
        <fieldset disabled={generate.isPending || running} className="contents">
          <Input label="Topic" value={topic} onChange={setTopic} required />
          <Select label="Difficulty" value={difficulty} onChange={(v) => setDifficulty(v as Difficulty)} options={DIFFICULTY_OPTIONS} required />

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Question types</span>
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <Checkbox
                key={option.value}
                label={option.label}
                checked={questionTypes.includes(option.value)}
                onChange={(checked) => toggleQuestionType(option.value, checked)}
              />
            ))}
          </div>

          <Input label="Count" type="number" min={1} max={20} value={count} onChange={setCount} required />
          <Input label="Marks" type="number" min={1} value={marks} onChange={setMarks} required />
          <Input label="Negative marks" type="number" min={0} value={negativeMarks} onChange={setNegativeMarks} required />

          {tags && tags.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Tags</span>
              {tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  label={tag.name}
                  checked={selectedTagIds.includes(tag.id)}
                  onChange={(checked) => toggleTag(tag.id, checked)}
                />
              ))}
            </div>
          )}
        </fieldset>

        {formError && (
          <p role="alert" className="text-sm text-status-danger">
            {formError}
          </p>
        )}

        {running && (
          <p className="text-sm text-fg-muted">
            Generating… This is safe to close — the questions will appear in Drafts when it finishes.
          </p>
        )}

        {output && (
          <div className="space-y-2 text-sm">
            <p>
              {output.requested} requested · {output.created} created · {output.dropped.length} dropped
            </p>
            {output.dropped.length > 0 && (
              <ul className="list-disc pl-5 text-fg-muted">
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
            Close
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={generate.isPending || running} loading={generate.isPending}>
            Generate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
