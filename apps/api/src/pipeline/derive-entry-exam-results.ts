export interface EntryExamResult {
  examId: string;
  examTitle: string;
  passFail: 'pass' | 'fail' | null;
  score: number | null;
}

interface InvitationForResult {
  examId: string;
  exam: { title: string };
  attempt: { result: { passFail: string | null; percentage: number } | null } | null;
}

// Derived, not stored: for each of the candidate's invitations whose exam is one of the
// job's linked exams, surface the result. null attempt/result => not taken yet.
export function deriveEntryExamResults(
  invitations: InvitationForResult[],
  linkedExamIds: string[],
): EntryExamResult[] {
  const linked = new Set(linkedExamIds);
  return invitations
    .filter((inv) => linked.has(inv.examId))
    .map((inv) => {
      const result = inv.attempt?.result ?? null;
      const passFail = result?.passFail === 'pass' || result?.passFail === 'fail' ? result.passFail : null;
      return {
        examId: inv.examId,
        examTitle: inv.exam.title,
        passFail,
        score: result?.percentage ?? null,
      };
    });
}

export function averageRating(ratings: (number | null)[]): number | null {
  const nums = ratings.filter((r): r is number => typeof r === 'number');
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
