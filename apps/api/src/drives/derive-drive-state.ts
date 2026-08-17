export type DriveState = 'registered' | 'in_progress' | 'submitted' | 'passed' | 'failed';

// Pure and DB-free: the board's whole correctness lives here. Result WINS over attempt status
// because a graded verdict is the final word -- but a Result whose passFail is still null
// (a code question pending manual grade) is not a verdict, so it falls through to submitted.
export function deriveDriveState(
  attempt: { status: string; submittedAt: Date | null } | null,
  result: { passFail: string | null } | null,
): DriveState {
  if (result?.passFail === 'pass') return 'passed';
  if (result?.passFail === 'fail') return 'failed';
  if (!attempt) return 'registered';
  if (attempt.status === 'in_progress') return 'in_progress';
  if (attempt.submittedAt) return 'submitted';
  return 'in_progress';
}
