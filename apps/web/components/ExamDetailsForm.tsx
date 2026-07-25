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
  allowedIpRange?: string | null;
  webcamProctoringEnabled: boolean;
  proctoringEnforcement: 'warn' | 'block';
  proctoringStrikeLimit: number;
  disabledProctoringSignals: string[];
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
  locked?: boolean;
}

// Recruiters will not recognise the raw event-type names, so every toggle carries
// plain-language copy. Keys must stay in sync with TOGGLEABLE_PROCTORING_SIGNALS
// in apps/api/src/exams/dto/create-exam.dto.ts.
const PROCTORING_SIGNAL_LABELS: { value: string; label: string }[] = [
  { value: 'tab_switch', label: 'Switching browser tabs' },
  { value: 'window_blur', label: 'Switching to another application' },
  { value: 'fullscreen_exit', label: 'Leaving fullscreen' },
  { value: 'copy_paste', label: 'Copy / paste' },
  { value: 'right_click', label: 'Right-click / context menu' },
  { value: 'dev_tools_detected', label: 'Developer tools' },
  { value: 'multi_monitor_detected', label: 'A second display' },
  { value: 'idle_timeout', label: 'Long inactivity' },
];

function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ExamDetailsForm({ initialExam, onSubmit, submitLabel, locked = false }: ExamDetailsFormProps) {
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
  const [allowedIpRange, setAllowedIpRange] = useState(initialExam?.allowedIpRange ?? '');
  const [webcamProctoringEnabled, setWebcamProctoringEnabled] = useState(initialExam?.webcamProctoringEnabled ?? true);
  const [proctoringEnforcement, setProctoringEnforcement] = useState<'warn' | 'block'>(initialExam?.proctoringEnforcement ?? 'block');
  const [proctoringStrikeLimit, setProctoringStrikeLimit] = useState(String(initialExam?.proctoringStrikeLimit ?? 3));
  const [disabledSignals, setDisabledSignals] = useState<string[]>(() => {
    if (!initialExam?.disabledProctoringSignalsJson) return [];
    try {
      const parsed = JSON.parse(initialExam.disabledProctoringSignalsJson);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  });
  const [signalsOpen, setSignalsOpen] = useState(false);

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
      allowedIpRange: allowedIpRange.trim()
        ? allowedIpRange.trim()
        : initialExam?.allowedIpRange
          ? null
          : undefined,
      webcamProctoringEnabled,
      proctoringEnforcement,
      proctoringStrikeLimit: Number(proctoringStrikeLimit),
      disabledProctoringSignals: disabledSignals,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      {locked && (
        <p className="rounded-md border border-recruiter-border bg-recruiter-bg-subtle p-3 text-sm text-recruiter-text-secondary">
          This exam is locked because a candidate has already started it. Nothing here can be changed anymore — you can still
          invite new candidates and manage live monitoring from their respective tabs.
        </p>
      )}
      <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
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
      <Input
        label="Allowed IP / CIDR range (optional)"
        value={allowedIpRange}
        onChange={setAllowedIpRange}
        placeholder="e.g. 203.0.113.4 or 203.0.113.0/24"
      />
      <fieldset className="flex flex-col gap-3 rounded-md border border-recruiter-border p-3">
        <legend className="px-1 text-sm font-semibold text-recruiter-text">Proctoring &amp; integrity</legend>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={webcamProctoringEnabled}
            onChange={(e) => setWebcamProctoringEnabled(e.target.checked)}
          />
          Require webcam proctoring
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">If a rule is broken</span>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="proctoring-enforcement"
              checked={proctoringEnforcement === 'block'}
              onChange={() => setProctoringEnforcement('block')}
            />
            Pause the exam, then block after repeated strikes
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="proctoring-enforcement"
              checked={proctoringEnforcement === 'warn'}
              onChange={() => setProctoringEnforcement('warn')}
            />
            Record only — never pause the exam
          </label>
        </div>
        {proctoringEnforcement === 'block' && (
          <Select
            label="Block after"
            value={proctoringStrikeLimit}
            onChange={setProctoringStrikeLimit}
            options={[
              { value: '2', label: '2 strikes' },
              { value: '3', label: '3 strikes' },
              { value: '5', label: '5 strikes' },
            ]}
          />
        )}
        <button
          type="button"
          onClick={() => setSignalsOpen((open) => !open)}
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          {signalsOpen ? 'Hide' : 'Choose'} which activity to watch ({PROCTORING_SIGNAL_LABELS.length - disabledSignals.length}/
          {PROCTORING_SIGNAL_LABELS.length})
        </button>
        {signalsOpen && (
          <div className="flex flex-col gap-1.5 pl-1">
            {PROCTORING_SIGNAL_LABELS.map((signal) => (
              <label key={signal.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!disabledSignals.includes(signal.value)}
                  onChange={(e) =>
                    setDisabledSignals((current) =>
                      e.target.checked ? current.filter((entry) => entry !== signal.value) : [...current, signal.value],
                    )
                  }
                />
                {signal.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {!locked && <Button type="submit">{submitLabel}</Button>}
      </fieldset>
    </form>
  );
}
