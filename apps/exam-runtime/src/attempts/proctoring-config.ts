export interface ProctoringConfigSource {
  webcamProctoringEnabled: boolean;
  proctoringEnforcement: string;
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
}

export interface ExamProctoringConfig {
  webcamEnabled: boolean;
  enforcement: 'warn' | 'block';
  strikeLimit: number;
  disabledSignals: string[];
}

function parseDisabledSignals(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    // A malformed or unexpected value must degrade to "watch everything" rather
    // than throw -- this runs on every proctoring event of a live exam.
    if (!Array.isArray(parsed)) return [];
    return parsed.every((entry) => typeof entry === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveProctoringConfig(exam: ProctoringConfigSource): ExamProctoringConfig {
  return {
    webcamEnabled: exam.webcamProctoringEnabled,
    // Anything other than an explicit 'warn' enforces, so a corrupt row fails safe.
    enforcement: exam.proctoringEnforcement === 'warn' ? 'warn' : 'block',
    strikeLimit: Math.max(1, exam.proctoringStrikeLimit),
    disabledSignals: parseDisabledSignals(exam.disabledProctoringSignalsJson),
  };
}

export function isSignalEnabled(config: ExamProctoringConfig, eventType: string): boolean {
  return !config.disabledSignals.includes(eventType);
}
