// Auto-graded coding questions: a code question may carry test cases (stdin → expected stdout).
// At settlement the candidate's program is run against each; the score is the passed weight as a
// fraction of total weight, times the question's marks. All pure + deterministic (the actual code
// execution happens in the exam-runtime autograder; this only shapes, validates, and scores).

export interface CodeTestCase {
  stdin: string;
  expectedStdout: string;
  weight: number; // relative weight (>=1); a single test at any weight == all-or-nothing
  hidden: boolean; // reserved: all tests are grading-only today; visible sample tests are a follow-up
}

export const MAX_CODE_TESTS = 30;

// Output comparison: trim trailing whitespace on each line and trim the whole thing, so a trailing
// newline or stray spaces don't fail an otherwise-correct answer. Deliberately NOT
// whitespace-insensitive within a line (spacing can be semantically meaningful in output).
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\s+$/, '');
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

// Lenient parse (reads): drop malformed entries, never throw. Returns [] for null/garbage.
export function parseCodeTests(json: string | null | undefined): CodeTestCase[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CodeTestCase[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.expectedStdout !== 'string') continue;
    out.push({
      stdin: typeof t.stdin === 'string' ? t.stdin : '',
      expectedStdout: t.expectedStdout,
      weight: typeof t.weight === 'number' && t.weight >= 1 ? Math.floor(t.weight) : 1,
      hidden: t.hidden !== false,
    });
  }
  return out.slice(0, MAX_CODE_TESTS);
}

// Strict validate (writes): throws on a bad shape. Returns the normalized array.
export function validateCodeTests(input: unknown): CodeTestCase[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('codeTests must be an array');
  if (input.length > MAX_CODE_TESTS) throw new Error(`at most ${MAX_CODE_TESTS} test cases are allowed`);
  return input.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(`test case ${i + 1} must be an object`);
    const t = raw as Record<string, unknown>;
    if (typeof t.expectedStdout !== 'string' || t.expectedStdout.length === 0) {
      throw new Error(`test case ${i + 1} needs an expected output`);
    }
    if (t.stdin !== undefined && typeof t.stdin !== 'string') throw new Error(`test case ${i + 1} stdin must be a string`);
    const weight = t.weight === undefined ? 1 : Number(t.weight);
    if (!Number.isInteger(weight) || weight < 1) throw new Error(`test case ${i + 1} weight must be a positive integer`);
    return { stdin: (t.stdin as string) ?? '', expectedStdout: t.expectedStdout, weight, hidden: t.hidden !== false };
  });
}

export interface CodeTestOutcome {
  weight: number;
  passed: boolean;
}

export interface CodeScore {
  marksAwarded: number;
  passed: number;
  total: number;
  allPassed: boolean;
}

// marks × (passed weight / total weight), rounded to an integer (marksAwarded is an Int column).
export function scoreCodeTests(outcomes: CodeTestOutcome[], marks: number): CodeScore {
  const total = outcomes.length;
  const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
  const passed = outcomes.filter((o) => o.passed).length;
  const passedWeight = outcomes.filter((o) => o.passed).reduce((sum, o) => sum + o.weight, 0);
  const marksAwarded = totalWeight === 0 ? 0 : Math.round((marks * passedWeight) / totalWeight);
  return { marksAwarded, passed, total, allPassed: total > 0 && passed === total };
}
