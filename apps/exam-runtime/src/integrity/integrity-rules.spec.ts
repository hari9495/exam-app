import {
  deriveTelemetryFlags,
  deriveAttemptFlags,
  deriveLevel,
  AnswerTelemetry,
  IntegrityFlag,
  LARGE_PASTE_CHARS,
  LARGE_PASTE_HIGH_CHARS,
  PASTE_DOMINANT_MIN_CHARS,
  IMPLAUSIBLE_CHARS_PER_SECOND,
  IMPLAUSIBLE_MIN_CHARS,
  MEDIUM_EVENT_COUNT_FLAG,
} from './integrity-rules';

function telemetry(overrides: Partial<AnswerTelemetry> = {}): AnswerTelemetry {
  return {
    keystrokeChars: 0,
    pastedChars: 0,
    pasteCount: 0,
    largestPasteChars: 0,
    secondsToFirstEdit: 0,
    activeSeconds: 0,
    runCount: 1,
    ...overrides,
  };
}

describe('constants', () => {
  it('exposes the expected threshold values', () => {
    expect(LARGE_PASTE_CHARS).toBe(200);
    expect(LARGE_PASTE_HIGH_CHARS).toBe(800);
    expect(PASTE_DOMINANT_MIN_CHARS).toBe(300);
    expect(IMPLAUSIBLE_CHARS_PER_SECOND).toBe(8);
    expect(IMPLAUSIBLE_MIN_CHARS).toBe(300);
    expect(MEDIUM_EVENT_COUNT_FLAG).toBe(5);
  });
});

describe('deriveTelemetryFlags: large_paste', () => {
  it('does not flag at 199 chars', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ largestPasteChars: 199 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'large_paste')).toBeUndefined();
  });

  it('flags medium at exactly 200 chars', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ largestPasteChars: 200 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    const flag = flags.find((f) => f.type === 'large_paste');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('medium');
    expect(flag!.detail).toBe('Pasted 200 characters in a single paste');
    expect(flag!.questionId).toBe('q1');
  });

  it('stays medium at 799 chars', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ largestPasteChars: 799 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'large_paste')!.severity).toBe('medium');
  });

  it('flags high at exactly 800 chars', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ largestPasteChars: 800 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'large_paste')!.severity).toBe('high');
  });
});

describe('deriveTelemetryFlags: paste_dominant', () => {
  it('does not flag when pastedChars does not exceed keystrokeChars', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ pastedChars: 500, keystrokeChars: 500 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'paste_dominant')).toBeUndefined();
  });

  it('does not flag when totals are 299 (just under threshold)', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ pastedChars: 200, keystrokeChars: 99 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'paste_dominant')).toBeUndefined();
  });

  it('flags high when totals hit exactly 300 and paste dominates', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ pastedChars: 200, keystrokeChars: 100 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    const flag = flags.find((f) => f.type === 'paste_dominant');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('high');
    expect(flag!.detail).toBe('Pasted 200 characters vs 100 typed characters');
  });
});

describe('deriveTelemetryFlags: implausible_speed', () => {
  it('does not flag when activeSeconds is 0', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ activeSeconds: 0 }),
      finalCodeLength: 10000,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'implausible_speed')).toBeUndefined();
  });

  it('does not flag when finalCodeLength is 299 (just under threshold)', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ activeSeconds: 1 }),
      finalCodeLength: 299,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'implausible_speed')).toBeUndefined();
  });

  it('does not flag when rate is exactly 8 chars/sec', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ activeSeconds: 100 }),
      finalCodeLength: 800,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'implausible_speed')).toBeUndefined();
  });

  it('flags high when rate is just over 8 chars/sec', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ activeSeconds: 100 }),
      finalCodeLength: 801,
      scoredFullMarks: false,
    });
    const flag = flags.find((f) => f.type === 'implausible_speed');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('high');
    expect(flag!.detail).toBe('Produced 801 characters in 100 active seconds (8.0 chars/sec)');
  });
});

