import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { todayIst } from '../org-structure/org-validation';

type Tx = Prisma.TransactionClient;

// T2-G 42 (answer 2745): a group worked out from rules. Each rule is a list (any of them); a person is in the group when
// today's job matches every rule that has a list (a department includes its sub-departments). Only people with an active
// login can be members: the group is used to send things and to approve.

export const RULE_KINDS = ['legalEntityIds', 'locationIds', 'departmentIds', 'gradeIds', 'employmentTypeIds', 'tagIds'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export type GroupRules = Record<RuleKind, string[]>;

const TABLE: Record<RuleKind, { model: 'legalEntity' | 'location' | 'department' | 'grade' | 'employmentType' | 'personTag'; words: string }> = {
  legalEntityIds: { model: 'legalEntity', words: 'legal entities' },
  locationIds: { model: 'location', words: 'locations' },
  departmentIds: { model: 'department', words: 'departments' },
  gradeIds: { model: 'grade', words: 'grades' },
  employmentTypeIds: { model: 'employmentType', words: 'employment types' },
  // T2-G 2903: the person's tags (any of them).
  tagIds: { model: 'personTag', words: 'tags' },
};

/** Saved rules with every kind present (rules saved before a kind existed read it as empty). */
export const withAllKinds = (saved: unknown): GroupRules => Object.fromEntries(RULE_KINDS.map((k) => [k, ((saved ?? {}) as Partial<GroupRules>)[k] ?? []])) as GroupRules;

/** The rules as saved: every kind present, ids once each. At least one rule. */
export function normaliseRules(input: Partial<Record<RuleKind, string[]>>): GroupRules {
  const rules = Object.fromEntries(RULE_KINDS.map((k) => [k, [...new Set(input[k] ?? [])]])) as GroupRules;
  if (RULE_KINDS.every((k) => rules[k].length === 0)) throw new BadRequestException('Add at least one rule: a legal entity, location, department, grade, employment type or tag.');
  return rules;
}

/** Each id must be the company's own record (a 400 names what is wrong; another company's id is never found). */
export async function assertOwnRecords(tx: Tx, org: string, rules: GroupRules): Promise<void> {
  for (const k of RULE_KINDS) {
    const ids = rules[k];
    if (!ids.length) continue;
    const found = await (tx[TABLE[k].model] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { organizationId: org, id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException(`Choose the company's own ${TABLE[k].words}.`);
  }
}

/** The active users whose job today matches every rule. */
export async function matchingUsers(tx: Tx, org: string, rules: GroupRules, today = todayIst()): Promise<string[]> {
  const rows = await tx.$queryRaw<{ user_id: string }[]>`
    SELECT DISTINCT e.user_id::text
    FROM employee_assignments ea
    JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
    JOIN employments em ON em.organization_id = ea.organization_id AND em.id = ea.employment_id
    JOIN users u ON u.id = e.user_id AND u.status = 'active'
    LEFT JOIN departments dpt ON dpt.organization_id = ea.organization_id AND dpt.id = ea.department_id
    WHERE ea.organization_id = ${org}::uuid AND ea.superseded_at IS NULL AND e.user_id IS NOT NULL
      AND ea.valid_from <= ${today}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${today}::date)
      AND em.joined_on <= ${today}::date AND (em.exited_on IS NULL OR em.exited_on >= ${today}::date)
      AND (cardinality(${rules.legalEntityIds}::uuid[]) = 0 OR ea.legal_entity_id = ANY(${rules.legalEntityIds}::uuid[]))
      AND (cardinality(${rules.locationIds}::uuid[]) = 0 OR ea.location_id = ANY(${rules.locationIds}::uuid[]))
      AND (cardinality(${rules.departmentIds}::uuid[]) = 0 OR EXISTS (SELECT 1 FROM unnest(${rules.departmentIds}::uuid[]) x WHERE dpt.path LIKE '%/' || x::text || '/%'))
      AND (cardinality(${rules.gradeIds}::uuid[]) = 0 OR ea.grade_id = ANY(${rules.gradeIds}::uuid[]))
      AND (cardinality(${rules.employmentTypeIds}::uuid[]) = 0 OR ea.employment_type_id = ANY(${rules.employmentTypeIds}::uuid[]))
      AND (cardinality(${rules.tagIds}::uuid[]) = 0 OR EXISTS (SELECT 1 FROM employee_tags et WHERE et.organization_id = e.organization_id AND et.employee_id = e.id AND et.tag_id = ANY(${rules.tagIds}::uuid[])))`;
  return rows.map((r) => r.user_id);
}

/** Brings a rule group's members to today's matches; returns who joined and who left. */
export async function refreshRuleGroup(tx: Tx, org: string, group: { id: string; rules: unknown }, today = todayIst()): Promise<{ added: string[]; removed: string[] }> {
  const rules = normaliseRules((group.rules ?? {}) as Partial<GroupRules>);
  const want = new Set(await matchingUsers(tx, org, rules, today));
  const now = new Set((await tx.userGroupMember.findMany({ where: { organizationId: org, groupId: group.id }, select: { userId: true } })).map((m) => m.userId));
  const added = [...want].filter((u) => !now.has(u));
  const removed = [...now].filter((u) => !want.has(u));
  if (removed.length) await tx.userGroupMember.deleteMany({ where: { organizationId: org, groupId: group.id, userId: { in: removed } } });
  if (added.length) await tx.userGroupMember.createMany({ data: added.map((userId) => ({ organizationId: org, groupId: group.id, userId })), skipDuplicates: true });
  await tx.userGroup.update({ where: { id: group.id }, data: { membersRefreshedAt: new Date() } });
  return { added, removed };
}

/** Group ids for an audience: the company's own groups, once each (400 otherwise). */
export async function ownGroupIds(tx: Tx, org: string, ids: readonly string[] | undefined): Promise<string[]> {
  const list = [...new Set(ids ?? [])];
  if (list.length && (await tx.userGroup.count({ where: { organizationId: org, id: { in: list } } })) !== list.length) throw new BadRequestException("Choose the company's own groups.");
  return list;
}
