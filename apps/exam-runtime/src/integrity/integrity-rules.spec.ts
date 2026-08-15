import {
  deriveTelemetryFlags,
  deriveAttemptFlags,
  deriveLevel,
  AnswerTelemetry,
  IntegrityFlag,
  LARGE_PASTE_CHARS,
  LARGE_PASTE_HIGH_CHARS,
  PASTE_DOMINANT_MIN_CHARS,
  MEDIUM_EVENT_COUNT_FLAG,
  CONTEXT_EVENT_TYPES,
  FLAG_EVIDENCE_CLASS,
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

// Deliberately removed: the 'implausible_speed' describe block ('does not flag when
// activeSeconds is 0', 'does not flag when finalCodeLength is 299 (just under threshold)',
// 'does not flag when rate is exactly 8 chars/sec', 'flags high when rate is just over 8
// chars/sec'). The flag type is deleted -- it never fired in 265 production attempts because
// pasted content registers as pastedChars, which large_paste and paste_dominant already catch.

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
    // any high-severity event of a NON-context type (whatever it is) yields a high flag. See
    // the 'evidence classification' and 'layer 1' blocks below for the context-type carve-out.
    expect(flag!.severity).toBe('high');
  });

  // Deliberately removed: 'flags high when the triggering high-severity event is multi_login'.
  // It asserted that a high-severity multi_login event alone promotes proctoring_events to
  // high. multi_login is now a CONTEXT_EVENT_TYPES member (145 occurrences across 42 attempts
  // reads like reconnects on flaky connections, not 42 cheats) -- see the 'layer 1' block below.

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

  // Deliberately removed: this asserted that ANY high flag yields high_concern, which is the
  // behaviour that made 75% of real attempts high_concern. Context-class flags no longer
  // promote -- see the 'deriveLevel -- layer 2' block below.
});

describe('evidence classification', () => {
  // A table test so a future reclassification is a deliberate edit to an assertion,
  // never an accident.
  it.each([
    ['large_paste', 'answer'],
    ['paste_dominant', 'answer'],
    ['similarity_match', 'answer'],
    ['no_iteration', 'answer'],
    ['proctoring_events', 'environmental'],
    ['webcam_violations', 'context'],
  ])('classifies %s as %s', (flag, expected) => {
    expect(FLAG_EVIDENCE_CLASS[flag as keyof typeof FLAG_EVIDENCE_CLASS]).toBe(expected);
  });

  it('classifies every flag type, with no extras', () => {
    expect(Object.keys(FLAG_EVIDENCE_CLASS).sort()).toEqual([
      'large_paste', 'no_iteration', 'paste_dominant', 'proctoring_events', 'similarity_match', 'webcam_violations',
    ]);
  });

  it('treats the four ambiguous event types as context and nothing else', () => {
    expect([...CONTEXT_EVENT_TYPES].sort()).toEqual([
      'multi_login', 'webcam_head_turned', 'webcam_multiple_faces', 'webcam_no_face',
    ]);
  });
});

describe('deriveAttemptFlags -- layer 1, context events cannot manufacture a high severity', () => {
  // 65% of real attempts have webcam_head_turned and 62% have webcam_no_face. Before this
  // change a single one of them made the whole attempt high_concern.
  it('does not raise proctoring_events to high for context events alone, however many', () => {
    const events = Array.from({ length: 50 }, () => ({ eventType: 'webcam_no_face', severity: 'high' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).not.toBe('high');
  });

  it('still raises proctoring_events to high for a single hard event', () => {
    const flags = deriveAttemptFlags({
      webcamViolationCount: 0,
      blocked: false,
      events: [{ eventType: 'dev_tools_detected', severity: 'high' }],
    });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).toBe('high');
  });

  it('does not raise proctoring_events to high for multiple faces alone', () => {
    // Measured: this event drove 48 of the 56 environment-promoted attempts, and no volume
    // threshold separated a passer-by from a sustained second presence. It is accurate but
    // ambiguous -- see the spec's "What the dry-run changed".
    const events = Array.from({ length: 20 }, () => ({ eventType: 'webcam_multiple_faces', severity: 'high' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).not.toBe('high');
  });

  it('does not raise proctoring_events to high for a lone high-severity multi_login event', () => {
    // Regression coverage for the deleted test above: multi_login must actually be filtered by
    // deriveAttemptFlags, not just listed in the CONTEXT_EVENT_TYPES constant. A filter written
    // as `!e.eventType.startsWith('webcam_')` would pass every other test in this file while
    // silently re-promoting the 42 real attempts that have multi_login events.
    const flags = deriveAttemptFlags({
      webcamViolationCount: 0,
      blocked: false,
      events: [{ eventType: 'multi_login', severity: 'high' }],
    });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).not.toBe('high');
  });

  it('treats an unrecognised event type as hard, not context', () => {
    const flags = deriveAttemptFlags({
      webcamViolationCount: 0,
      blocked: false,
      events: [{ eventType: 'some_future_detector', severity: 'high' }],
    });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).toBe('high');
  });

  it('counts medium events regardless of type, preserving the existing volume rule', () => {
    const events = Array.from({ length: 5 }, () => ({ eventType: 'webcam_head_turned', severity: 'medium' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).toBe('medium');
  });
});

describe('deriveLevel -- layer 2, context-class flags never promote', () => {
  it('returns review, not high_concern, for a high-severity context flag', () => {
    // webcam_violations goes high when the session was blocked. That is context: it says the
    // proctor stopped the session, not that the candidate's ANSWER is suspect.
    expect(deriveLevel([{ type: 'webcam_violations', severity: 'high', detail: '' }])).toBe('review');
  });

  it('returns high_concern for a single high answer-derived flag', () => {
    expect(deriveLevel([{ type: 'paste_dominant', severity: 'high', detail: '' }])).toBe('high_concern');
  });

  it('returns high_concern when a headline flag is high alongside context flags', () => {
    expect(
      deriveLevel([
        { type: 'webcam_violations', severity: 'high', detail: '' },
        { type: 'large_paste', severity: 'high', detail: '' },
      ]),
    ).toBe('high_concern');
  });

  it('returns review for a medium headline flag', () => {
    expect(deriveLevel([{ type: 'large_paste', severity: 'medium', detail: '' }])).toBe('review');
  });

  it('returns clear for no flags', () => {
    expect(deriveLevel([])).toBe('clear');
  });
});
