import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { Viewer, buildViewer, has, tenantWide, type ScopeUser } from '../access/scope';

// Batch 5a access (M03-BUILD-DESIGN §6.2, §12.1). Every payroll route declares its key (YX-SEC-01); here the key's
// scope becomes the legal entities it reaches, and the database pay guard is told which entities this transaction may
// read (app.pay_entities, §5.1). YukthiX staff, impersonation and support sessions never get pay (P02 YX-SEC-20, Q8).

// Founder decision D4 (9 Oct 2026): the pay guard covers the batch-5a tables (pay documents, exchange files) and, from
// batch 5b, the compensation tables; the step-4 payroll feed (paid / LOP days) stays attendance data (no pay guard).
export const PAY_KEYS = [
  'payroll.period.view',
  'payroll.period.reopen',
  'payroll.period.reopen.approve',
  'payroll.correction.approve',
  'payroll.document.view',
  'payroll.document.issue',
  'payroll.file.view',
  'payroll.file.release',
  'audit.view',
  'audit.export',
  'audit.hold.manage',
  'attendance.lock',
  'employee.salary.view',
  'employee.salary.manage',
  'employee.identity.view',
  // Batch 5b.
  'payroll.setup.manage',
  'payroll.statutory.setup',
  'payroll.component.manage',
  'payroll.template.manage',
  'payroll.import.run',
  // Batch 5c.
  'payroll.run.view',
  'payroll.run.prepare',
  'payroll.run.approve',
  'payroll.input.manage',
  'payroll.hold.manage',
  'payroll.loan.manage',
  'payroll.loan.approve',
  'payroll.journal.export',
  'payroll.cost_rate.view',
] as const;
export type PayKey = (typeof PAY_KEYS)[number];

export function payViewer(prisma: PrismaService, tenantPrisma: TenantPrismaService, user: ScopeUser): Promise<Viewer> {
  return buildViewer(prisma, tenantPrisma, user, [...PAY_KEYS]);
}

/** Pay is never shown or changed while acting for someone else (impersonation, YukthiX staff in a company). */
export function requireSelf(v: Viewer) {
  if (v.actingForOther || !v.userId) throw new ForbiddenException('Pay is not available while acting for someone else.');
}

/** The legal entities `key` reaches: all of the company's for a company-wide grant, else the granted entities. */
export async function entitiesFor(tx: Tx, c: CompanyContext, v: Viewer, key: PayKey): Promise<string[]> {
  if (!has(v, key) || v.actingForOther) return [];
  const all = await tx.legalEntity.findMany({ where: { organizationId: c.organizationId }, select: { id: true } });
  if (tenantWide(v, key)) return all.map((e) => e.id);
  const granted = new Set((v.scopes.get(key) ?? []).filter((s) => s.type === 'legal_entity' && s.id).map((s) => s.id as string));
  return all.map((e) => e.id).filter((id) => granted.has(id));
}

/** Refuses (as "not found", never revealing the entity) unless `key` reaches the entity. */
export async function requireEntity(tx: Tx, c: CompanyContext, v: Viewer, key: PayKey, entityId: string) {
  if (!(await entitiesFor(tx, c, v, key)).includes(entityId)) throw new NotFoundException('Not found');
}

/** Tells the database pay guard which legal entities this transaction may read and write (transaction-local). */
export async function payScope(tx: Tx, entityIds: readonly string[]) {
  await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${entityIds.join(',')}}`}, true)`;
}

/** Runs `fn` with the pay guard opened to `entityIds` for a server-side check, then puts the previous scope back. */
export async function withPayScope<T>(tx: Tx, entityIds: readonly string[], fn: () => Promise<T>): Promise<T> {
  const [{ prev }] = await tx.$queryRaw<{ prev: string | null }[]>`SELECT current_setting('app.pay_entities', true) AS prev`;
  await payScope(tx, entityIds);
  try {
    return await fn();
  } finally {
    await tx.$executeRaw`SELECT set_config('app.pay_entities', ${prev || '{}'}, true)`;
  }
}

/**
 * Active users who hold `key` over a legal entity today: through their own role profile (company-wide), or a role grant
 * company-wide or on that entity. Used to route payroll approvals (P03) to the right people.
 */
export async function payHolders(tx: Tx, org: string, key: PayKey, entityId: string, today: string): Promise<string[]> {
  const like = `%"${key}"%`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id::text FROM users u JOIN permission_profiles p ON p.organization_id = u.organization_id AND p.id = u.permission_profile_id
    WHERE u.organization_id = ${org}::uuid AND u.status = 'active' AND p.permissions_json LIKE ${like}
    UNION
    SELECT g.user_id::text FROM role_grants g
    JOIN permission_profiles p ON p.organization_id = g.organization_id AND p.id = g.permission_profile_id
    JOIN users u ON u.organization_id = g.organization_id AND u.id = g.user_id AND u.status = 'active'
    WHERE g.organization_id = ${org}::uuid AND g.status = 'active' AND p.permissions_json LIKE ${like}
      AND g.valid_from <= ${today}::date AND (g.valid_to IS NULL OR g.valid_to >= ${today}::date)
      AND (g.scope_type = 'tenant' OR (g.scope_type = 'legal_entity' AND g.legal_entity_id = ${entityId}::uuid))
    LIMIT 25`;
  return rows.map((r) => r.id);
}

/** The company's active System Admins (P08 Q3: the owner's approval of a reopen). */
export async function systemAdmins(tx: Tx, org: string): Promise<string[]> {
  return (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id);
}

export const entityName = async (tx: Tx, org: string, id: string) => (await tx.legalEntity.findFirst({ where: { organizationId: org, id }, select: { name: true, shortName: true } })) ?? { name: 'Unknown', shortName: '' };

export const sqlIds = (ids: readonly string[]) => Prisma.sql`${[...ids]}::uuid[]`;
