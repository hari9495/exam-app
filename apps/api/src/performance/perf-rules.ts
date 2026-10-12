// Performance (M06-BUILD-DESIGN §5.2, §6.3, §9.1): the pure rules of set-up, checked when a scale or a template is
// saved and when a template is activated, never at run time (PF-D7). Unit-tested in perf-rules.spec.ts.

export type LevelIn = { value: number; label: string };
export type BandIn = { fromScore: number; toScore: number; label: string };
export type SectionIn = { kind: 'goals' | 'competencies' | 'values' | 'questions' | 'overall'; title: string; weight: number; rated: boolean; whoAnswers: string[]; questions: { text: string; answer: 'rating' | 'text' | 'both' }[] };

const cents = (x: number) => Math.round(x * 100);

/** A scale: levels on its step and inside its range, every whole point labelled, no two levels on one value. */
export function scaleProblem(min: number, max: number, step: number, levels: readonly LevelIn[]): string | null {
  if (!(max > min)) return 'The highest rating must be above the lowest.';
  if (step !== 1 && step !== 0.5) return 'Ratings go up in whole or half points.';
  if (min % 1 || max % 1) return 'The lowest and highest ratings are whole numbers.';
  const seen = new Set<number>();
  for (const l of levels) {
    if (!l.label.trim()) return 'Every rating needs a label.';
    if (l.value < min || l.value > max) return `The rating ${l.value} is outside ${min}–${max}.`;
    if (cents(l.value) % cents(step)) return `The rating ${l.value} is not on the scale's ${step === 1 ? 'whole' : 'half'} points.`;
    if (seen.has(l.value)) return `The rating ${l.value} is listed twice.`;
    seen.add(l.value);
  }
  for (let v = min; v <= max; v++) if (!seen.has(v)) return `Add a label for the rating ${v}.`;
  return null;
}

/**
 * Bands turn a final score into a label (YX-PERF-07). Scores have two decimals, so bands must run from the lowest
 * rating to the highest with no gap and no overlap: each band starts 0.01 after the previous one ends.
 */
export function bandsProblem(min: number, max: number, bands: readonly BandIn[]): string | null {
  if (!bands.length) return 'Add at least one band.';
  const sorted = [...bands].sort((a, b) => a.fromScore - b.fromScore);
  for (const b of sorted) {
    if (!b.label.trim()) return 'Every band needs a label.';
    if (b.toScore < b.fromScore) return `The band ${b.label} ends before it starts.`;
  }
  if (cents(sorted[0].fromScore) !== cents(min)) return `The first band must start at ${min}.`;
  if (cents(sorted[sorted.length - 1].toScore) !== cents(max)) return `The last band must end at ${max}.`;
  for (let i = 1; i < sorted.length; i++) {
    const gap = cents(sorted[i].fromScore) - cents(sorted[i - 1].toScore);
    if (gap <= 0) return `The bands ${sorted[i - 1].label} and ${sorted[i].label} overlap.`;
    if (gap > 1) return `There is a gap between ${sorted[i - 1].label} and ${sorted[i].label}.`;
  }
  return null;
}

/** The band a score falls in (scores are rounded to two decimals first). */
export function bandFor<T extends BandIn>(bands: readonly T[], score: number): T | null {
  const s = cents(score);
  return bands.find((b) => s >= cents(b.fromScore) && s <= cents(b.toScore)) ?? null;
}

/**
 * A template ready to use (§9.1): weighted scoring needs rated sections whose weights add up to 100; manager-overall
 * scoring needs a rated overall section; open-question and values sections need questions; every rated section is
 * answered by someone.
 */
export function templateProblem(scoring: 'weighted' | 'manager_overall', sections: readonly SectionIn[]): string | null {
  if (!sections.length) return 'Add at least one section.';
  for (const s of sections) {
    if (!s.title.trim()) return 'Every section needs a title.';
    if (!s.whoAnswers.length) return `Say who answers ${s.title}.`;
    if ((s.kind === 'questions' || s.kind === 'values') && !s.questions.length) return `${s.title} needs at least one question.`;
    if (s.questions.some((q) => !q.text.trim())) return `A question in ${s.title} is empty.`;
    if (!s.rated && s.weight) return `${s.title} is not rated, so it has no weight.`;
  }
  const rated = sections.filter((s) => s.rated);
  if (!rated.length) return 'At least one section must be rated.';
  if (scoring === 'manager_overall') {
    if (!sections.some((s) => s.kind === 'overall' && s.rated && s.whoAnswers.includes('manager'))) return 'Manager-overall scoring needs a rated overall section the manager answers.';
    return null;
  }
  const total = rated.reduce((t, s) => t + cents(s.weight), 0);
  if (total !== 10000) return `The weights of rated sections add up to ${(total / 100).toFixed(2).replace(/\.00$/, '')}, not 100.`;
  return null;
}
