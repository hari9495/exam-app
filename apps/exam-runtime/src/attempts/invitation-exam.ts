import { effectiveDurationMinutes } from '../grading/grading';

/** Answer 2202: the gaze signals a "no gaze flags" proctoring profile stops watching. */
export const GAZE_SIGNALS = ['looking_down', 'webcam_head_turned'] as const;
/** The AI vision flag that is a gaze signal. */
export const GAZE_AI_FLAG = 'looking_away';

interface ExamTiming {
  durationMinutes: number;
  breaksAllowed: number;
  breakMinutes: number;
  disabledProctoringSignalsJson: string | null;
}
export interface InvitationHelp {
  extraTimePercent: number;
  extraBreaks: number;
  breakMinutes: number | null;
  proctoringProfile: string | null;
}

function signals(json: string | null): string[] {
  try {
    const v: unknown = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The test as this one invitation takes it: approved extra time, extra or longer breaks (never shorter than the test's)
 * and, for the "no gaze" profile, the gaze signals switched off. Everything that settles or watches an attempt reads this.
 */
export function invitationExam<E extends ExamTiming>(exam: E, inv: InvitationHelp): E {
  return {
    ...exam,
    durationMinutes: effectiveDurationMinutes(exam.durationMinutes, inv.extraTimePercent),
    breaksAllowed: exam.breaksAllowed + (inv.extraBreaks ?? 0),
    breakMinutes: Math.max(exam.breakMinutes, inv.breakMinutes ?? 0),
    disabledProctoringSignalsJson: inv.proctoringProfile === 'no_gaze' ? JSON.stringify([...new Set([...signals(exam.disabledProctoringSignalsJson), ...GAZE_SIGNALS])]) : exam.disabledProctoringSignalsJson,
  };
}
