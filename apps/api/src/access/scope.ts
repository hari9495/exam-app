import { Prisma } from '@prisma/client';
import { GrantScope, PrismaService, TenantPrismaService, resolveScopedGrants } from '@exam-platform/shared';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';

// P02 §4.3 record scope engine. Every people read and write asks here which records a key reaches:
//   explicit role grants   the key's scopes (tenant, legal entity, location, department subtree, own reports;
//                          YX-SEC-03), resolved exactly as the permissions guard resolves them;
//   implicit grants        Employee @ self, Manager @ team, dotted-line manager and Department head (YX-SEC-04),
//                          computed from the assignments in force, never stored.
// One SQL definition, yx_scope_periods(), turns a scope into the dated periods an employee falls inside it, so
// single records are time-aware (YX-SEC-06: only the periods in scope) and lists filter "in scope on date D".

export interface ScopeUser {
  userId?: string;
  role: string;
  organizationId?: string | null;
  permissionProfileId?: string | null;
  actingSuperAdmin?: boolean;
  impersonatorUserId?: string;
}

/** Who is asking: their keys with scopes and whether it is really them. */
export interface Viewer {
  userId: string | null;
  /** Keys held at any scope (what the endpoint guard checked). */
  grants: ReadonlySet<string>;
  scopes: ReadonlyMap<string, readonly GrantScope[]>;
  /** Impersonation or YukthiX staff in a company: no pay, no Confidential reads, no writes (P02 YX-SEC-20). */
  actingForOther: boolean;
}

/** [from, to | null] inclusive; from '0001-01-01' when open-ended. */
export type Period = [string, string | null];

export async function buildViewer(prisma: PrismaService, tenantPrisma: TenantPrismaService, user: ScopeUser, keys: readonly string[]): Promise<Viewer> {
  const scopes = await resolveScopedGrants(prisma, tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId, userId: user.userId ?? null }, [...keys]);
  return { userId: user.userId ?? null, grants: new Set(scopes.keys()), scopes, actingForOther: Boolean(user.impersonatorUserId || user.actingSuperAdmin) };
}

export const has = (v: Viewer, key: string) => v.grants.has(key);
export const tenantWide = (v: Viewer, key: string) => (v.scopes.get(key) ?? []).some((s) => s.type === 'tenant');

const none = Prisma.sql`'{}'::datemultirange`;

function scopeSql(c: CompanyContext, s: { type: string; id: string | null }, emp: Prisma.Sql, own: string | null): Prisma.Sql {
  return Prisma.sql`yx_scope_periods(${c.organizationId}::uuid, ${emp}, ${s.type}, ${s.id}::uuid, ${own}::uuid)`;
}

/** The union of a key's explicit scopes as a datemultirange expression. Report scopes need the viewer's record. */
function grantMultirange(c: CompanyContext, v: Viewer, key: string, emp: Prisma.Sql, own: string | null): Prisma.Sql {
  const scopes = (v.scopes.get(key) ?? []).filter((s) => own || (s.type !== 'all_reports' && s.type !== 'direct_reports'));
  return scopes.length ? Prisma.join(scopes.map((s) => scopeSql(c, s, emp, own)), ' + ') : none;
}

/**
 * SQL condition: employee `emp` is covered by `key` on `date` (YX-SEC-05: lists, counts and searches only
 * include records in scope). Company-wide holders short-circuit to TRUE; no grant is FALSE.
 */
export function inScopeSql(c: CompanyContext, v: Viewer, key: string, emp: Prisma.Sql, date: Prisma.Sql, own: string | null): Prisma.Sql {
  if (tenantWide(v, key)) return Prisma.sql`TRUE`;
  if (!(v.scopes.get(key) ?? []).length) return Prisma.sql`FALSE`;
  return Prisma.sql`((${grantMultirange(c, v, key, emp, own)}) @> ${date})`;
}

async function periodsOf(tx: Tx, range: Prisma.Sql): Promise<Period[]> {
  const rows = await tx.$queryRaw<{ from: string | null; to: string | null }[]>`
    SELECT lower(r)::text AS "from", (upper(r) - 1)::text AS "to" FROM unnest((${range})::datemultirange) AS r ORDER BY 1 NULLS FIRST`;
  return rows.map((r) => [r.from ?? '0001-01-01', r.to]);
}

/** The periods in which `employeeId` is inside `key`'s explicit grants. */
export async function grantPeriods(tx: Tx, c: CompanyContext, v: Viewer, key: string, employeeId: string, own: string | null): Promise<Period[]> {
  if (tenantWide(v, key)) return [['0001-01-01', null]];
  if (!(v.scopes.get(key) ?? []).length) return [];
  return periodsOf(tx, grantMultirange(c, v, key, Prisma.sql`${employeeId}::uuid`, own));
}

