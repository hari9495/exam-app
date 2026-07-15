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
  schedulingEnabled: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
}

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ExamDetailsForm({ initialExam, onSubmit, submitLabel }: ExamDetailsFormProps) {
  const [title, setTitle] = useState(initialExam?.title ?? '');
  const [instructions, setInstructions] = useState(initialExam?.instructions ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initialExam?.durationMinutes ?? 60));
  const [passCriteriaPercent, setPassCriteriaPercent] = useState(String(initialExam?.passCriteriaPercent ?? 40));
  const [randomizeOrder, setRandomizeOrder] = useState(initialExam?.randomizeOrder ?? false);
  const [schedulingEnabled, setSchedulingEnabled] = useState(initialExam?.schedulingEnabled ?? false);
  const [availabilityWindowStart, setAvailabilityWindowStart] = useState(
    initialExam?.availabilityWindowStart ? toDatetimeLocalValue(initialExam.availabilityWindowStart) : '',
  );
  const [availabilityWindowEnd, setAvailabilityWindowEnd] = useState(
    initialExam?.availabilityWindowEnd ? toDatetimeLocalValue(initialExam.availabilityWindowEnd) : '',
  );
  const [schedulingError, setSchedulingError] = useState<string | undefined>(undefined);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (schedulingEnabled && (!availabilityWindowStart || !availabilityWindowEnd)) {
      setSchedulingError('Both a window open and close time are required.');
      return;
    }
    setSchedulingError(undefined);
    onSubmit({
      title,
      instructions: instructions || undefined,
      durationMinutes: Number(durationMinutes),
      passCriteriaPercent: Number(passCriteriaPercent),
      randomizeOrder,
      schedulingEnabled,
      availabilityWindowStart: schedulingEnabled ? new Date(availabilityWindowStart).toISOString() : undefined,
      availabilityWindowEnd: schedulingEnabled ? new Date(availabilityWindowEnd).toISOString() : undefined,
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
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={schedulingEnabled} onChange={(e) => setSchedulingEnabled(e.target.checked)} />
        Enable scheduling
      </label>
      {schedulingEnabled && (
        <div className="flex flex-col gap-2 pl-6">
          <Input
            label="Window opens"
            type="datetime-local"
            value={availabilityWindowStart}
            onChange={setAvailabilityWindowStart}
          />
          <Input
            label="Window closes"
            type="datetime-local"
            value={availabilityWindowEnd}
            onChange={setAvailabilityWindowEnd}
          />
          {schedulingError && <p className="text-xs text-red-600">{schedulingError}</p>}
        </div>
      )}
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
