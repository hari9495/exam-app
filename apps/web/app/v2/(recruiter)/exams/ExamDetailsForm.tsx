'use client';

// v2 ExamDetailsForm — re-skin of components/ExamDetailsForm.tsx on v2 primitives. All state,
// validation and the onSubmit payload are preserved verbatim (format only). Reuses WalkInShareCard
// (infra) and useAuth. Collapsible sections use native <details>; locked disables the fieldset.
import { useState } from 'react';
import Link from 'next/link';
import { Exam, FeedbackVisibility } from '../../../../lib/types';
import { WalkInShareCard } from '../../../../components/WalkInShareCard';
import { useAuth } from '../../../../lib/auth-context';
import { Combobox, Cb } from '../../../../components/ui-v2';

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
  faceMismatchAction: 'flag' | 'warn' | 'pause' | 'block';
}

interface ExamDetailsFormProps {
  initialExam?: Exam;
  onSubmit: (input: ExamDetailsValue) => void;
  submitLabel: string;
  submitting?: boolean;
  locked?: boolean;
  lockedMessage?: string;
  hideWalkInField?: boolean;
  walkInSlot?: React.ReactNode;
  /** When set, a Cancel link is shown in the footer (used by the New exam page). */
  cancelHref?: string;
}

// Keys must stay in sync with TOGGLEABLE_PROCTORING_SIGNALS in the API create-exam DTO.
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

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14 };
const help: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--org-primary)', color: 'var(--org-on-primary)', cursor: 'pointer' };
// The right-hand field column of each side-label section — keeps inputs a sensible width, not full-bleed.
const fieldCol: React.CSSProperties = { maxWidth: 480 };

