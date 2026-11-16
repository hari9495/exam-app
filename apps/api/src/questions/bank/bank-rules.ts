/**
 * Assessments AS-1 (answers 2009, 2010): the pure rules of the question bank's review, kept apart so they are tested
 * without a database.
 */

/** A question as an author proposes it (the existing question payload, plus alt text). */
export interface QuestionContent {
  type: string;
  text: string;
  topic?: string | null;
  category?: string | null;
  difficulty: string;
  marks: number;
  negativeMarks?: number;
  partialCredit?: boolean;
  tags?: string[];
  languageMode?: string;
  allowedLanguages?: string[];
  starterCode?: string | null;
  allowStdin?: boolean;
  modelAnswer?: string | null;
  snippetCode?: string | null;
  snippetLanguage?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  options: { text: string; isCorrect: boolean; imageUrl?: string | null }[];
  optionAlts?: (string | null)[];
  codeTests?: { stdin?: string; expectedStdout: string; weight?: number; hidden?: boolean }[];
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The defaults the question engine stores, filled in, so a field the writer left out (negative marks, no collection, no
 * alt text) never counts as a change against the stored question.
 */
export function normalized(c: QuestionContent): QuestionContent {
  const alts = (c.optionAlts ?? []).map((a) => (a ?? '').trim() || null);
  while (alts.length && alts[alts.length - 1] === null) alts.pop();
  return { ...c, negativeMarks: c.negativeMarks ?? 0, partialCredit: c.partialCredit ?? false, topic: c.topic?.trim() || null, category: c.category?.trim() || null, tags: c.tags ?? [], imageUrl: c.imageUrl || null, imageAlt: c.imageAlt?.trim() || null, optionAlts: alts };
}

/**
 * A big change (answer 2010): the question text, the type, the options (their text, which are correct, how many, their
 * order) or the answer key (model answer, code tests). It makes a new version; anything else (marks, difficulty, topic,
 * collection, tags, alt text) is a small change that keeps the number. Both are reviewed (answer 2009).
 */
export function isMajorChange(before: QuestionContent, after: QuestionContent): boolean {
  if (before.type !== after.type || norm(before.text) !== norm(after.text)) return true;
  if (before.options.length !== after.options.length) return true;
  if (before.options.some((o, i) => norm(o.text) !== norm(after.options[i]!.text) || o.isCorrect !== after.options[i]!.isCorrect)) return true;
  if (norm(before.modelAnswer) !== norm(after.modelAnswer)) return true;
  return JSON.stringify(before.codeTests ?? []) !== JSON.stringify(after.codeTests ?? []);
}

/** The fields that differ, in the order the review shows them. */
export function changedFields(before: QuestionContent, after: QuestionContent): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (before.type !== after.type) out.push('type');
  if (norm(before.text) !== norm(after.text)) out.push('text');
  if (!same(before.options.map((o) => [norm(o.text), o.isCorrect]), after.options.map((o) => [norm(o.text), o.isCorrect]))) out.push('options');
  if (norm(before.modelAnswer) !== norm(after.modelAnswer)) out.push('modelAnswer');
  if (!same(before.codeTests, after.codeTests)) out.push('codeTests');
  for (const k of ['marks', 'negativeMarks', 'difficulty', 'topic', 'category', 'imageUrl', 'imageAlt'] as const) if (!same(before[k], after[k])) out.push(k);
  if (!same([...(before.tags ?? [])].sort(), [...(after.tags ?? [])].sort())) out.push('tags');
  if (!same(before.optionAlts ?? [], after.optionAlts ?? [])) out.push('optionAlts');
  return out;
}

/** What still stops approval for accessibility: every image needs alt text (the question's and each option's). */
export function missingAltText(c: QuestionContent): string[] {
  const out: string[] = [];
  if (c.imageUrl && !norm(c.imageAlt)) out.push('the question image');
  c.options.forEach((o, i) => {
    if (o.imageUrl && !norm(c.optionAlts?.[i])) out.push(`option ${String.fromCharCode(65 + i)}'s image`);
  });
  return out;
}

/** Letter trigrams of a question's words (case, punctuation and spacing do not count). */
function trigrams(text: string): Set<string> {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** How alike two questions' text are, 0 to 100 (Jaccard of letter trigrams; the same text is 100). */
export function similarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both++;
  return Math.round((100 * both) / (x.size + y.size - both));
}

/** The most alike other question, when it reaches the company's duplicate threshold. */
export function closestDuplicate(text: string, others: { id: string; text: string }[], threshold: number): { id: string; percent: number } | null {
  let best: { id: string; percent: number } | null = null;
  for (const o of others) {
    const p = similarity(text, o.text);
    if (p >= threshold && (!best || p > best.percent)) best = { id: o.id, percent: p };
  }
  return best;
}
