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
  type: 'large_paste' | 'paste_dominant' | 'no_iteration'
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
export const MEDIUM_EVENT_COUNT_FLAG = 5;

export function deriveTelemetryFlags(input: {
  questionId: string;
  telemetry: AnswerTelemetry;
  finalCodeLength: number;
  scoredFullMarks: boolean;
}): IntegrityFlag[] {
  const { questionId, telemetry, finalCodeLength, scoredFullMarks } = input;
  const { largestPasteChars, pastedChars, keystrokeChars, runCount } = telemetry;
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

export type EvidenceClass = 'answer' | 'environmental' | 'context';

// LAYER 1 -- event types. These fire on a majority of honest candidates (head-turned on 65% of
// real attempts, no-face on 62%), so on their own they carry almost no discriminating
// information: a signal present in two thirds of the population cannot distinguish anyone in
// it. multi_login is here because 145 occurrences across 42 attempts reads like reconnects on
// flaky connections rather than 42 cheats.
//
// webcam_multiple_faces is here for a different reason, and it is the one to read before
// changing this list. The detector is ACCURATE -- the client debounces through a 5-of-8-sample
// voter at 500ms per sample, so an event means a second face really was visible for ~2.5s, not
// a single bad frame. What it cannot do is tell a housemate crossing the room from a second
// person sitting alongside the candidate. Measured on production: it drove 48 of the 56
// environment-promoted attempts, and the episode-count distribution had no valley at any
// threshold, so no volume rule separated the two readings. Accurate, but ambiguous.
//
// An UNKNOWN event type is deliberately NOT treated as context -- see deriveAttemptFlags.
export const CONTEXT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'webcam_head_turned',
  'webcam_no_face',
  'multi_login',
  'webcam_multiple_faces',
]);

// LAYER 2 -- flag types. Keyed on the union, so adding a flag type without classifying it is a
// compile error rather than a silent demotion to invisible. That matters here specifically:
// the bug being fixed is "important evidence got buried", and a new signal defaulting to
// buried would be the same bug again.
export const FLAG_EVIDENCE_CLASS: Record<IntegrityFlag['type'], EvidenceClass> = {
  large_paste: 'answer',
  paste_dominant: 'answer',
  similarity_match: 'answer',
  no_iteration: 'answer',
  proctoring_events: 'environmental',
  webcam_violations: 'context',
};

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

  // Only NON-context high events may raise this to high. An attempt whose only high events are
  // head-turned and no-face gets a medium flag at most, and only then on volume.
  //
  // Note the direction of the unknown-type default: an event type absent from
  // CONTEXT_EVENT_TYPES counts as hard. Event types come from data rather than the type system,
  // so a new detector shipping upstream is treated as meaningful until someone decides
  // otherwise -- the opposite of the flag-type rule above, and deliberately so.
  const highEvents = events.filter((e) => e.severity === 'high' && !CONTEXT_EVENT_TYPES.has(e.eventType));
  const mediumEvents = events.filter((e) => e.severity === 'medium');
  if (highEvents.length > 0 || mediumEvents.length >= MEDIUM_EVENT_COUNT_FLAG) {
    const isHigh = highEvents.length > 0;
    flags.push({
      type: 'proctoring_events',
      severity: isHigh ? 'high' : 'medium',
      detail: `${highEvents.length} high-severity and ${mediumEvents.length} medium-severity proctoring event(s) recorded`,
    });
  }

  return flags;
}

export function deriveLevel(flags: IntegrityFlag[]): IntegrityLevel {
  // A context-class flag can only ever produce `review`, whatever its own severity says.
  const headline = flags.filter((f) => FLAG_EVIDENCE_CLASS[f.type] !== 'context');
  if (headline.some((f) => f.severity === 'high')) return 'high_concern';
  if (flags.length > 0) return 'review';
  return 'clear';
}
