export const STAGE_CATEGORIES = ['active', 'offer', 'hired', 'rejected', 'archived'] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

const TERMINAL: ReadonlySet<StageCategory> = new Set(['hired', 'rejected', 'archived']);

export function isTerminalCategory(c: StageCategory): boolean {
  return TERMINAL.has(c);
}
