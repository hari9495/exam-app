// T2-D 56 (answer 2865): a task's stage on the project board. A fixed list per company: To do, In progress, Done, plus
// up to 3 of the company's own (Settings › Projects, one text setting, names separated by commas), shown between In
// progress and Done. A Done task takes no new hours.

export const EXTRA_STAGES_KEY = 'projects.task.extra_stages';
export const FIXED_STAGES = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
] as const;

/** The company's own stage names from the setting (trimmed, no empties); throws on more than 3, a long or a repeated name. */
export function parseExtraStages(value: string): string[] {
  const names = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length > 3) throw new RangeError('At most 3 stages of your own.');
  const seen = new Set<string>(FIXED_STAGES.map((s) => s.label.toLowerCase()));
  for (const n of names) {
    if (n.length > 20) throw new RangeError(`"${n}" is longer than 20 characters.`);
    if (seen.has(n.toLowerCase())) throw new RangeError(`"${n}" is already a stage.`);
    seen.add(n.toLowerCase());
  }
  return names;
}

/** The board's columns in order: To do, In progress, the company's own, Done. A custom stage's id is its name. */
export function taskStages(extra: string): { id: string; label: string }[] {
  let own: string[] = [];
  try {
    own = parseExtraStages(extra);
  } catch {
    own = [];
  }
  return [FIXED_STAGES[0], FIXED_STAGES[1], ...own.map((n) => ({ id: n, label: n })), FIXED_STAGES[2]];
}

/** A task's stage as shown: one the company no longer has falls back to To do (its hours stay). */
export const stageOf = (stage: string, stages: { id: string }[]) => (stages.some((s) => s.id === stage) ? stage : 'todo');

/**
 * Answer 2865: a Done task takes no new hours. The days (Monday to Sunday) where the week's hours on a Done task are more
 * than before; empty when nothing grew.
 */
export function doneTaskGrowth(before: number[], after: number[]): number[] {
  return after.flatMap((m, k) => (m > (before[k] ?? 0) ? [k] : []));
}
