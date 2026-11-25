import { modeOf, namesNoSwitch, needsApproval, presetOf, retentionCutoff, retentionDays, testFingerprint } from './asmt-rules';

describe('AS-2 rules', () => {
  describe('proctoring modes (answer 2007)', () => {
    it('reads the named mode from the switches', () => {
      expect(modeOf({ enableAntiCheating: false, webcamProctoringEnabled: true, webcamAiAnalysisEnabled: true, screenCaptureEnabled: true })).toBe('open');
      expect(modeOf({ enableAntiCheating: true, webcamProctoringEnabled: true, webcamAiAnalysisEnabled: true, screenCaptureEnabled: false })).toBe('ai');
      expect(modeOf({ enableAntiCheating: true, webcamProctoringEnabled: true, webcamAiAnalysisEnabled: true, screenCaptureEnabled: true })).toBe('record');
    });

    it('negative: switches set one by one on the older screen are "custom", never guessed', () => {
      expect(modeOf({ enableAntiCheating: true, webcamProctoringEnabled: true, webcamAiAnalysisEnabled: false, screenCaptureEnabled: false })).toBe('custom');
      expect(modeOf({ enableAntiCheating: true, webcamProctoringEnabled: false, webcamAiAnalysisEnabled: false, screenCaptureEnabled: true })).toBe('custom');
    });

    it('each preset reads back as its own mode; Open turns everything off, the others watch every browser signal again', () => {
      for (const m of ['open', 'ai', 'record'] as const) expect(modeOf(presetOf(m))).toBe(m);
      expect(presetOf('open').disabledProctoringSignals).toBeUndefined();
      expect(presetOf('ai').disabledProctoringSignals).toEqual([]);
    });

    it('the company default applies only when the payload names no switch', () => {
      expect(namesNoSwitch({})).toBe(true);
      expect(namesNoSwitch({ enableAntiCheating: true })).toBe(false);
      expect(namesNoSwitch({ lockdownRequired: false })).toBe(false);
    });
  });

  describe('retention (answer 2008)', () => {
    it('keeps the setting inside 30 to 365 days', () => {
      expect(retentionDays('30')).toBe(30);
      expect(retentionDays('365')).toBe(365);
      expect(retentionDays('180')).toBe(180);
    });

    it('negative: below 30, above 365, empty or not a number falls inside the bounds (never 0, never forever)', () => {
      expect(retentionDays('7')).toBe(30);
      expect(retentionDays('1000')).toBe(365);
      expect(retentionDays('')).toBe(30);
      expect(retentionDays(undefined)).toBe(30);
      expect(retentionDays('ninety')).toBe(30);
    });

    it('the cut-off is that many whole days back', () => {
      expect(retentionCutoff(new Date('2026-11-30T00:00:00Z'), 30).toISOString()).toBe('2026-10-31T00:00:00.000Z');
    });
  });

  describe('approver for big tests (asmt.high_stakes)', () => {
    it('needs an approver only above the number', () => {
      expect(needsApproval(501, 500)).toBe(true);
      expect(needsApproval(500, 500)).toBe(false);
      expect(needsApproval(null, 500)).toBe(false);
    });

    const base = {
      title: 'Java L2',
      durationMinutes: 60,
      passCriteriaPercent: 60,
      expectedCandidates: 800,
      switches: presetOf('ai'),
      sections: [{ title: 'Java', weightPercent: 100, selectionMode: 'fixed', poolSize: null, poolDifficulty: null, requiredCount: null, questionIds: ['b', 'a'], tagIds: [] }],
    };

    it('the fingerprint ignores the order questions were attached in', () => {
      expect(testFingerprint(base)).toBe(testFingerprint({ ...base, sections: [{ ...base.sections[0]!, questionIds: ['a', 'b'] }] }));
    });

    it('negative: any change candidates would see changes the fingerprint (the approval no longer holds)', () => {
      const fp = testFingerprint(base);
      expect(testFingerprint({ ...base, passCriteriaPercent: 50 })).not.toBe(fp);
      expect(testFingerprint({ ...base, switches: presetOf('open') })).not.toBe(fp);
      expect(testFingerprint({ ...base, sections: [{ ...base.sections[0]!, questionIds: ['a', 'b', 'c'] }] })).not.toBe(fp);
    });
  });
});