function Field({ label: l, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="v2-label">{l}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}</label>{children}</div>;
}
function CheckRow({ label: l, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}><Cb checked={checked} onChange={onChange} />{l}</label>;
}
function RadioRow({ checked, onChange, label: l }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }} onClick={onChange}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${checked ? 'var(--org-primary)' : '#cbd5e1'}`, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
        {checked && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--org-primary)' }} />}
      </span>{l}
    </label>
  );
}
// Side-label section (21st Form Layout #4347): title + description on the left, fields on the right.
// `locked` disables everything inside via a disabled fieldset; `alwaysEditable` renders outside that
// fieldset so it stays interactive even when locked. `first` drops the top divider.
function Section({ title, description, locked, alwaysEditable, first, children }: { title: string; description: string; locked?: boolean; alwaysEditable?: React.ReactNode; first?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, padding: '24px 0', borderTop: first ? 'none' : '1px solid var(--hair)' }} className="wf-section">
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <fieldset disabled={locked} style={{ ...fieldCol, border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14, opacity: locked ? 0.6 : 1 }}>
          {children}
        </fieldset>
        {alwaysEditable && <div style={{ ...fieldCol, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>{alwaysEditable}</div>}
      </div>
    </div>
  );
}

export function ExamDetailsForm({ initialExam, onSubmit, submitLabel, submitting, locked = false, lockedMessage, hideWalkInField = false, walkInSlot, cancelHref }: ExamDetailsFormProps) {
  const { organizationSlug } = useAuth();
  const [title, setTitle] = useState(initialExam?.title ?? '');
  const [instructions, setInstructions] = useState(initialExam?.instructions ?? '');
  const [durationMinutes, setDurationMinutes] = useState(String(initialExam?.durationMinutes ?? 60));
  const [passCriteriaPercent, setPassCriteriaPercent] = useState(String(initialExam?.passCriteriaPercent ?? 40));
  const [randomizeOrder, setRandomizeOrder] = useState(initialExam?.randomizeOrder ?? false);
  const [feedbackVisibility, setFeedbackVisibility] = useState<FeedbackVisibility>(initialExam?.feedbackVisibility ?? 'pass_fail');
  const [schedulingEnabled, setSchedulingEnabled] = useState(initialExam?.schedulingEnabled ?? false);
  const [availabilityWindowStart, setAvailabilityWindowStart] = useState(initialExam?.availabilityWindowStart ? toDatetimeLocalValue(initialExam.availabilityWindowStart) : '');
  const [availabilityWindowEnd, setAvailabilityWindowEnd] = useState(initialExam?.availabilityWindowEnd ? toDatetimeLocalValue(initialExam.availabilityWindowEnd) : '');
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
  const [faceEnrolmentPolicy, setFaceEnrolmentPolicy] = useState<ExamDetailsValue['faceEnrolmentPolicy']>((initialExam?.faceEnrolmentPolicy as ExamDetailsValue['faceEnrolmentPolicy']) ?? 'retry_then_allow');
  const [faceMismatchAction, setFaceMismatchAction] = useState<ExamDetailsValue['faceMismatchAction']>((initialExam?.faceMismatchAction as ExamDetailsValue['faceMismatchAction']) ?? 'flag');

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
      allowedIpRange: allowedIpRange.trim() ? allowedIpRange.trim() : initialExam?.allowedIpRange ? null : undefined,
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
      faceMismatchAction,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {locked && (
        <p style={{ ...help, padding: '10px 13px', borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', marginBottom: 12 }}>
          {lockedMessage ?? 'This exam is locked because a candidate has already started it. Nothing here can be changed anymore — you can still invite new candidates and manage live monitoring from their respective tabs.'}
        </p>
      )}
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>Fields marked <span style={{ color: 'var(--danger)' }}>*</span> are required.</p>

      <div style={{ ...card, padding: '0 28px' }}>
      <Section first title="Basic Details" description="The name, instructions and scoring candidates see." locked={locked}>
        <Field label="Title" required><input value={title} onChange={(e) => setTitle(e.target.value)} required style={input} /></Field>
        <Field label="Instructions"><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Duration (minutes)"><input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} style={input} /></Field>
          <Field label="Pass criteria (%)"><input type="number" min={0} max={100} value={passCriteriaPercent} onChange={(e) => setPassCriteriaPercent(e.target.value)} style={input} /></Field>
        </div>
        <CheckRow label="Randomize question order for candidates" checked={randomizeOrder} onChange={setRandomizeOrder} />
        <Field label="Candidate feedback">
          <Combobox width="100%" value={feedbackVisibility} onChange={(v) => setFeedbackVisibility(v as FeedbackVisibility)}
            options={[
              { value: 'none', label: 'None — candidates just see "submitted"' },
              { value: 'pass_fail', label: 'Pass/fail only' },
              { value: 'score', label: 'Score percentage' },
              { value: 'breakdown', label: 'Per-section breakdown' },
            ]} />
        </Field>
      </Section>

      <Section title="Scheduling & Access" description="When the exam is open, and who is allowed to take it." locked={locked} alwaysEditable={hideWalkInField && walkInSlot ? walkInSlot : undefined}>
        <CheckRow label="Enable scheduling" checked={schedulingEnabled} onChange={setSchedulingEnabled} />
        {schedulingEnabled && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Window opens" required><input type="datetime-local" value={availabilityWindowStart} onChange={(e) => setAvailabilityWindowStart(e.target.value)} style={input} /></Field>
              <Field label="Window closes" required><input type="datetime-local" value={availabilityWindowEnd} onChange={(e) => setAvailabilityWindowEnd(e.target.value)} style={input} /></Field>
            </div>
            {schedulingError && <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{schedulingError}</p>}
          </>
        )}
        {!hideWalkInField && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CheckRow label="Enable walk-in registration for this exam" checked={walkInEnabled} onChange={setWalkInEnabled} />
            {walkInEnabled && (
              <>
                <CheckRow label="Show in the shared walk-in exam list" checked={walkInListed} onChange={setWalkInListed} />
                {initialExam?.id && organizationSlug && <WalkInShareCard examId={initialExam.id} orgSlug={organizationSlug} />}
              </>
            )}
          </div>
        )}
        <Field label="Allowed IP / CIDR range (optional)"><input value={allowedIpRange} onChange={(e) => setAllowedIpRange(e.target.value)} placeholder="e.g. 203.0.113.4 or 203.0.113.0/24" style={input} /></Field>
      </Section>

      <Section title="Proctoring & Integrity" description="Monitoring, webcam, lockdown and identity checks." locked={locked}>
        <CheckRow label="Enable anti-cheating monitoring for this exam" checked={enableAntiCheating} onChange={setEnableAntiCheating} />
        {enableAntiCheating && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '2px solid var(--hair)', paddingLeft: 16 }}>
            <div>
              <CheckRow label="Require webcam proctoring" checked={webcamProctoringEnabled} onChange={setWebcamProctoringEnabled} />
              {webcamProctoringEnabled && (
                <div style={{ paddingLeft: 26, paddingTop: 8 }}>
                  <CheckRow label="Record only — never pause for webcam violations" checked={webcamRecordOnly} onChange={setWebcamRecordOnly} />
                  <p style={{ ...help, paddingTop: 4 }}>Webcam violations (no face, multiple faces, head turned) are still detected and recorded as evidence, but never pause or block the exam. The rules below still pause/block as configured.</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="v2-label" style={{ marginBottom: 0 }}>Watch for ({PROCTORING_SIGNAL_LABELS.length - disabledSignals.length}/{PROCTORING_SIGNAL_LABELS.length} selected)</span>
              {PROCTORING_SIGNAL_LABELS.map((signal) => (
                <CheckRow key={signal.value} label={signal.label} checked={!disabledSignals.includes(signal.value)}
                  onChange={(checked) => setDisabledSignals((current) => (checked ? current.filter((entry) => entry !== signal.value) : [...current, signal.value]))} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="v2-label" style={{ marginBottom: 0 }}>If a rule is broken</span>
              <RadioRow checked={proctoringEnforcement === 'block'} onChange={() => setProctoringEnforcement('block')} label="Pause the exam, then block after repeated strikes" />
              <RadioRow checked={proctoringEnforcement === 'warn'} onChange={() => setProctoringEnforcement('warn')} label="Record only — never pause the exam" />
            </div>
            {proctoringEnforcement === 'block' && (
              <Field label="Block after">
                <Combobox width={200} value={proctoringStrikeLimit} onChange={setProctoringStrikeLimit}
                  options={[{ value: '2', label: '2 strikes' }, { value: '3', label: '3 strikes' }, { value: '5', label: '5 strikes' }]} />
              </Field>
            )}
            <div>
              <CheckRow label="Record the candidate's screen as evidence" checked={screenCaptureEnabled} onChange={setScreenCaptureEnabled} />
              {screenCaptureEnabled && <p style={{ ...help, paddingLeft: 26, paddingTop: 4 }}>Candidates must share their whole screen to start, and cannot use a phone or tablet. Their screen is captured only when a rule is broken.</p>}
            </div>
            <div>
              <CheckRow label="Require Safe Exam Browser (lockdown)" checked={lockdownRequired} onChange={setLockdownRequired} />
              {lockdownRequired && <p style={{ ...help, paddingLeft: 26, paddingTop: 4 }}>Candidates must install Safe Exam Browser and open the exam inside it. SEB refuses to start while remote-access tools or other apps are running, closes background applications, and locks the machine to the exam until submission.</p>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--hair)', paddingTop: 14 }}>
          <CheckRow label="Require a face photo before starting" checked={faceVerificationEnabled} onChange={setFaceVerificationEnabled} />
          {faceVerificationEnabled && (
            <div style={{ paddingLeft: 26, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="If the photo can't be captured">
                <Combobox width="100%" value={faceEnrolmentPolicy} onChange={(v) => setFaceEnrolmentPolicy(v as ExamDetailsValue['faceEnrolmentPolicy'])}
                  options={[
                    { value: 'allow_unenrolled', label: 'Let them start (recorded as not verified)' },
                    { value: 'retry_then_allow', label: 'Retry 3 times, then let them start (recommended)' },
                    { value: 'require_enrolment', label: "Don't let them start" },
                  ]} />
              </Field>
              <div>
                <Field label="If the face doesn't match">
                  <Combobox width="100%" value={faceMismatchAction} onChange={(v) => setFaceMismatchAction(v as ExamDetailsValue['faceMismatchAction'])}
                    options={[
                      { value: 'flag', label: 'Record only (recommended)' },
                      { value: 'warn', label: 'Record and warn the candidate' },
                      { value: 'pause', label: 'Record and pause the exam' },
                      { value: 'block', label: 'Record and block the exam' },
                    ]} />
                </Field>
                <p style={{ ...help, paddingTop: 4 }}>Thresholds are not yet calibrated. Leave this on &quot;Record only&quot; until calibration and the fairness check are complete.</p>
              </div>
            </div>
          )}
        </div>
      </Section>

      {!locked && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', padding: '18px 0', borderTop: '1px solid var(--hair)' }}>
          {cancelHref && <Link href={cancelHref} style={ghostBtn}>Cancel</Link>}
          <button type="submit" disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Saving…' : submitLabel}</button>
        </div>
      )}
      </div>
    </form>
  );
}
