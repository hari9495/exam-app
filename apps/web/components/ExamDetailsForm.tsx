'use client';

import { useState } from 'react';
import { Button, Input, Select } from '../components/ui';
import { Exam, FeedbackVisibility } from '../lib/types';

export interface ExamDetailsValue {
  title: string;
  instructions?: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  feedbackVisibility: FeedbackVisibility;
  schedulingEnabled: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
  walkInEnabled: boolean;
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
  const [feedbackVisibility, setFeedbackVisibility] = useState<FeedbackVisibility>(initialExam?.feedbackVisibility ?? 'pass_fail');
  const [schedulingEnabled, setSchedulingEnabled] = useState(initialExam?.schedulingEnabled ?? false);
  const [availabilityWindowStart, setAvailabilityWindowStart] = useState(
    initialExam?.availabilityWindowStart ? toDatetimeLocalValue(initialExam.availabilityWindowStart) : '',
  );
  const [availabilityWindowEnd, setAvailabilityWindowEnd] = useState(
    initialExam?.availabilityWindowEnd ? toDatetimeLocalValue(initialExam.availabilityWindowEnd) : '',
  );
  const [schedulingError, setSchedulingError] = useState<string | undefined>(undefined);
  const [walkInEnabled, setWalkInEnabled] = useState(initialExam?.walkInEnabled ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (schedulingEnabled && (!availabilityWindowStart || !availabilityWindowEnd)) {
      setSchedulingError('Both a window open and close time are required.');
      return;
    }
    if (schedulingEnabled && new Date(availabilityWindowEnd) <= new Date(availabilityWindowStart)) {
      setSchedulingError('The window close time must be after its open time.');
      return;
    }
    setSchedulingError(undefined);
    onSubmit({
      title,
      instructions: instructions || undefined,
      durationMinutes: Number(durationMinutes),
      passCriteriaPercent: Number(passCriteriaPercent),
      randomizeOrder,
      feedbackVisibility,
      schedulingEnabled,
      availabilityWindowStart: schedulingEnabled ? new Date(availabilityWindowStart).toISOString() : undefined,
      availabilityWindowEnd: schedulingEnabled ? new Date(availabilityWindowEnd).toISOString() : undefined,
      walkInEnabled,
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
      <Select
        label="Candidate feedback"
        value={feedbackVisibility}
        onChange={(value) => setFeedbackVisibility(value as FeedbackVisibility)}
        options={[
          { value: 'none', label: 'None — candidates just see "submitted"' },
          { value: 'pass_fail', label: 'Pass/fail only' },
          { value: 'score', label: 'Score percentage' },
          { value: 'breakdown', label: 'Per-section breakdown' },
        ]}
      />
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
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={walkInEnabled} onChange={(e) => setWalkInEnabled(e.target.checked)} />
        Enable walk-in registration for this exam
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
