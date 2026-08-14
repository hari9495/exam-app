export interface KeyOption {
  text: string;
  isCorrect: boolean;
}

export interface FullOption {
  text: string;
  isCorrect: boolean;
  orderIndex: number;
  imageUrl: string | null;
}

// Normalised so cosmetic edits don't read as a key change: trailing whitespace, a doubled
// space, or a capitalisation tweak to a correct option would otherwise discard the question's
// entire response history. Case-insensitive on purpose -- two options differing only by case
// are the same answer to a candidate.
function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function correctSet(options: readonly KeyOption[]): Set<string> {
  return new Set(options.filter((o) => o.isCorrect).map((o) => normalise(o.text)));
}

// True when an edit changes WHICH answers are correct.
//
// Compared by text rather than id because `update()` deletes and recreates every option, so
// ids carry no identity across an edit. Compared as a SET because reordering options is not a
// key change -- the same answer is still correct.
//
// The asymmetry of the two error modes drives the design. A false negative leaves a stale flag
// on one question, which the recruiter sees and can act on again. A false positive silently
// discards every response that question ever collected, with nothing on screen saying so. So
// this returns false whenever the correct answers are recognisably the same.
export function answerKeyDiffers(previous: readonly KeyOption[], next: readonly KeyOption[]): boolean {
  const before = correctSet(previous);
  const after = correctSet(next);

  // A question with no correct option recorded either way tells us nothing -- treat it as
  // unchanged rather than stamping a key change on every save of a code question, which has
  // no correct options at all.
  if (before.size === 0 && after.size === 0) return false;

  if (before.size !== after.size) return true;
  for (const text of before) {
    if (!after.has(text)) return true;
  }
  return false;
}

// True when the option rows need rewriting at all.
//
// `update()` used to delete and recreate every option unconditionally, which minted fresh ids
// on every save -- including a save that changed only the question text. Historical answers
// store the chosen option's id, so each such edit orphaned every prior response's selection
// and silently under-counted the distractor breakdown. Skipping the rewrite when nothing
// changed keeps those ids stable, so a question's distractor history survives unrelated edits.
//
// Order-SENSITIVE, unlike the key comparison: orderIndex is positional, so a reorder genuinely
// is a different set of rows to write. Compared field by field rather than as a whole object so
// a future column added to QuestionOption fails the type-check here instead of being silently
// ignored by a JSON.stringify.
export function optionRowsDiffer(previous: readonly FullOption[], next: readonly FullOption[]): boolean {
  if (previous.length !== next.length) return true;
  return previous.some((before, index) => {
    const after = next[index];
    return (
      before.text !== after.text ||
      before.isCorrect !== after.isCorrect ||
      before.orderIndex !== after.orderIndex ||
      (before.imageUrl ?? null) !== (after.imageUrl ?? null)
    );
  });
}
