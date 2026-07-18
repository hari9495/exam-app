// Pure-function deterministic integrity rules + level derivation.
// No NestJS wiring, no DB, no dependencies (see task-4 brief).

export interface AnswerTelemetry {
  keystrokeChars: number;
  pastedChars: number;
  pasteCount: number;
  largestPasteChars: number;
  secondsToFirstEdit: number;
  activeSeconds: number;
  runCount: number;
}

export interface IntegrityFlag {
  type: 'large_paste' | 'paste_dominant' | 'implausible_speed' | 'no_iteration'
      | 'similarity_match' | 'webcam_violations' | 'proctoring_events';
  severity: 'medium' | 'high';
  detail: string;
  questionId?: string;
  counterpartAttemptId?: string;
  similarity?: number;
}

export type IntegrityLevel = 'clear' | 'review' | 'high_concern';

export const LARGE_PASTE_CHARS = 200;
export const LARGE_PASTE_HIGH_CHARS = 800;
export const PASTE_DOMINANT_MIN_CHARS = 300;
export const IMPLAUSIBLE_CHARS_PER_SECOND = 8;
export const IMPLAUSIBLE_MIN_CHARS = 300;
export const MEDIUM_EVENT_COUNT_FLAG = 5;

export function deriveTelemetryFlags(input: {
  questionId: string;
  telemetry: AnswerTelemetry;
  finalCodeLength: number;
  scoredFullMarks: boolean;
}): IntegrityFlag[] {
  const { questionId, telemetry, finalCodeLength, scoredFullMarks } = input;
  const { largestPasteChars, pastedChars, keystrokeChars, activeSeconds, runCount } = telemetry;
  const flags: IntegrityFlag[] = [];

  if (largestPasteChars >= LARGE_PASTE_CHARS) {
    flags.push({
      type: 'large_paste',
      severity: largestPasteChars >= LARGE_PASTE_HIGH_CHARS ? 'high' : 'medium',
      detail: `Pasted ${largestPasteChars} characters in a single paste`,
      questionId,
    });
  }

  if (pastedChars > keystrokeChars && pastedChars + keystrokeChars >= PASTE_DOMINANT_MIN_CHARS) {
    flags.push({
      type: 'paste_dominant',
      severity: 'high',
      detail: `Pasted ${pastedChars} characters vs ${keystrokeChars} typed characters`,
      questionId,
    });
  }

  if (
    activeSeconds > 0 &&
    finalCodeLength >= IMPLAUSIBLE_MIN_CHARS &&
    finalCodeLength / activeSeconds > IMPLAUSIBLE_CHARS_PER_SECOND
  ) {
    const rate = finalCodeLength / activeSeconds;
    flags.push({
      type: 'implausible_speed',
      severity: 'high',
      detail: `Produced ${finalCodeLength} characters in ${activeSeconds} active seconds (${rate.toFixed(1)} chars/sec)`,
      questionId,
    });
  }

  if (runCount === 0 && scoredFullMarks) {
    flags.push({
      type: 'no_iteration',
      severity: 'medium',
      detail: `Scored full marks without running the code (runCount ${runCount})`,
      questionId,
    });
  }

  return flags;
}

export function deriveAttemptFlags(input: {
  webcamViolationCount: number;
  blocked: boolean;
  events: { eventType: string; severity: string }[];
}): IntegrityFlag[] {
  const { webcamViolationCount, blocked, events } = input;
  const flags: IntegrityFlag[] = [];

  if (webcamViolationCount >= 1) {
    flags.push({
      type: 'webcam_violations',
      severity: blocked ? 'high' : 'medium',
      detail: `${webcamViolationCount} webcam violation(s) recorded${blocked ? ', session blocked' : ''}`,
    });
  }

  const highEvents = events.filter((e) => e.severity === 'high');
  const mediumEvents = events.filter((e) => e.severity === 'medium');
  if (highEvents.length > 0 || mediumEvents.length >= MEDIUM_EVENT_COUNT_FLAG) {
    const isHigh = events.some(
      (e) => e.eventType === 'dev_tools_detected' || e.eventType === 'multi_login',
    );
    flags.push({
      type: 'proctoring_events',
      severity: isHigh ? 'high' : 'medium',
      detail: `${highEvents.length} high-severity and ${mediumEvents.length} medium-severity proctoring event(s) recorded`,
    });
  }

  return flags;
}

export function deriveLevel(flags: IntegrityFlag[]): IntegrityLevel {
  if (flags.some((f) => f.severity === 'high')) return 'high_concern';
  if (flags.length > 0) return 'review';
  return 'clear';
}
