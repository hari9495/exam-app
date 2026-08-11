'use client';

import { useState } from 'react';
import { Button, Checkbox, CollapsibleSection, Input, RadioGroup, RadioGroupItem, RequiredFieldsNote, Select } from '../components/ui';
import { Exam, FeedbackVisibility } from '../lib/types';
import { WalkInShareCard } from './WalkInShareCard';
import { useAuth } from '../lib/auth-context';

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
  walkInListed: boolean;
  allowedIpRange?: string | null;
  enableAntiCheating: boolean;
  webcamProctoringEnabled: boolean;
  webcamRecordOnly: boolean;
  proctoringEnforcement: 'warn' | 'block';
  proctoringStrikeLimit: number;
  disabledProctoringSignals: string[];
  screenCaptureEnabled: boolean;
  lockdownRequired: boolean;
  faceVerificationEnabled: boolean;
  faceEnrolmentPolicy: 'allow_unenrolled' | 'retry_then_allow' | 'require_enrolment';
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
  locked?: boolean;
  /** Overrides the default "a candidate has started it" banner text -- callers use
   *  this for the other lock reason (published, no attempts yet: unpublish to edit). */
  lockedMessage?: string;
  /** The edit page renders its own always-editable walk-in toggle -- set when that's
   *  in use, so this form's own (lockable) copy doesn't duplicate it. */
  hideWalkInField?: boolean;
  /** The edit page's always-editable walk-in toggle + share card, rendered in this
   *  form's own walk-in slot inside "Scheduling & access" instead of floating outside
   *  the form -- only used together with hideWalkInField. */
  walkInSlot?: React.ReactNode;
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

