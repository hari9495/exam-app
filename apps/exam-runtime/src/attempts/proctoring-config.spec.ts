import { resolveProctoringConfig, isSignalEnabled } from './proctoring-config';

function source(overrides: Partial<Parameters<typeof resolveProctoringConfig>[0]> = {}) {
  return {
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 3,
    disabledProctoringSignalsJson: null,
    ...overrides,
  };
}

describe('resolveProctoringConfig', () => {
  it("reproduces today's behaviour for an exam left on the schema defaults", () => {
    expect(resolveProctoringConfig(source())).toEqual({
      webcamEnabled: true,
      enforcement: 'block',
      strikeLimit: 3,
      disabledSignals: [],
    });
  });

  it('parses the disabled-signal JSON array', () => {
    const config = resolveProctoringConfig(source({ disabledProctoringSignalsJson: '["right_click","idle_timeout"]' }));

    expect(config.disabledSignals).toEqual(['right_click', 'idle_timeout']);
  });

  it('falls back to watching every signal when the stored JSON is malformed, rather than throwing mid-exam', () => {
    const config = resolveProctoringConfig(source({ disabledProctoringSignalsJson: '{not json' }));

    expect(config.disabledSignals).toEqual([]);
  });

  it('ignores stored JSON that parses but is not an array of strings', () => {
    expect(resolveProctoringConfig(source({ disabledProctoringSignalsJson: '{"a":1}' })).disabledSignals).toEqual([]);
    expect(resolveProctoringConfig(source({ disabledProctoringSignalsJson: '[1,2]' })).disabledSignals).toEqual([]);
  });

  it('treats any unrecognised enforcement value as block, so a bad row never silently disables enforcement', () => {
    expect(resolveProctoringConfig(source({ proctoringEnforcement: 'nonsense' })).enforcement).toBe('block');
    expect(resolveProctoringConfig(source({ proctoringEnforcement: 'warn' })).enforcement).toBe('warn');
  });

  it('clamps a nonsensical strike limit to at least 1', () => {
    expect(resolveProctoringConfig(source({ proctoringStrikeLimit: 0 })).strikeLimit).toBe(1);
    expect(resolveProctoringConfig(source({ proctoringStrikeLimit: -4 })).strikeLimit).toBe(1);
  });
});

describe('isSignalEnabled', () => {
  const config = resolveProctoringConfig(source({ disabledProctoringSignalsJson: '["right_click"]' }));

  it('reports a disabled signal as off', () => {
    expect(isSignalEnabled(config, 'right_click')).toBe(false);
  });

  it('reports every other signal as on', () => {
    expect(isSignalEnabled(config, 'tab_switch')).toBe(true);
    expect(isSignalEnabled(config, 'dev_tools_detected')).toBe(true);
  });
});

describe('proctoring bypass', () => {
  const blockingExam = {
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 5,
    disabledProctoringSignalsJson: JSON.stringify(['right_click']),
  };

  it('forces warn enforcement when the attempt is bypassed', () => {
    const config = resolveProctoringConfig(blockingExam, { proctoringBypassedAt: new Date(), proctoringBypassRevokedAt: null });

    expect(config.enforcement).toBe('warn');
  });

  it('leaves every other setting untouched when bypassed', () => {
    const config = resolveProctoringConfig(blockingExam, { proctoringBypassedAt: new Date(), proctoringBypassRevokedAt: null });

    expect(config.webcamEnabled).toBe(true);
    expect(config.strikeLimit).toBe(5);
    expect(config.disabledSignals).toEqual(['right_click']);
  });

  it('enforces normally when the attempt is not bypassed', () => {
    expect(resolveProctoringConfig(blockingExam, { proctoringBypassedAt: null, proctoringBypassRevokedAt: null }).enforcement).toBe('block');
  });

  it('enforces normally when no attempt is supplied at all', () => {
    expect(resolveProctoringConfig(blockingExam).enforcement).toBe('block');
  });

  it('enforces again once the bypass has been revoked', () => {
    const config = resolveProctoringConfig(blockingExam, {
      proctoringBypassedAt: new Date('2026-07-26T10:00:00.000Z'),
      proctoringBypassRevokedAt: new Date('2026-07-26T10:30:00.000Z'),
    });

    expect(config.enforcement).toBe('block');
  });

  it('is a no-op on an exam already configured as warn-only', () => {
    const warnExam = { ...blockingExam, proctoringEnforcement: 'warn' };

    expect(resolveProctoringConfig(warnExam, { proctoringBypassedAt: new Date(), proctoringBypassRevokedAt: null }).enforcement).toBe('warn');
  });
});
