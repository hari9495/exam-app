import { deriveEntryExamResults, averageRating } from './derive-entry-exam-results';

const inv = (examId: string, title: string, attempt: any) => ({
  examId, exam: { title }, attempt,
});

describe('deriveEntryExamResults', () => {
  it('returns only invitations whose exam is linked, with derived pass/fail + score', () => {
    const invitations = [
      inv('e1', 'Backend', { status: 'submitted', result: { passFail: 'pass', percentage: 82 } }),
      inv('e2', 'Frontend', { status: 'submitted', result: { passFail: 'fail', percentage: 40 } }),
      inv('e3', 'Unlinked', { status: 'submitted', result: { passFail: 'pass', percentage: 90 } }),
    ];
    const out = deriveEntryExamResults(invitations as any, ['e1', 'e2']);
    expect(out).toEqual([
      { examId: 'e1', examTitle: 'Backend', passFail: 'pass', score: 82 },
      { examId: 'e2', examTitle: 'Frontend', passFail: 'fail', score: 40 },
    ]);
  });
  it('reports null pass/fail + null score when there is no attempt yet', () => {
    const out = deriveEntryExamResults([inv('e1', 'Backend', null)] as any, ['e1']);
    expect(out).toEqual([{ examId: 'e1', examTitle: 'Backend', passFail: null, score: null }]);
  });
});

describe('averageRating', () => {
  it('averages non-null ratings, rounded to one decimal, null when none', () => {
    expect(averageRating([5, 4, null, 3])).toBe(4);
    expect(averageRating([5, 4])).toBe(4.5);
    expect(averageRating([null, null])).toBeNull();
    expect(averageRating([])).toBeNull();
  });

  // AS-3 (answer 2213): a reused invitation shows the earlier result, like a submitted test; untaken stays empty.
  it('a reused invitation counts the earlier attempt result', () => {
    const reused = { examId: 'e1', exam: { title: 'Java' }, attempt: null, reusedAttempt: { result: { passFail: 'pass', percentage: 81 } } };
    const untaken = { examId: 'e1', exam: { title: 'Java' }, attempt: null, reusedAttempt: null };
    expect(deriveEntryExamResults([reused], ['e1'])).toEqual([{ examId: 'e1', examTitle: 'Java', passFail: 'pass', score: 81 }]);
    expect(deriveEntryExamResults([untaken], ['e1'])[0]!.passFail).toBeNull();
  });
});
