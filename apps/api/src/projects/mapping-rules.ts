// Projects P-3 (PRJ-08, founder answers 1409, 1410): company rules that turn a work-tool item into a suggested
// timesheet line. Pure, so it is unit-tested. A pattern is plain text where `*` is any text; capitals are ignored.

export const RULE_SOURCES = ['calendar', 'issues', 'code'] as const;
export type RuleSource = (typeof RULE_SOURCES)[number];

export interface MappingRuleRef {
  id: string;
  source: string;
  pattern: string;
  projectId: string;
  taskId: string | null;
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

/** At most this many `*` in a pattern (keeps matching cheap). */
export const MAX_STARS = 5;

export function patternRegex(pattern: string): RegExp {
  const parts = pattern.trim().split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('.*')}$`, 'i');
}

/** Enabled rules in the order they are tried: priority (lower first), then the older rule. */
export function inOrder<T extends MappingRuleRef>(rules: readonly T[]): T[] {
  return rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * The first rule (in order) for the item's tool whose pattern matches any of the item's texts and whose project the
 * caller allows (active, and the person allocated on the day when the company says so). A rule that would map to a
 * project not allowed is skipped, so the next one can match. None: null (the person chooses a project).
 */
export function ruleFor<T extends MappingRuleRef>(ordered: readonly T[], source: string, texts: readonly (string | null | undefined)[], allowed: (projectId: string) => boolean): T | null {
  const t = texts.map((x) => x?.trim()).filter((x): x is string => Boolean(x));
  if (!t.length) return null;
  return ordered.find((r) => r.source === source && allowed(r.projectId) && t.some((x) => patternRegex(r.pattern).test(x))) ?? null;
}
