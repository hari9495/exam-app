import { CLIENT_REPORTABLE_EVENT_TYPES, getProctoringEventSeverity, isStrikeWorthy } from './proctoring-severity';
import { TOGGLEABLE_PROCTORING_SIGNALS } from '../../../api/src/exams/dto/create-exam.dto';

describe('CLIENT_REPORTABLE_EVENT_TYPES', () => {
  it('does not include multi_login (system-generated only)', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).not.toContain('multi_login');
  });

  it('includes every browser-level anti-cheat event from the product spec', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toEqual(
      expect.arrayContaining(['tab_switch', 'fullscreen_exit', 'copy_paste', 'right_click', 'dev_tools_detected', 'refresh_warning', 'idle_timeout']),
    );
  });
});

describe('getProctoringEventSeverity', () => {
  it('maps dev_tools_detected to high', () => {
    expect(getProctoringEventSeverity('dev_tools_detected')).toBe('high');
  });

  it('maps multi_login to high', () => {
    expect(getProctoringEventSeverity('multi_login')).toBe('high');
  });

  it('maps tab_switch to medium', () => {
    expect(getProctoringEventSeverity('tab_switch')).toBe('medium');
  });

  it('maps fullscreen_exit to medium', () => {
    expect(getProctoringEventSeverity('fullscreen_exit')).toBe('medium');
  });

  it('maps copy_paste to medium', () => {
    expect(getProctoringEventSeverity('copy_paste')).toBe('medium');
  });

  it('maps editor_paste to medium', () => {
    expect(getProctoringEventSeverity('editor_paste')).toBe('medium');
  });

  it('maps right_click to low', () => {
    expect(getProctoringEventSeverity('right_click')).toBe('low');
  });

  it('maps refresh_warning to low', () => {
    expect(getProctoringEventSeverity('refresh_warning')).toBe('low');
  });

  it('maps idle_timeout to low', () => {
    expect(getProctoringEventSeverity('idle_timeout')).toBe('low');
  });

  it('defaults an unrecognized event type to low rather than throwing', () => {
    expect(getProctoringEventSeverity('something_unmapped')).toBe('low');
  });

  it('accepts window_blur as client-reportable with medium severity', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('window_blur');
    expect(getProctoringEventSeverity('window_blur')).toBe('medium');
  });

  it('accepts multi_monitor_detected as client-reportable with high severity', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('multi_monitor_detected');
    expect(getProctoringEventSeverity('multi_monitor_detected')).toBe('high');
  });

  it('accepts looking_down as client-reportable with medium severity', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('looking_down');
    expect(getProctoringEventSeverity('looking_down')).toBe('medium');
  });

  it('maps webcam_snapshot to low severity (server-stored, not client-reportable)', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).not.toContain('webcam_snapshot');
    expect(getProctoringEventSeverity('webcam_snapshot')).toBe('low');
  });

  it('maps screen_share_started to low severity and is client-reportable', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('screen_share_started');
    expect(getProctoringEventSeverity('screen_share_started')).toBe('low');
  });

  it('maps screen_share_stopped to high severity and is client-reportable', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('screen_share_stopped');
    expect(getProctoringEventSeverity('screen_share_stopped')).toBe('high');
  });

  // Deliberately below 'high' while stage 2's mismatch threshold is uncalibrated -- see
  // proctoring-severity.ts. Revisit once stage 3 calibrates the thresholds.
  it('maps face_mismatch to medium severity, not high, while thresholds are uncalibrated', () => {
    expect(getProctoringEventSeverity('face_mismatch')).toBe('medium');
  });

  it('does not treat face_mismatch as client-reportable (server-generated only)', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).not.toContain('face_mismatch');
  });
});

describe('isStrikeWorthy', () => {
  it.each([
    'tab_switch',
    'window_blur',
    'fullscreen_exit',
    'copy_paste',
    'right_click',
    'dev_tools_detected',
    'multi_monitor_detected',
    'idle_timeout',
    'screen_share_stopped',
  ])('returns true for %s', (eventType) => {
    expect(isStrikeWorthy(eventType)).toBe(true);
  });

  it.each(['refresh_warning', 'editor_paste', 'looking_down', 'webcam_snapshot', 'screen_share_started', 'face_mismatch', 'something_unmapped'])(
    'returns false for %s',
    (eventType) => {
      expect(isStrikeWorthy(eventType)).toBe(false);
    },
  );
});

describe('TOGGLEABLE_PROCTORING_SIGNALS', () => {
  it('still has exactly 8 entries: adding screen_share_started/stopped must not widen it', () => {
    expect(TOGGLEABLE_PROCTORING_SIGNALS).toHaveLength(8);
    expect(TOGGLEABLE_PROCTORING_SIGNALS).not.toContain('screen_share_started');
    expect(TOGGLEABLE_PROCTORING_SIGNALS).not.toContain('screen_share_stopped');
  });
});
