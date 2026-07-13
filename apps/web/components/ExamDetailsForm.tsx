'use client';

import { useState } from 'react';
import { Button, Input } from '../components/ui';
import { Exam } from '../lib/types';

export interface ExamDetailsValue {
  title: string;
  instructions?: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
}

export function ExamDetailsForm({ initialExam, onSubmit, submitLabel }: ExamDetailsFormProps) {
  const [title, setTitle] = useState(initialExam?.title ?? '');
  const [instructions, setInstructions] = useState(initialExam?.instructions ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initialExam?.durationMinutes ?? 60));
  const [passCriteriaPercent, setPassCriteriaPercent] = useState(String(initialExam?.passCriteriaPercent ?? 40));
  const [randomizeOrder, setRandomizeOrder] = useState(initialExam?.randomizeOrder ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      title,
      instructions: instructions || undefined,
      durationMinutes: Number(durationMinutes),
      passCriteriaPercent: Number(passCriteriaPercent),
      randomizeOrder,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Input label="Title" value={title} onChange={setTitle} required />
      <div className="flex flex-col gap-1">
        <label htmlFor="exam-instructions" className="text-sm font-medium text-gray-700">
          Instructions
        </label>
        <textarea
          id="exam-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
        />
      </div>
      <Input label="Duration (minutes)" type="number" min={1} value={durationMinutes} onChange={setDurationMinutes} />
      <Input label="Pass criteria (%)" type="number" min={0} max={100} value={passCriteriaPercent} onChange={setPassCriteriaPercent} />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={randomizeOrder} onChange={(e) => setRandomizeOrder(e.target.checked)} />
        Randomize question order for candidates
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
