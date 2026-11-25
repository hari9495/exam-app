import { teamTodayState } from './team-today';

describe('teamTodayState (Keka ideas: My team today)', () => {
  const base = { wfh: false, onDuty: false };
  it('names each direct report\'s day', () => {
    expect(teamTodayState({ ...base, leave: 'full' })).toBe('leave');
    expect(teamTodayState({ ...base, status: 'weekly_off' })).toBe('off');
    expect(teamTodayState({ ...base, onDuty: true })).toBe('on_duty');
    expect(teamTodayState({ ...base, wfh: true })).toBe('wfh');
    expect(teamTodayState({ ...base, status: 'not_started', firstIn: new Date(), lateMinutes: 12 })).toBe('late');
    expect(teamTodayState({ ...base, status: 'not_started', firstIn: new Date(), lateMinutes: 0 })).toBe('in');
  });

  it('negative: no punch and nothing approved is "not in yet"; a half day of leave is not "on leave"', () => {
    expect(teamTodayState({ ...base })).toBe('not_in');
    expect(teamTodayState({ ...base, status: 'missing_in' })).toBe('not_in');
    expect(teamTodayState({ ...base, leave: 'first' })).toBe('not_in');
    // Leave wins over a work-from-home request on the same day.
    expect(teamTodayState({ ...base, leave: 'full', wfh: true })).toBe('leave');
  });
});