export function ExamDetailsForm({
  initialExam,
  onSubmit,
  submitLabel,
  locked = false,
  lockedMessage,
  hideWalkInField = false,
  walkInSlot,
}: ExamDetailsFormProps) {
  const { organizationSlug } = useAuth();
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
  const [walkInListed, setWalkInListed] = useState(initialExam?.walkInListed ?? true);
  const [allowedIpRange, setAllowedIpRange] = useState(initialExam?.allowedIpRange ?? '');
  const [enableAntiCheating, setEnableAntiCheating] = useState(initialExam?.enableAntiCheating ?? true);
  const [webcamProctoringEnabled, setWebcamProctoringEnabled] = useState(initialExam?.webcamProctoringEnabled ?? true);
  const [webcamRecordOnly, setWebcamRecordOnly] = useState(initialExam?.webcamRecordOnly ?? false);
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
  const [screenCaptureEnabled, setScreenCaptureEnabled] = useState(initialExam?.screenCaptureEnabled ?? false);
  const [lockdownRequired, setLockdownRequired] = useState(initialExam?.lockdownRequired ?? false);
  const [faceVerificationEnabled, setFaceVerificationEnabled] = useState(initialExam?.faceVerificationEnabled ?? false);
  const [faceEnrolmentPolicy, setFaceEnrolmentPolicy] = useState<ExamDetailsValue['faceEnrolmentPolicy']>(
    (initialExam?.faceEnrolmentPolicy as ExamDetailsValue['faceEnrolmentPolicy']) ?? 'retry_then_allow',
  );

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
      walkInListed,
      allowedIpRange: allowedIpRange.trim()
        ? allowedIpRange.trim()
        : initialExam?.allowedIpRange
          ? null
          : undefined,
      enableAntiCheating,
      webcamProctoringEnabled,
      webcamRecordOnly,
      proctoringEnforcement,
      proctoringStrikeLimit: Number(proctoringStrikeLimit),
      disabledProctoringSignals: disabledSignals,
      screenCaptureEnabled,
      lockdownRequired,
      faceVerificationEnabled,
      faceEnrolmentPolicy,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      // This form already validates the scheduling window itself (both fields together, plus
      // end-after-start) with its own message -- native HTML5 required validation on those two
      // inputs would otherwise silently block the submit event before that custom check ever
      // runs, so it's turned off here in favor of the form's own validation.
      noValidate
      className="flex max-w-3xl min-w-0 flex-col gap-6"
    >
      {locked && (
        <p className="rounded-md border border-recruiter-border bg-recruiter-bg-subtle p-3 text-sm text-recruiter-text-secondary">
          {lockedMessage ??
            'This exam is locked because a candidate has already started it. Nothing here can be changed anymore — you can still invite new candidates and manage live monitoring from their respective tabs.'}
        </p>
      )}
      <RequiredFieldsNote />

      <CollapsibleSection title="Basic Details" locked={locked}>
        <div className="sm:col-span-2">
          <Input label="Title" value={title} onChange={setTitle} required />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="exam-instructions" className="text-sm font-medium text-gray-700">
            Instructions
          </label>
          <textarea
            id="exam-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            rows={3}
          />
        </div>
        <Input label="Duration (Minutes)" type="number" min={1} value={durationMinutes} onChange={setDurationMinutes} />
        <Input
          label="Pass Criteria (%)"
          type="number"
          min={0}
          max={100}
          value={passCriteriaPercent}
          onChange={setPassCriteriaPercent}
        />
        <div className="sm:col-span-2">
          <Checkbox label="Randomize Question Order For Candidates" checked={randomizeOrder} onChange={setRandomizeOrder} />
        </div>
        <div className="sm:col-span-2">
          <Select
            label="Candidate Feedback"
            value={feedbackVisibility}
            onChange={(value) => setFeedbackVisibility(value as FeedbackVisibility)}
            options={[
              { value: 'none', label: 'None — candidates just see "submitted"' },
              { value: 'pass_fail', label: 'Pass/fail only' },
              { value: 'score', label: 'Score percentage' },
              { value: 'breakdown', label: 'Per-section breakdown' },
            ]}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Scheduling & Access"
        locked={locked}
        // Once published, the rest of this section is disabled -- the edit page's own
        // always-editable walk-in toggle (walkInSlot) renders here instead, via
        // alwaysEditable, so it stays visually inside Scheduling & access without
        // being caught by the section's own `disabled` fieldset.
        alwaysEditable={
          hideWalkInField && walkInSlot ? <div className="flex flex-col gap-3 sm:col-span-2">{walkInSlot}</div> : undefined
        }
      >
        <div className="sm:col-span-2">
          <Checkbox label="Enable Scheduling" checked={schedulingEnabled} onChange={setSchedulingEnabled} />
        </div>
        {schedulingEnabled && (
          <>
            <Input
              label="Window Opens"
              type="datetime-local"
              value={availabilityWindowStart}
              onChange={setAvailabilityWindowStart}
              required
            />
            <Input
              label="Window Closes"
              type="datetime-local"
              value={availabilityWindowEnd}
              onChange={setAvailabilityWindowEnd}
              required
            />
            {schedulingError && <p className="text-xs text-red-600 sm:col-span-2">{schedulingError}</p>}
          </>
        )}
        {!hideWalkInField && (
          <div className="flex flex-col gap-3 sm:col-span-2">
            <Checkbox label="Enable Walk-In Registration For This Exam" checked={walkInEnabled} onChange={setWalkInEnabled} />
            {walkInEnabled && (
              <>
                {/* Only meaningful once walk-in itself is on -- controls whether this exam
                    also shows up when a candidate visits the shared /walk-in/{orgSlug} link,
                    vs. being reachable only via its own link/QR below (which always works
                    regardless of this setting). */}
                <Checkbox
                  label="Show In The Shared Walk-In Exam List"
                  checked={walkInListed}
                  onChange={setWalkInListed}
                />
                {initialExam?.id && organizationSlug && <WalkInShareCard examId={initialExam.id} orgSlug={organizationSlug} />}
              </>
            )}
          </div>
        )}
        <div className="sm:col-span-2">
          <Input
            label="Allowed IP / CIDR Range (Optional)"
            value={allowedIpRange}
            onChange={setAllowedIpRange}
            placeholder="e.g. 203.0.113.4 or 203.0.113.0/24"
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Proctoring & Integrity" locked={locked}>
        <div className="sm:col-span-2">
          <Checkbox
            label="Enable Anti-Cheating Monitoring For This Exam"
            checked={enableAntiCheating}
            onChange={setEnableAntiCheating}
          />
        </div>
        {/* Everything below is inert once the master switch above is off -- the submit
            handler still sends whatever these are currently set to, but the backend
            (ExamsService.resolveProctoringFields) forces them all off in that case
            regardless, so nothing here can end up silently active while hidden. */}
        {enableAntiCheating && (
          <div className="flex flex-col gap-4 border-l-2 border-recruiter-border pl-4 sm:col-span-2">
            <div>
              <Checkbox label="Require Webcam Proctoring" checked={webcamProctoringEnabled} onChange={setWebcamProctoringEnabled} />
              {webcamProctoringEnabled && (
                <div className="pl-6 pt-2">
                  <Checkbox
                    label="Record Only — Never Pause For Webcam Violations"
                    checked={webcamRecordOnly}
                    onChange={setWebcamRecordOnly}
                  />
                  <p className="pt-1 text-xs text-recruiter-text-secondary">
                    Webcam violations (no face, multiple faces, head turned) are still detected and recorded as
                    evidence, but never pause or block the exam. The rules below still pause/block as configured.
                  </p>
                </div>
              )}
            </div>
            {/* What counts as a rule violation has to be decided before what happens
                when one fires -- reads as "watch for X; if a rule is broken, do Y;
                after N strikes" instead of stating the consequence before the trigger. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">
                Watch for ({PROCTORING_SIGNAL_LABELS.length - disabledSignals.length}/{PROCTORING_SIGNAL_LABELS.length} selected)
              </span>
              {PROCTORING_SIGNAL_LABELS.map((signal) => (
                <Checkbox
                  key={signal.value}
                  label={signal.label}
                  checked={!disabledSignals.includes(signal.value)}
                  onChange={(checked) =>
                    setDisabledSignals((current) =>
                      checked ? current.filter((entry) => entry !== signal.value) : [...current, signal.value],
                    )
                  }
                />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">If a rule is broken</span>
              <RadioGroup value={proctoringEnforcement} onChange={(value) => setProctoringEnforcement(value as 'warn' | 'block')}>
                <RadioGroupItem value="block" label="Pause The Exam, Then Block After Repeated Strikes" />
                <RadioGroupItem value="warn" label="Record Only — Never Pause The Exam" />
              </RadioGroup>
            </div>
            {proctoringEnforcement === 'block' && (
              <Select
                label="Block After"
                value={proctoringStrikeLimit}
                onChange={setProctoringStrikeLimit}
                options={[
                  { value: '2', label: '2 strikes' },
                  { value: '3', label: '3 strikes' },
                  { value: '5', label: '5 strikes' },
                ]}
              />
            )}
            <div>
              <Checkbox
                label="Record The Candidate's Screen As Evidence"
                checked={screenCaptureEnabled}
                onChange={setScreenCaptureEnabled}
              />
              {screenCaptureEnabled ? (
                <p className="pl-6 pt-1 text-xs text-recruiter-text-secondary">
                  Candidates must share their whole screen to start, and cannot use a phone or tablet. Their screen is captured
                  only when a rule is broken.
                </p>
              ) : null}
            </div>
            <div>
              <Checkbox
                label="Require Safe Exam Browser (Lockdown)"
                checked={lockdownRequired}
                onChange={setLockdownRequired}
              />
              {lockdownRequired ? (
                <p className="pl-6 pt-1 text-xs text-recruiter-text-secondary">
                  Candidates must install Safe Exam Browser and open the exam inside it. SEB refuses to start while
                  remote-access tools or other apps are running, closes background applications, and locks the machine to the
                  exam until submission.
                </p>
              ) : null}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5 border-t border-recruiter-border pt-4 sm:col-span-2">
          <Checkbox
            label="Require a face photo before starting"
            checked={faceVerificationEnabled}
            onChange={setFaceVerificationEnabled}
          />
          {faceVerificationEnabled && (
            <div className="pl-6 pt-2">
              <Select
                label="If the photo can't be captured"
                value={faceEnrolmentPolicy}
                onChange={(value) => setFaceEnrolmentPolicy(value as ExamDetailsValue['faceEnrolmentPolicy'])}
                options={[
                  { value: 'allow_unenrolled', label: "Let them start (recorded as not verified)" },
                  { value: 'retry_then_allow', label: 'Retry 3 times, then let them start (recommended)' },
                  { value: 'require_enrolment', label: "Don't let them start" },
                ]}
              />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {!locked && (
        <Button type="submit" className="self-start">
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
