// Assessments AS-6 (PRC-19): who marks an answer next and when its mark is final. Pure, so the order is tested.
//
// One marker (the company default): the first mark is final.
// Two markers (asmt.second_marker on): two blind marks; if they differ by no more than the company's gap (a share of
// the question's marks), the final mark is their average, rounded half up; otherwise a third person moderates and
// their mark is final. Nobody marks the same answer twice, and the moderator is neither marker.

export interface MarkRow {
  round: number;
  marks: number;
  markerUserId: string;
}

export type MarkState =
  | { status: 'final'; marks: number; moderated: boolean }
  | { status: 'needs_first' }
  | { status: 'needs_second' }
  | { status: 'needs_moderation'; a: number; b: number };

export function markState(rows: MarkRow[], o: { double: boolean; gapPercent: number; max: number }): MarkState {
  const r = (n: number) => rows.find((x) => x.round === n);
  const [one, two, three] = [r(1), r(2), r(3)];
  if (three) return { status: 'final', marks: three.marks, moderated: true };
  if (!one) return { status: 'needs_first' };
  if (!o.double) return { status: 'final', marks: one.marks, moderated: false };
  if (!two) return { status: 'needs_second' };
  if (!farApart(one.marks, two.marks, o.gapPercent, o.max)) return { status: 'final', marks: Math.floor((one.marks + two.marks) / 2 + 0.5), moderated: false };
  return { status: 'needs_moderation', a: one.marks, b: two.marks };
}

/**
 * Answer 2271: a mark from a rubric: one whole mark per criterion, none above its own, and the total is their sum. A
 * question without a rubric takes the total as given. Returns the total, or why it is refused.
 */
export function rubricMark(rubric: { criterion: string; marks: number }[], criteria: number[] | undefined, total: number): { marks: number } | { refused: string } {
  if (!rubric.length) return criteria?.length ? { refused: 'This question has no rubric: give one mark.' } : { marks: total };
  if (!criteria || criteria.length !== rubric.length) return { refused: `Mark each of the ${rubric.length} criteria.` };
  const over = rubric.findIndex((r, i) => criteria[i]! > r.marks);
  if (over >= 0) return { refused: `"${rubric[over]!.criterion}" is out of ${rubric[over]!.marks} marks.` };
  const sum = criteria.reduce((t, x) => t + x, 0);
  return sum === total ? { marks: sum } : { refused: `The criteria add up to ${sum}, not ${total}.` };
}

/** Two marks need a moderator when they differ by more than the company's share of the question's marks. */
export function farApart(a: number, b: number, gapPercent: number, max: number): boolean {
  return Math.abs(a - b) > (gapPercent / 100) * max;
}

/** The round this person would mark in, or why they cannot. */
export function nextRound(state: MarkState, rows: MarkRow[], userId: string): { round: number } | { refused: string } {
  if (rows.some((x) => x.markerUserId === userId)) return { refused: 'You have already marked this answer.' };
  if (state.status === 'final') return { refused: 'This answer already has its final mark.' };
  if (state.status === 'needs_first') return { round: 1 };
  if (state.status === 'needs_second') return { round: 2 };
  return { round: 3 };
}
