import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

// Security fix (assessments audit, 13 Nov 2026): answer keys (which options are correct, an essay's model answer, a code
// question's test cases with their expected output) go only to the people who write tests or questions. Everyone else who
// may read a test, a question or a result (hiring managers, recruiters reading results, auditors) gets the same data
// without the keys. A route that returns questions marks itself with @ShowsAnswerKeys(); PermissionsGuard then works out,
// once, whether this person writes tests, and @SeesAnswerKeys() reads it (false unless the guard said yes).

/** The keys of the people who write tests or questions. */
export const ANSWER_KEY_WRITERS = ['exam:manage', 'question_bank:manage'] as const;

export const SHOWS_ANSWER_KEYS = 'showsAnswerKeys';
/** The route returns questions: the guard decides whether this person may see their answer keys. */
export const ShowsAnswerKeys = () => SetMetadata(SHOWS_ANSWER_KEYS, true);

/** True only when the guard found a writer's key (never while acting for someone else). */
export const SeesAnswerKeys = createParamDecorator((_d: unknown, ctx: ExecutionContext): boolean => ctx.switchToHttp().getRequest().seesAnswerKeys === true);

type Option = { isCorrect?: boolean };
type KeyedQuestion = { options?: Option[]; modelAnswer?: string | null; codeTestsJson?: string | null; codeTests?: unknown };

/** One question without its answer key: options lose isCorrect; no model answer; no code test cases. */
export function withoutAnswerKey<Q extends KeyedQuestion>(q: Q): Q {
  const out = { ...q, ...(q.options ? { options: q.options.map(({ isCorrect: _c, ...o }) => o) } : {}) } as Q;
  if ('modelAnswer' in out) out.modelAnswer = null;
  if ('codeTestsJson' in out) out.codeTestsJson = null;
  if ('codeTests' in out) out.codeTests = null;
  return out;
}

/** A test with its sections' questions, without any answer key. */
export function examWithoutAnswerKeys<E extends { sections: { questions: { question: KeyedQuestion }[] }[] }>(exam: E): E {
  return { ...exam, sections: exam.sections.map((s) => ({ ...s, questions: s.questions.map((l) => ({ ...l, question: withoutAnswerKey(l.question) })) })) };
}

/** A candidate report without the answer key: each question keeps the choice and whether it was right, not the correct options. */
export function withoutCorrectOptions<D extends { sections: { questions: { correctOptionIds: string[] }[] }[] }>(d: D): D {
  return { ...d, sections: d.sections.map((s) => ({ ...s, questions: s.questions.map((q) => ({ ...q, correctOptionIds: [] })) })) };
}
