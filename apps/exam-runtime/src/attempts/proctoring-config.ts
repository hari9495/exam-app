export interface ProctoringConfigSource {
  enableAntiCheating: boolean;
  webcamProctoringEnabled: boolean;
  webcamRecordOnly: boolean;
  proctoringEnforcement: string;
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
  screenCaptureEnabled: boolean;
  lockdownRequired: boolean;
  faceVerificationEnabled: boolean;
  /** allow_unenrolled | retry_then_allow | require_enrolment */
  faceEnrolmentPolicy: string;
}

export interface ExamProctoringConfig {
  enableAntiCheating: boolean;
  webcamEnabled: boolean;
  // Overrides `enforcement` for webcam violations only -- see registerWebcamViolation.
  webcamRecordOnly: boolean;
  enforcement: 'warn' | 'block';
  strikeLimit: number;
  disabledSignals: string[];
  screenCaptureEnabled: boolean;
  lockdownRequired: boolean;
  // Independent of enableAntiCheating -- face enrolment is a separate, consent-gated feature,
  // not part of the anti-cheating master switch, so it is never forced off in the branch below.
  faceVerificationEnabled: boolean;
  /** allow_unenrolled | retry_then_allow | require_enrolment */
  faceEnrolmentPolicy: string;
}

export interface ProctoringBypassSource {
  proctoringBypassedAt: Date | null;
  // Required, not optional: a partial Prisma `select` that omits this column must fail
  // to compile rather than silently read as "not revoked" (undefined == null is true),
  // which would leave proctoring stuck warn-only. Fail-closed on this predicate.
  proctoringBypassRevokedAt: Date | null;
}

export function isProctoringBypassActive(attempt?: ProctoringBypassSource | null): boolean {
  return attempt?.proctoringBypassedAt != null && attempt.proctoringBypassRevokedAt == null;
}

function parseDisabledSignals(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    // A malformed or unexpected value must degrade to "watch everything" rather
    // than throw -- this runs on every proctoring event of a live exam.
    if (!Array.isArray(parsed)) return [];
    return parsed.every((entry) => typeof entry === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveProctoringConfig(
  exam: ProctoringConfigSource,
  attempt?: ProctoringBypassSource,
): ExamProctoringConfig {
  // A recruiter bypass downgrades enforcement to warn-only for this one attempt:
  // events are still recorded, counted and broadcast, but nothing pauses or blocks
  // the candidate. It never widens what is watched -- only what is punished.
  // A revoked bypass enforces again.
  const bypassed = isProctoringBypassActive(attempt);
  if (!exam.enableAntiCheating) {
    // Defense in depth: the write path (ExamsService.resolveProctoringFields) already
    // forces webcam/screen-capture/lockdown off and every signal disabled when this
    // master switch is off, but a stale or duplicated row must still resolve to
    // fully-off here too -- same "the row can't lie" guarantee for every reader.
    return {
      enableAntiCheating: false,
      webcamEnabled: false,
      webcamRecordOnly: false,
      enforcement: 'warn',
      strikeLimit: Math.max(1, exam.proctoringStrikeLimit),
      disabledSignals: parseDisabledSignals(exam.disabledProctoringSignalsJson),
      screenCaptureEnabled: false,
      lockdownRequired: false,
      faceVerificationEnabled: exam.faceVerificationEnabled,
      faceEnrolmentPolicy: exam.faceEnrolmentPolicy,
    };
  }
  return {
    enableAntiCheating: true,
    webcamEnabled: exam.webcamProctoringEnabled,
    // Never widened by a bypass -- a bypass already forces enforcement to 'warn' below,
    // which covers webcam too; this only matters when NOT bypassed.
    webcamRecordOnly: exam.webcamRecordOnly,
    // Anything other than an explicit 'warn' enforces, so a corrupt row fails safe.
    enforcement: (bypassed || exam.proctoringEnforcement === 'warn') ? 'warn' : 'block',
    strikeLimit: Math.max(1, exam.proctoringStrikeLimit),
    disabledSignals: parseDisabledSignals(exam.disabledProctoringSignalsJson),
    // Never touched by a bypass -- a bypass narrows what is punished, never what is watched.
    screenCaptureEnabled: exam.screenCaptureEnabled,
    // Same rule: a bypass never relaxes the Safe Exam Browser requirement.
    lockdownRequired: exam.lockdownRequired,
    faceVerificationEnabled: exam.faceVerificationEnabled,
    faceEnrolmentPolicy: exam.faceEnrolmentPolicy,
  };
}

export function isSignalEnabled(config: ExamProctoringConfig, eventType: string): boolean {
  return config.enableAntiCheating && !config.disabledSignals.includes(eventType);
}