describe('deriveTelemetryFlags: no_iteration', () => {
  it('does not flag when marks are not full', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ runCount: 0 }),
      finalCodeLength: 0,
      scoredFullMarks: false,
    });
    expect(flags.find((f) => f.type === 'no_iteration')).toBeUndefined();
  });

  it('does not flag when runCount is above 0', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ runCount: 1 }),
      finalCodeLength: 0,
      scoredFullMarks: true,
    });
    expect(flags.find((f) => f.type === 'no_iteration')).toBeUndefined();
  });

  it('flags medium when runCount is 0 and marks are full', () => {
    const flags = deriveTelemetryFlags({
      questionId: 'q1',
      telemetry: telemetry({ runCount: 0 }),
      finalCodeLength: 0,
      scoredFullMarks: true,
    });
    const flag = flags.find((f) => f.type === 'no_iteration');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('medium');
    expect(flag!.detail).toBe('Scored full marks without running the code (runCount 0)');
  });
});

describe('deriveAttemptFlags: webcam_violations', () => {
  it('does not flag at 0 violations', () => {
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events: [] });
    expect(flags.find((f) => f.type === 'webcam_violations')).toBeUndefined();
  });

  it('flags medium at exactly 1 violation, not blocked', () => {
    const flags = deriveAttemptFlags({ webcamViolationCount: 1, blocked: false, events: [] });
    const flag = flags.find((f) => f.type === 'webcam_violations');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('medium');
    expect(flag!.detail).toBe('1 webcam violation(s) recorded');
  });

  it('flags high when blocked', () => {
    const flags = deriveAttemptFlags({ webcamViolationCount: 1, blocked: true, events: [] });
    const flag = flags.find((f) => f.type === 'webcam_violations');
    expect(flag!.severity).toBe('high');
    expect(flag!.detail).toBe('1 webcam violation(s) recorded, session blocked');
  });
});

describe('deriveAttemptFlags: proctoring_events', () => {
  it('does not flag with 4 medium events and no high events', () => {
    const events = Array.from({ length: 4 }, () => ({ eventType: 'tab_switch', severity: 'medium' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')).toBeUndefined();
  });

  it('flags medium at exactly 5 medium events with no disqualifying eventType', () => {
    const events = Array.from({ length: 5 }, () => ({ eventType: 'tab_switch', severity: 'medium' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    const flag = flags.find((f) => f.type === 'proctoring_events');
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe('medium');
    expect(flag!.detail).toBe('0 high-severity and 5 medium-severity proctoring event(s) recorded');
  });

  it('flags high when a dev_tools_detected (high-severity) event is mixed with 4 medium events', () => {
    // dev_tools_detected is stamped severity 'high' at creation (see proctoring-severity.ts).
    const events = [
      { eventType: 'dev_tools_detected', severity: 'high' },
      ...Array.from({ length: 4 }, () => ({ eventType: 'tab_switch', severity: 'medium' })),
    ];
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')!.severity).toBe('high');
  });

  it('flags high on a single high-severity event even without 5 events, regardless of eventType', () => {
    const events = [{ eventType: 'window_blur', severity: 'high' }];
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    const flag = flags.find((f) => f.type === 'proctoring_events');
    expect(flag).toBeDefined();
    // Severity is derived from the stored severity column, not an eventType whitelist --
    // any high-severity event (whatever its type) yields a high flag.
    expect(flag!.severity).toBe('high');
  });

  it('flags high when the triggering high-severity event is multi_login', () => {
    const events = [{ eventType: 'multi_login', severity: 'high' }];
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')!.severity).toBe('high');
  });

  it('flags high when the triggering high-severity event is multi_monitor_detected', () => {
    const events = [{ eventType: 'multi_monitor_detected', severity: 'high' }];
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')!.severity).toBe('high');
  });
});

describe('deriveLevel', () => {
  it('returns clear for no flags', () => {
    expect(deriveLevel([])).toBe('clear');
  });

  it('returns review when only medium flags are present', () => {
    const flags: IntegrityFlag[] = [{ type: 'no_iteration', severity: 'medium', detail: 'x' }];
    expect(deriveLevel(flags)).toBe('review');
  });

  it('returns high_concern when any flag is high', () => {
    const flags: IntegrityFlag[] = [
      { type: 'no_iteration', severity: 'medium', detail: 'x' },
      { type: 'large_paste', severity: 'high', detail: 'y' },
    ];
    expect(deriveLevel(flags)).toBe('high_concern');
  });
});
