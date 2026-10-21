import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, covers, implicitPeriods, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { ownOf, reachesDocument } from './person-access';
import { dueOn, dueStatus, remindNow } from './reverification-rules';

// PPL-42 re-verification cycles (founder 20 Oct 2026). HR sets dated rules per legal entity: which document type is
// re-checked, every how many months, for which departments or designations (all when none), and whether a move into
// those roles makes it due at once. Who is due is worked out from the documents engine (the last verification, or the
// joining day). Asking for a fresh copy re-opens the person's document as "requested"; the copy is uploaded and verified
// in the usual queue (PPL-27). The daily job reminds the person of an asked copy once it is due, then weekly.
// Keys: document.manage (and the type's class) for rules, the due list and asking; the person sees their own due dates,
// a manager only that a re-check is due (never the document), as the person record shows (PPL-03).

const KEYS = ['document.manage', 'document.view'] as const;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);
const said = (s: string) => asDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

interface RuleIn {
  legalEntityId?: string | null;
  typeKey: string;
  everyMonths: number;
  departmentIds?: string[];
  designationIds?: string[];
  onRoleChange?: boolean;
  validFrom: string;
}

@Injectable()
export class ReverificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  /** document.manage over the rule's entity: a company-wide rule needs the company-wide grant. */
  private managesEntity(v: Viewer, entityId: string | null) {
    if (v.actingForOther) return false;
    return (v.scopes.get('document.manage') ?? []).some((s) => s.type === 'tenant' || (entityId !== null && s.type === 'legal_entity' && s.id === entityId));
  }

  private async types(tx: Tx, org: string) {
    return tx.documentType.findMany({ where: { OR: [{ organizationId: org }, { organizationId: null }] }, select: { key: true, name: true, sensitivity: true }, orderBy: { name: 'asc' } });
  }

  // ------------------------------------------------------------------------------------------ rules

  async rules(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('document.manage')) throw new ForbiddenException('Re-verification needs document.manage.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const rows = await tx.reverificationRule.findMany({ where: { organizationId: org }, orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }] });
      const types = await this.types(tx, org);
      const entities = await tx.legalEntity.findMany({ where: { organizationId: org }, select: { id: true, name: true } });
      const departments = await tx.department.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      const designations = await tx.designation.findMany({ where: { organizationId: org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
      return {
        today,
        rules: rows.map((r) => ({
          id: r.id,
          legalEntityId: r.legalEntityId,
          legalEntity: r.legalEntityId ? (entities.find((e) => e.id === r.legalEntityId)?.name ?? null) : null,
          typeKey: r.typeKey,
          typeName: types.find((t) => t.key === r.typeKey)?.name ?? r.typeKey,
          everyMonths: r.everyMonths,
          departmentIds: r.departmentIds,
          departments: r.departmentIds.map((id) => departments.find((d) => d.id === id)?.name ?? '').filter(Boolean),
          designationIds: r.designationIds,
          designations: r.designationIds.map((id) => designations.find((d) => d.id === id)?.name ?? '').filter(Boolean),
          onRoleChange: r.onRoleChange,
          validFrom: iso(r.validFrom),
          validTo: iso(r.validTo),
          active: iso(r.validFrom)! <= today && (!r.validTo || iso(r.validTo)! >= today),
          canManage: this.managesEntity(v, r.legalEntityId),
        })),
        types: types.map((t) => ({ key: t.key, name: t.name, sensitivity: t.sensitivity })),
        entities: entities.filter((e) => this.managesEntity(v, e.id)).map((e) => ({ id: e.id, name: e.name })),
        departments,
        designations,
        canManageCompany: this.managesEntity(v, null),
      };
    });
  }

  async addRule(ctx: TenantContext, user: ScopeUser, dto: RuleIn) {
    const v = await this.viewer(user);
    const entityId = dto.legalEntityId ?? null;
    if (!this.managesEntity(v, entityId)) throw new ForbiddenException(entityId ? 'This legal entity is outside your document grant.' : 'A company-wide rule needs company-wide document.manage.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await this.types(tx, org)).some((t) => t.key === dto.typeKey)) throw new BadRequestException('Choose a document type.');
      if (entityId && !(await tx.legalEntity.findFirst({ where: { organizationId: org, id: entityId }, select: { id: true } }))) throw new NotFoundException('Legal entity not found');
      const depts = dto.departmentIds ?? [];
      const desigs = dto.designationIds ?? [];
      if (depts.length && (await tx.department.count({ where: { organizationId: org, id: { in: depts } } })) !== depts.length) throw new BadRequestException('Choose departments of this company.');
      if (desigs.length && (await tx.designation.count({ where: { organizationId: org, id: { in: desigs } } })) !== desigs.length) throw new BadRequestException('Choose designations of this company.');
      if (dto.onRoleChange && !depts.length && !desigs.length) throw new BadRequestException('"When someone moves into these roles" needs departments or designations.');
      const r = await tx.reverificationRule.create({ data: { organizationId: org, legalEntityId: entityId, typeKey: dto.typeKey, everyMonths: dto.everyMonths, departmentIds: depts, designationIds: desigs, onRoleChange: Boolean(dto.onRoleChange), validFrom: asDate(dto.validFrom), createdBy: c.userId ?? null } });
      await audit(tx, c, 'document.reverification.rule_added', 'reverification_rule', r.id, { typeKey: dto.typeKey, everyMonths: dto.everyMonths, legalEntityId: entityId });
      return { id: r.id };
    });
  }

  /** Rules are dated: ending one keeps its history (no edits of the past). */
  async endRule(ctx: TenantContext, user: ScopeUser, id: string, validTo?: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await tx.reverificationRule.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r) throw new NotFoundException('Rule not found');
      if (!this.managesEntity(v, r.legalEntityId)) throw new NotFoundException('Rule not found');
      if (r.validTo) throw new ConflictException('This rule has already ended.');
      const end = validTo ?? todayIst();
      if (end < iso(r.validFrom)!) throw new BadRequestException('A rule cannot end before it starts.');
      await tx.reverificationRule.update({ where: { id }, data: { validTo: asDate(end) } });
      await audit(tx, c, 'document.reverification.rule_ended', 'reverification_rule', id, { validTo: end });
      return { id, validTo: end };
    });
  }

  // ------------------------------------------------------------------------------------------ who is due

  /** Every person a rule in force today reaches, with their due date: the rows a viewer may manage only. */
  private async dueRows(tx: Tx, c: CompanyContext, onlyEmployee?: string) {
    const org = c.organizationId;
    const today = todayIst();
    const rules = await tx.reverificationRule.findMany({ where: { organizationId: org, validFrom: { lte: asDate(today) }, OR: [{ validTo: null }, { validTo: { gte: asDate(today) } }] } });
    if (!rules.length) return [];
    const people = await tx.$queryRaw<{ employee_id: string; person_id: string; given_name: string; family_name: string | null; preferred_name: string | null; legal_entity_id: string; department_id: string | null; designation_id: string | null; assigned_from: Date; joined_on: Date }[]>`
      SELECT DISTINCT ON (e.id) e.id::text AS employee_id, e.person_id::text, e.given_name, e.family_name, e.preferred_name, m.legal_entity_id::text,
             a.department_id::text, a.designation_id::text, a.valid_from AS assigned_from, m.joined_on
      FROM employees e
      JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date)
      JOIN employee_assignments a ON a.organization_id = e.organization_id AND a.employment_id = m.id AND a.superseded_at IS NULL
        AND ${today}::date <@ daterange(a.valid_from, a.valid_to, '[]')
      WHERE e.organization_id = ${org}::uuid ${onlyEmployee ? Prisma.sql`AND e.id = ${onlyEmployee}::uuid` : Prisma.empty}
      ORDER BY e.id, a.valid_from DESC`;
    // When someone moved into the rule's department or designation: the start of their unbroken run in it.
    const history = await tx.employeeAssignment.findMany({ where: { organizationId: org, employeeId: { in: people.map((p) => p.employee_id) }, supersededAt: null, validFrom: { lte: asDate(today) } }, select: { employeeId: true, validFrom: true, departmentId: true, designationId: true }, orderBy: { validFrom: 'desc' } });
    const docs = await tx.document.findMany({ where: { organizationId: org, personId: { in: people.map((p) => p.person_id) }, typeKey: { in: [...new Set(rules.map((r) => r.typeKey))] } } });
    const asks = await tx.reverificationAsk.findMany({ where: { organizationId: org, ruleId: { in: rules.map((r) => r.id) }, employeeId: { in: people.map((p) => p.employee_id) } }, orderBy: { askedAt: 'desc' } });
    const out = [];
    for (const r of rules) {
      for (const p of people) {
        if (r.legalEntityId && p.legal_entity_id !== r.legalEntityId) continue;
        const fits = (dept: string | null, desig: string | null) => (!r.departmentIds.length || (dept !== null && r.departmentIds.includes(dept))) && (!r.designationIds.length || (desig !== null && r.designationIds.includes(desig)));
        if (!fits(p.department_id, p.designation_id)) continue;
        let entered: string | null = null;
        for (const h of history.filter((x) => x.employeeId === p.employee_id)) {
          if (!fits(h.departmentId, h.designationId)) break;
          entered = iso(h.validFrom);
        }
        const d = docs.find((x) => x.personId === p.person_id && x.typeKey === r.typeKey) ?? null;
        // An asked copy holds the cycle until it is verified (an upload clears verified_at while it waits for the check).
        const latest = asks.find((x) => x.ruleId === r.id && x.employeeId === p.employee_id) ?? null;
        const open = latest && !(d?.status === 'verified' && d.verifiedAt && d.verifiedAt > latest.askedAt) ? latest : null;
        const lastVerified = open ? iso(open.lastVerified) : iso(d?.verifiedAt);
        const due = open ? iso(open.dueOn)! : dueOn({ lastVerified, joinedOn: iso(p.joined_on)!, everyMonths: r.everyMonths, onRoleChange: r.onRoleChange, roleEnteredOn: entered, notBefore: iso(r.validFrom)! });
        out.push({ rule: r, person: p, doc: d, lastVerified, due, ask: open, roleEntered: entered });
      }
    }
    return out;
  }

  async due(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('document.manage')) throw new ForbiddenException('Re-verification needs document.manage.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const own = await ownOf(tx, c, v);
      const types = await this.types(tx, c.organizationId);
      const rows = [];
      for (const x of await this.dueRows(tx, c)) {
        const t = types.find((y) => y.key === x.rule.typeKey);
        if (!t || x.person.employee_id === own.employeeId) continue;
        // Only people and document classes the viewer manages (document.manage + the type's class, in scope).
        if (!(await reachesDocument(tx, c, v, 'document.manage', t.sensitivity, x.person.person_id, own))) continue;
        const name = [x.person.preferred_name || x.person.given_name, x.person.family_name].filter(Boolean).join(' ');
        const docStatus = x.doc?.status ?? null;
        const asked = Boolean(x.ask);
        rows.push({
          id: `${x.rule.id}:${x.person.employee_id}`,
          ruleId: x.rule.id,
          employeeId: x.person.employee_id,
          personId: x.person.person_id,
          name,
          typeName: t.name,
          sensitivity: t.sensitivity,
          why: x.rule.onRoleChange && x.roleEntered && (!x.lastVerified || x.roleEntered > x.lastVerified) && x.due === x.roleEntered ? `Moved into the role on ${said(x.roleEntered)}` : `Every ${x.rule.everyMonths} months`,
          lastVerified: x.lastVerified,
          due: x.due,
          status: dueStatus(x.due, today),
          request: !asked ? 'not asked' : docStatus === 'uploaded' ? 'uploaded' : docStatus === 'rejected' ? 'rejected' : 'asked',
          askedAt: x.ask ? x.ask.askedAt.toISOString() : null,
          documentId: x.doc?.id ?? null,
        });
      }
      rows.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
      return { today, rows };
    });
  }

  /** Ask for a fresh copy: the person's document goes back to "requested" (its history stays) and they are told. */
  async ask(ctx: TenantContext, user: ScopeUser, dto: { ruleId: string; employeeId: string }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const row = (await this.dueRows(tx, c, dto.employeeId)).find((x) => x.rule.id === dto.ruleId);
      if (!row) throw new NotFoundException('Nothing to re-verify for this person.');
      const t = (await this.types(tx, org)).find((y) => y.key === row.rule.typeKey)!;
      const own = await ownOf(tx, c, v);
      if (own.employeeId === dto.employeeId) throw new ForbiddenException('You cannot ask yourself for a document.');
      if (!(await reachesDocument(tx, c, v, 'document.manage', t.sensitivity, row.person.person_id, own))) throw new NotFoundException('Nothing to re-verify for this person.');
      if (row.ask) throw new ConflictException('A fresh copy was already asked for this due date.');
      const doc = row.doc
        ? await tx.document.update({ where: { id: row.doc.id }, data: { status: 'requested', requestedBy: c.userId ?? null, version: { increment: 1 } } })
        : await tx.document.create({ data: { organizationId: org, personId: row.person.person_id, typeKey: t.key, status: 'requested', requestedBy: c.userId ?? null } });
      await tx.reverificationAsk.create({ data: { organizationId: org, ruleId: row.rule.id, employeeId: dto.employeeId, documentId: doc.id, dueOn: asDate(row.due), lastVerified: row.lastVerified ? asDate(row.lastVerified) : null, askedBy: c.userId ?? null } });
      await audit(tx, c, 'document.reverification.asked', 'person', row.person.person_id, { typeKey: t.key, due: row.due });
      const u = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId, userId: { not: null } }, select: { userId: true } });
      return { userId: u?.userId ?? null, typeName: t.name, due: row.due, documentId: doc.id };
    });
    if (res.userId) void this.notifications.notify(ctx, user.userId!, [res.userId], 'document.requested', { entityType: 'document', entityId: res.documentId, contextText: `Please upload a fresh copy: ${res.typeName}`, linkPath: '/yx/me/documents' }).catch(() => undefined);
    return { asked: true, due: res.due };
  }

  /** The person record's "Coming up": the person, document.manage over them, or their managers (no document name). */
  async forPerson(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const emp = await tx.employee.findFirst({ where: { organizationId: c.organizationId, id: employeeId }, select: { id: true, personId: true } });
      if (!emp) throw new NotFoundException('Not found');
      const own = await ownOf(tx, c, v);
      const self = own.employeeId === emp.id;
      const team = !self && covers(await implicitPeriods(tx, c, own.employeeId, emp.id), todayIst());
      const types = await this.types(tx, c.organizationId);
      const out = [];
      let any = self || team;
      for (const x of await this.dueRows(tx, c, emp.id)) {
        const t = types.find((y) => y.key === x.rule.typeKey);
        const hr = Boolean(t) && (await reachesDocument(tx, c, v, 'document.manage', t!.sensitivity, emp.personId, own));
        any ||= hr;
        if (!self && !team && !hr) continue;
        out.push({ due: x.due, status: dueStatus(x.due, todayIst()), ...(self || hr ? { typeName: t?.name ?? null } : {}) });
      }
      if (!any && !tenantWide(v, 'document.manage')) throw new NotFoundException('Not found');
      return { items: out.sort((a, b) => a.due.localeCompare(b.due)) };
    });
  }

  // ------------------------------------------------------------------------------------------ the daily reminder

  /** Asked copies not yet uploaded: the person is reminded once it is due, then weekly. */
  async remindSweep(today = todayIst()): Promise<{ reminded: number }> {
    const orgs = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.reverificationAsk.findMany({ where: { dueOn: { lte: asDate(today) } }, distinct: ['organizationId'], select: { organizationId: true } }));
    let reminded = 0;
    for (const { organizationId } of orgs) {
      const ctx = { organizationId, isSuperAdmin: false };
      const notices = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        const c = { ...ctx, organizationId } as CompanyContext;
        const seen = new Set<string>();
        const asks = (await tx.reverificationAsk.findMany({ where: { organizationId, dueOn: { lte: asDate(today) } }, orderBy: { askedAt: 'desc' } })).filter((a) => !seen.has(`${a.ruleId}:${a.employeeId}`) && Boolean(seen.add(`${a.ruleId}:${a.employeeId}`)));
        const docs = await tx.document.findMany({ where: { organizationId, id: { in: asks.map((a) => a.documentId) } } });
        const types = await this.types(tx, organizationId);
        const out: { userId: string; text: string; id: string }[] = [];
        for (const a of asks) {
          const d = docs.find((x) => x.id === a.documentId);
          if (!d || !['requested', 'rejected'].includes(d.status) || !remindNow({ due: iso(a.dueOn)!, remindedOn: iso(a.remindedOn), today })) continue;
          await tx.reverificationAsk.update({ where: { id: a.id }, data: { remindedOn: asDate(today) } });
          await audit(tx, c, 'document.reverification.reminded', 'document', d.id, { due: iso(a.dueOn) });
          const u = await tx.employee.findFirst({ where: { organizationId, id: a.employeeId, userId: { not: null } }, select: { userId: true } });
          const name = types.find((t) => t.key === d.typeKey)?.name ?? 'document';
          if (u?.userId) out.push({ userId: u.userId, text: `A fresh copy of your ${name} is due. Upload it in YukthiX.`, id: d.id });
        }
        return out;
      });
      for (const n of notices) {
        reminded++;
        await this.notifications.notifySystem(ctx, [n.userId], 'document.requested', { entityType: 'document', entityId: n.id, contextText: n.text, linkPath: '/yx/me/documents' }, { subject: 'A fresh copy of a document is due', html: `<p>${n.text}</p>` }).catch(() => undefined);
      }
    }
    return { reminded };
  }
}

