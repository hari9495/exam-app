import { answerKeyDiffers, optionRowsDiffer, KeyOption, FullOption } from './answer-key-change';

const opt = (text: string, isCorrect: boolean): KeyOption => ({ text, isCorrect });
const row = (text: string, isCorrect: boolean, orderIndex: number, imageUrl: string | null = null): FullOption => ({
  text,
  isCorrect,
  orderIndex,
  imageUrl,
});

describe('answerKeyDiffers', () => {
  const paris: KeyOption[] = [opt('Paris', true), opt('London', false), opt('Rome', false)];

  it('detects the correct answer moving to a different option', () => {
    const fixed = [opt('Paris', false), opt('London', true), opt('Rome', false)];
    expect(answerKeyDiffers(paris, fixed)).toBe(true);
  });

  it('detects a second correct answer being added', () => {
    expect(answerKeyDiffers(paris, [opt('Paris', true), opt('London', true), opt('Rome', false)])).toBe(true);
  });

  it('detects the correct answer text being replaced outright', () => {
    expect(answerKeyDiffers(paris, [opt('Berlin', true), opt('London', false), opt('Rome', false)])).toBe(true);
  });

  // Everything below must be false. A false positive silently discards the question's entire
  // response history, so these are the load-bearing half of this suite.
  it('ignores reordering, since the same answer is still correct', () => {
    expect(answerKeyDiffers(paris, [opt('Rome', false), opt('Paris', true), opt('London', false)])).toBe(false);
  });

  it('ignores a typo fix in a DISTRACTOR', () => {
    expect(answerKeyDiffers(paris, [opt('Paris', true), opt('Londonn', false), opt('Rome', false)])).toBe(false);
  });

  it('ignores whitespace and capitalisation changes to the correct answer', () => {
    expect(answerKeyDiffers(paris, [opt('  paris ', true), opt('London', false), opt('Rome', false)])).toBe(false);
  });

  it('ignores a doubled internal space', () => {
    expect(answerKeyDiffers([opt('New York', true)], [opt('New  York', true)])).toBe(false);
  });

  it('ignores an option being added without changing which answer is correct', () => {
    expect(answerKeyDiffers(paris, [...paris, opt('Madrid', false)])).toBe(false);
  });

  it('ignores an unchanged multi-answer key regardless of order', () => {
    const before = [opt('A', true), opt('B', true), opt('C', false)];
    const after = [opt('B', true), opt('C', false), opt('A', true)];
    expect(answerKeyDiffers(before, after)).toBe(false);
  });

  it('treats a question with no correct option on either side as unchanged', () => {
    // Code questions carry no correct options; without this, every save would stamp a key
    // change and wipe the question's statistics.
    expect(answerKeyDiffers([opt('starter code', false)], [opt('edited starter code', false)])).toBe(false);
  });

  it('detects a key appearing where there was none', () => {
    expect(answerKeyDiffers([opt('A', false)], [opt('A', true)])).toBe(true);
  });

  it('detects a key disappearing entirely', () => {
    expect(answerKeyDiffers([opt('A', true)], [opt('A', false)])).toBe(true);
  });

  it('treats an empty previous option set as unchanged when the new one is also keyless', () => {
    expect(answerKeyDiffers([], [])).toBe(false);
  });

  it('detects a key being set on a brand-new option set', () => {
    expect(answerKeyDiffers([], [opt('A', true)])).toBe(true);
  });
});

describe('optionRowsDiffer', () => {
  const rows = [row('Paris', true, 0), row('London', false, 1)];

  // The false case is what buys the fix: identical rows mean no delete/recreate, so option ids
  // survive the edit and historical answers still resolve to a real option.
  it('is false for an identical set, so the rewrite is skipped and ids survive', () => {
    expect(optionRowsDiffer(rows, [row('Paris', true, 0), row('London', false, 1)])).toBe(false);
  });

  it('treats undefined and null image urls as the same absence', () => {
    expect(optionRowsDiffer([row('A', true, 0, null)], [{ ...row('A', true, 0), imageUrl: null }])).toBe(false);
  });

  it.each([
    ['changed text', [row('Paris', true, 0), row('Londonn', false, 1)]],
    ['changed correctness', [row('Paris', false, 0), row('London', true, 1)]],
    ['reordered', [row('London', false, 0), row('Paris', true, 1)]],
    ['an added option', [row('Paris', true, 0), row('London', false, 1), row('Rome', false, 2)]],
    ['a removed option', [row('Paris', true, 0)]],
    ['a changed image', [row('Paris', true, 0, 'a.png'), row('London', false, 1)]],
  ])('is true for %s', (_label, next) => {
    expect(optionRowsDiffer(rows, next as FullOption[])).toBe(true);
  });
});
