import { CLIENT_REPORTABLE_EVENT_TYPES, getProctoringEventSeverity } from './proctoring-severity';

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
});