/**
 * The implicit view (YX-SEC-04): a manager over their team for the periods they managed (P02 Q2: the whole
 * subtree unless the company chose direct reports only), a dotted-line manager (M01 Q5, view only) and a
 * department head over their department subtree. Never pay (Q3) and never Personal or Confidential data.
 */
export async function implicitPeriods(tx: Tx, c: CompanyContext, own: string | null, employeeId: string): Promise<Period[]> {
  if (!own || own === employeeId) return [];
  return periodsOf(tx, await implicitMultirange(tx, c, own, Prisma.sql`${employeeId}::uuid`));
}

/** SQL condition for the implicit view of `emp` on `date` (team, dotted line, department head). */
export async function implicitSql(tx: Tx, c: CompanyContext, own: string | null, emp: Prisma.Sql, date: Prisma.Sql): Promise<Prisma.Sql> {
  if (!own) return Prisma.sql`FALSE`;
  return Prisma.sql`((${await implicitMultirange(tx, c, own, emp)}) @> ${date})`;
}

async function implicitMultirange(tx: Tx, c: CompanyContext, own: string, emp: Prisma.Sql): Promise<Prisma.Sql> {
  const team = (await managerViewScope(tx, c)) === 'direct_reports' ? 'direct_reports' : 'all_reports';
  const heads = await tx.department.findMany({ where: { organizationId: c.organizationId, headEmployeeId: own }, select: { id: true, headSince: true } });
  const parts = [team, 'dotted_line'].map((type) => scopeSql(c, { type, id: null }, emp, own));
  // YX-SEC-04/06: a department head sees the subtree only from the day they became head, never its earlier history.
  for (const d of heads) parts.push(Prisma.sql`(${scopeSql(c, { type: 'department_subtree', id: d.id }, emp, own)} * datemultirange(daterange(${d.headSince}::date, NULL)))`);
  return Prisma.join(parts, ' + ');
}

/**
 * The periods each of `ids` falls inside any of `keys`' explicit grants, in one query (lists of changes decide
 * pay and later-dated impact rows per change date, P02 §4.3 / R1). Company-wide holders: every date.
 */
export async function grantPeriodsFor(tx: Tx, c: CompanyContext, v: Viewer, keys: readonly string[], ids: readonly string[], own: string | null): Promise<Map<string, Period[]>> {
  const out = new Map<string, Period[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  if (keys.some((k) => tenantWide(v, k))) return new Map(ids.map((id) => [id, [['0001-01-01', null]] as Period[]]));
  const held = keys.filter((k) => (v.scopes.get(k) ?? []).length);
  if (!held.length) return out;
  const range = Prisma.join(held.map((k) => grantMultirange(c, v, k, Prisma.sql`x.id`, own)), ' + ');
  const rows = await tx.$queryRaw<{ id: string; from: string | null; to: string | null }[]>`
    SELECT x.id::text AS id, lower(r)::text AS "from", (upper(r) - 1)::text AS "to"
    FROM unnest(${[...ids]}::uuid[]) AS x(id), unnest((${range})::datemultirange) AS r ORDER BY 1, 2 NULLS FIRST`;
  for (const r of rows) out.get(r.id)!.push([r.from ?? '0001-01-01', r.to]);
  return out;
}

/** P02 Q2: what a manager may view, a company setting (starter: the whole reporting subtree). */
export function managerViewScope(tx: Tx, c: CompanyContext): Promise<string> {
  return settingFor(tx, c, 'access.manager.view_scope', { legalEntityId: '' });
}

/**
 * Read access starts when the relation does (P02 YX-SEC-06): a period that begins after `today` (an approved
 * future transfer into a scope, a future manager) opens nothing yet; a period already running keeps its end.
 */
export const started = (periods: readonly Period[], today: string): Period[] => periods.filter(([f]) => f <= today);

export const covers = (periods: readonly Period[], date: string) => periods.some(([f, t]) => f <= date && (t === null || date <= t));
export const overlaps = (periods: readonly Period[], from: string, to: string | null) => periods.some(([f, t]) => (t === null || from <= t) && (to === null || f <= to));
/** Does the union of `periods` cover every day of [from, to]? `to` null: every day from `from` on. */
export function coversRange(periods: readonly Period[], from: string, to: string | null): boolean {
  let cursor = from;
  for (const [f, t] of [...periods].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (f > cursor) return false;
    if (t === null || (to !== null && t >= to)) return true;
    if (t >= cursor) cursor = new Date(Date.parse(`${t}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return false;
}
