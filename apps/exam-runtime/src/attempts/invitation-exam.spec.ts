import { GAZE_SIGNALS, invitationExam } from './invitation-exam';

describe('invitationExam (answer 2202)', () => {
  const exam = { durationMinutes: 60, breaksAllowed: 1, breakMinutes: 10, disabledProctoringSignalsJson: '["tab_switch"]' };
  const none = { extraTimePercent: 0, extraBreaks: 0, breakMinutes: null, proctoringProfile: null };

  it('no help changes nothing', () => {
    expect(invitationExam(exam, none)).toEqual(exam);
  });

  it('adds extra time, extra breaks and a longer break; a shorter break never shortens the test own', () => {
    expect(invitationExam(exam, { ...none, extraTimePercent: 50, extraBreaks: 2, breakMinutes: 20 })).toMatchObject({ durationMinutes: 90, breaksAllowed: 3, breakMinutes: 20 });
    expect(invitationExam(exam, { ...none, breakMinutes: 5 }).breakMinutes).toBe(10);
  });

  it('the no-gaze profile switches the gaze signals off and keeps the test own', () => {
    const out = JSON.parse(invitationExam(exam, { ...none, proctoringProfile: 'no_gaze' }).disabledProctoringSignalsJson!);
    expect(out).toEqual(['tab_switch', ...GAZE_SIGNALS]);
    expect(JSON.parse(invitationExam({ ...exam, disabledProctoringSignalsJson: 'bad' }, { ...none, proctoringProfile: 'no_gaze' }).disabledProctoringSignalsJson!)).toEqual([...GAZE_SIGNALS]);
  });
});
