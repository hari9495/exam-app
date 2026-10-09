import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { checkAnswers } from '../rules-engine/forms';
import { displayName } from '../employee-history/employee-history.service';
import { ownOf, reachesPerson } from '../documents/person-access';
import { EXIT_INTERVIEW_FORM } from './exit-rules';
import { ExitsService } from './exits.service';
import { freezeSettlementIn } from './settlement';

// Lifecycle batch 6c (design §10.6): clearance sign-offs (LIFE-3.05), the exit interview (LIFE-3.06) and the shared
// asset list (LIFE-3.07, D3).
//   clearance  each item has an owner (a person or a team); they clear it, waive it with a reason, or record a recovery
//              (amount + reason) for payroll; when every item is done the case is "cleared". Open items never block the
//              exit itself: they go to payroll as open recoveries (M01 §3.7);
//   interview  the leaver answers the company form once; the answers are sealed and readable only with
//              lifecycle.exit.confidential.view (YX-LC-09); the manager only learns "done / not done";
//   assets     asset.view / asset.manage per legal entity or location; one open assignment per asset (database);
//              the person acknowledges by a click; returning an asset clears its clearance item.

const KEYS = ['lifecycle.exit.manage', 'lifecycle.exit.confidential.view', 'asset.view', 'asset.manage'] as const;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface SignOffDto {
  action: 'clear' | 'waive';
  note?: string | null;
  recoveryAmount?: string | null;
  recoveryReason?: string | null;
  version: number;
}
export interface AssetDto {
  category: string;
  name: string;
  tag: string;
  serial?: string | null;
  legalEntityId?: string | null;
  locationId?: string | null;
  purchasedOn?: string | null;
  cost?: string | null;
  status?: 'in_stock' | 'in_repair' | 'retired' | 'lost';
  version?: number;
}

@Injectable()
export class OffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
    private readonly exits: ExitsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, KEYS);
  }

  private confidential(tx: Tx) {
    return tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'on', true)`;
  }

  // ------------------------------------------------------------------------------------------ clearance (LIFE-3.05)

  private async groupsOf(tx: Tx, org: string, userId: string | null) {
    return userId ? (await tx.userGroupMember.findMany({ where: { organizationId: org, userId }, select: { groupId: true } })).map((g) => g.groupId) : [];
  }

  /** My clearance sign-offs: items I own, or my team owns, for accepted exits. */
  async myClearance(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const groups = await this.groupsOf(tx, org, user.userId ?? null);
      const items = await tx.clearanceItem.findMany({ where: { organizationId: org, OR: [{ ownerUserId: user.userId }, ...(groups.length ? [{ ownerGroupId: { in: groups } }] : [])] }, orderBy: { createdAt: 'asc' } });
      const cases = await tx.exitCase.findMany({ where: { organizationId: org, id: { in: [...new Set(items.map((i) => i.exitCaseId))] }, status: { in: ['accepted', 'cleared', 'exited'] } } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: cases.map((k) => k.employeeId) } } });
      const names = await this.exits.userNames(tx, org, items.map((i) => i.ownerUserId));
      const gnames = await this.exits.groupNames(tx, org, items.map((i) => i.ownerGroupId));
      return {
        today: todayIst(),
        rows: items
          .filter((i) => cases.some((k) => k.id === i.exitCaseId))
          .map((i) => {
            const k = cases.find((x) => x.id === i.exitCaseId)!;
            return { ...this.exits.itemView(i, names, gnames), exitCaseId: k.id, person: displayName(people.find((p) => p.id === k.employeeId)!), lastDay: iso(k.approvedLwd ?? k.standardLwd) };
          }),
      };
    });
  }

  async signOff(ctx: TenantContext, user: ScopeUser, itemId: string, dto: SignOffDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const i = await tx.clearanceItem.findFirst({ where: { organizationId: org, id: itemId } });
      if (!i) throw new NotFoundException('No such clearance item.');
      const k = await tx.exitCase.findFirstOrThrow({ where: { organizationId: org, id: i.exitCaseId } });
      const own = await ownOf(tx, c, v);
      const groups = await this.groupsOf(tx, org, v.userId);
      const owner = i.ownerUserId === v.userId || (i.ownerGroupId !== null && groups.includes(i.ownerGroupId));
      const hr = !v.actingForOther && (await reachesPerson(tx, c, v, 'lifecycle.exit.manage', k.personId, own));
      if ((!owner && !hr) || own.employeeId === k.employeeId) throw new NotFoundException('No such clearance item.');
      if (v.actingForOther) throw new ForbiddenException('Sign-offs are made by the owner, signed in as themselves.');
      if (!['accepted', 'cleared', 'exited'].includes(k.status)) throw new ConflictException('This exit is not accepted.');
      if (i.status !== 'open') throw new ConflictException('This item is already signed off.');
      if (dto.action === 'waive' && !dto.note?.trim()) throw new BadRequestException('Say why it is waived.');
      if (dto.recoveryAmount && !dto.recoveryReason?.trim()) throw new BadRequestException('Say what the recovery is for.');
      if (dto.action === 'waive' && dto.recoveryAmount) throw new BadRequestException('A waived item has no recovery.');
      const n = await tx.clearanceItem.updateMany({
        where: { organizationId: org, id: itemId, version: dto.version, status: 'open' },
        data: { status: dto.action === 'clear' ? 'cleared' : 'waived', note: dto.note?.trim() || null, recoveryAmount: dto.recoveryAmount ? new Prisma.Decimal(dto.recoveryAmount) : null, recoveryReason: dto.recoveryReason?.trim() || null, signedOffBy: c.userId ?? null, signedOffAt: new Date(), version: { increment: 1 } },
      });
      if (!n.count) throw new ConflictException('Someone else signed this off. Reload it.');
      await audit(tx, c, `exit.clearance.${dto.action === 'clear' ? 'cleared' : 'waived'}`, 'exit_case', k.id, { itemId, department: i.department, recovery: dto.recoveryAmount ?? null });
      if (dto.recoveryAmount) await freezeSettlementIn(tx, c, k.id, 'recovery');
      await this.maybeClearedIn(tx, c, k.id);
      return { ok: true };
    });
  }

  /** Every item cleared or waived: the case is "cleared" (the no-dues certificate can then be issued, 6d). */
  private async maybeClearedIn(tx: Tx, c: CompanyContext, exitCaseId: string) {
    const open = await tx.clearanceItem.count({ where: { organizationId: c.organizationId, exitCaseId, status: 'open' } });
    if (open) return;
    const n = await tx.exitCase.updateMany({ where: { organizationId: c.organizationId, id: exitCaseId, status: 'accepted' }, data: { status: 'cleared', version: { increment: 1 } } });
    if (n.count) {
      await audit(tx, c, 'exit.case.cleared', 'exit_case', exitCaseId, {});
      await tx.eventOutbox.create({ data: { organizationId: c.organizationId, eventType: 'exit.case.cleared', payload: { exitCaseId } } });
    }
  }

  // ------------------------------------------------------------------------------------------ exit interview (LIFE-3.06)

  private async myCase(tx: Tx, c: CompanyContext, v: Viewer) {
    const own = await ownOf(tx, c, v);
    if (!own.employeeId) return null;
    return tx.exitCase.findFirst({ where: { organizationId: c.organizationId, employeeId: own.employeeId, status: { in: ['accepted', 'cleared', 'exited'] } }, orderBy: { createdAt: 'desc' } });
  }

  async myInterview(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const k = await this.myCase(tx, c, v);
      const iv = k ? await tx.exitInterview.findFirst({ where: { organizationId: c.organizationId, exitCaseId: k.id } }) : null;
      return { form: EXIT_INTERVIEW_FORM, status: iv?.status ?? null, lastDay: k ? iso(k.approvedLwd ?? k.standardLwd) : null };
    });
  }

  async submitInterview(ctx: TenantContext, user: ScopeUser, answers: unknown) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the leaver answers their exit interview.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const k = await this.myCase(tx, c, v);
      const iv = k ? await tx.exitInterview.findFirst({ where: { organizationId: org, exitCaseId: k.id } }) : null;
      if (!k || !iv) throw new NotFoundException('You have no exit interview.');
      if (iv.status !== 'sent') throw new ConflictException('Your exit interview is already in. Thank you.');
      const { values, errors } = checkAnswers(EXIT_INTERVIEW_FORM, answers);
      if (Object.keys(errors).length) throw new BadRequestException({ statusCode: 400, message: 'Some answers need another look.', fieldErrors: errors });
      const n = await tx.exitInterview.updateMany({ where: { organizationId: org, id: iv.id, status: 'sent' }, data: { status: 'submitted', submittedAt: new Date() } });
      if (!n.count) throw new ConflictException('Your exit interview is already in. Thank you.');
      // The leaver's own answers: written under the confidential flag, never read back to them or their manager.
      await this.confidential(tx);
      await tx.exitInterviewAnswers.createMany({ data: [{ exitInterviewId: iv.id, organizationId: org, answersEnc: this.crypto.encrypt(JSON.stringify(values)) }] });
      await audit(tx, c, 'exit.interview.submitted', 'exit_case', k.id, {});
      return { status: 'submitted' };
    });
  }

  /** HR with the confidential key: the answers and HR's notes. */
  async interview(ctx: TenantContext, user: ScopeUser, exitCaseId: string, notes?: string | null) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const k = await tx.exitCase.findFirst({ where: { organizationId: org, id: exitCaseId } });
      const own = await ownOf(tx, c, v);
      if (!k || v.actingForOther || own.employeeId === k.employeeId || !(await reachesPerson(tx, c, v, 'lifecycle.exit.confidential.view', k.personId, own))) throw new NotFoundException('No such exit interview.');
      const iv = await tx.exitInterview.findFirst({ where: { organizationId: org, exitCaseId } });
      if (!iv) throw new NotFoundException('No such exit interview.');
      await this.confidential(tx);
      if (notes !== undefined) {
        const n = await tx.exitInterviewAnswers.updateMany({ where: { organizationId: org, exitInterviewId: iv.id }, data: { hrNotes: notes?.trim() || null } });
        if (!n.count) throw new ConflictException('There are no answers to add notes to yet.');
        await audit(tx, c, 'exit.interview.notes', 'exit_case', exitCaseId, {});
      }
      const a = await tx.exitInterviewAnswers.findUnique({ where: { exitInterviewId: iv.id } });
      await audit(tx, c, 'exit.interview.viewed', 'exit_case', exitCaseId, {});
      return { form: EXIT_INTERVIEW_FORM, status: iv.status, submittedAt: iv.submittedAt?.toISOString() ?? null, answers: a ? (JSON.parse(this.crypto.decrypt(a.answersEnc)) as Record<string, unknown>) : null, hrNotes: a?.hrNotes ?? null };
    });
  }

  // ------------------------------------------------------------------------------------------ assets (LIFE-3.07)

  /** Does the key reach this asset's place (company-wide, its entity or its location)? */
  private reachesAsset(v: Viewer, key: string, a: { legalEntityId: string | null; locationId: string | null }) {
    if (v.actingForOther && key === 'asset.manage') return false;
    if (tenantWide(v, key)) return true;
    return (v.scopes.get(key) ?? []).some((s) => (s.type === 'legal_entity' && s.id === a.legalEntityId) || (s.type === 'location' && s.id === a.locationId));
  }

  private async assetOr404(tx: Tx, org: string, v: Viewer, id: string, key: 'asset.view' | 'asset.manage') {
    const a = await tx.asset.findFirst({ where: { organizationId: org, id } });
    if (!a || !this.reachesAsset(v, 'asset.view', a)) throw new NotFoundException('No such asset.');
    if (key === 'asset.manage' && !this.reachesAsset(v, key, a)) throw new ForbiddenException('You cannot change this asset.');
    return a;
  }

  async assets(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('asset.view')) throw new ForbiddenException('You cannot see the asset list.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = (await tx.asset.findMany({ where: { organizationId: org }, orderBy: [{ category: 'asc' }, { tag: 'asc' }], take: 2000 })).filter((a) => this.reachesAsset(v, 'asset.view', a));
      const open = await tx.assetAssignment.findMany({ where: { organizationId: org, assetId: { in: rows.map((a) => a.id) }, returnedOn: null } });
      const people = await tx.employee.findMany({ where: { organizationId: org, personId: { in: open.map((o) => o.personId) } } });
      return {
        today: todayIst(),
        rows: rows.map((a) => {
          const o = open.find((x) => x.assetId === a.id);
          const p = o ? people.find((x) => x.personId === o.personId) : null;
          return {
            id: a.id,
            category: a.category,
            name: a.name,
            tag: a.tag,
            serial: a.serial,
            legalEntityId: a.legalEntityId,
            locationId: a.locationId,
            purchasedOn: a.purchasedOn ? iso(a.purchasedOn) : null,
            cost: a.cost?.toFixed(2) ?? null,
            status: a.status,
            version: a.version,
            canManage: this.reachesAsset(v, 'asset.manage', a),
            holder: o ? { assignmentId: o.id, employeeId: p?.id ?? null, name: p ? displayName(p) : 'Someone', issuedOn: iso(o.issuedOn), acknowledged: Boolean(o.ackEvidence) } : null,
          };
        }),
      };
    });
  }

  async saveAsset(ctx: TenantContext, user: ScopeUser, id: string | null, dto: AssetDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const place = { legalEntityId: dto.legalEntityId ?? null, locationId: dto.locationId ?? null };
      if (!this.reachesAsset(v, 'asset.manage', place)) throw new ForbiddenException('Choose a legal entity or location you look after.');
      if (place.locationId && place.legalEntityId) {
        const l = await tx.location.findFirst({ where: { organizationId: org, id: place.locationId }, select: { legalEntityId: true } });
        if (!l || l.legalEntityId !== place.legalEntityId) throw new BadRequestException('That location is not in that legal entity.');
      }
      const data = { category: dto.category.trim(), name: dto.name.trim(), tag: dto.tag.trim(), serial: dto.serial?.trim() || null, ...place, purchasedOn: dto.purchasedOn ? asDate(dto.purchasedOn) : null, cost: dto.cost ? new Prisma.Decimal(dto.cost) : null };
      try {
        if (!id) {
          const a = await tx.asset.create({ data: { organizationId: org, ...data, createdBy: c.userId ?? null } });
          await audit(tx, c, 'asset.added', 'asset', a.id, { tag: a.tag, category: a.category });
          return { id: a.id };
        }
        const cur = await this.assetOr404(tx, org, v, id, 'asset.manage');
        if (dto.status && dto.status !== cur.status && cur.status === 'assigned') throw new ConflictException('Take the asset back before changing its status.');
        const n = await tx.asset.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { ...data, ...(dto.status && cur.status !== 'assigned' ? { status: dto.status } : {}), version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this asset. Reload it.');
        await audit(tx, c, 'asset.updated', 'asset', id, { status: dto.status ?? cur.status });
        return { id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another asset already has that tag.');
        throw e;
      }
    });
  }

  async issue(ctx: TenantContext, user: ScopeUser, assetId: string, dto: { employeeId: string; issuedOn: string; condition: string }) {
    const v = await this.viewer(user);
    const res = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const a = await this.assetOr404(tx, org, v, assetId, 'asset.manage');
      if (a.status !== 'in_stock') throw new ConflictException(a.status === 'assigned' ? 'This asset is already with someone. Take it back first.' : 'Only an asset in stock can be issued.');
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId } });
      if (!emp || !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee.');
      if (dto.issuedOn > todayIst()) throw new BadRequestException('The issue date cannot be in the future.');
      try {
        const x = await tx.assetAssignment.create({ data: { organizationId: org, assetId, personId: emp.personId, issuedOn: asDate(dto.issuedOn), issueCondition: dto.condition.trim(), issuedBy: c.userId ?? null } });
        await tx.asset.update({ where: { id: assetId }, data: { status: 'assigned', version: { increment: 1 } } });
        await audit(tx, c, 'asset.assigned', 'asset', assetId, { assignmentId: x.id, employeeId: emp.id });
        await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'asset.assigned', payload: { assetId, assignmentId: x.id, personId: emp.personId } } });
        // Someone already leaving: the asset joins their clearance list.
        const k = await tx.exitCase.findFirst({ where: { organizationId: org, personId: emp.personId, status: 'accepted' }, select: { id: true } });
        if (k) await this.exits.assetItemsIn(tx, org, k.id, emp.personId, c.userId ?? null);
        return { userId: emp.userId, name: a.name };
      } catch (e) {
        // The database keeps one open assignment per asset.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This asset is already with someone. Take it back first.');
        throw e;
      }
    });
    if (res.userId)
      await this.notifications
        .notifySystem(ctx, [res.userId], 'asset.assigned', { entityType: 'asset', entityId: assetId, contextText: `${res.name} was issued to you`, linkPath: '/yx/me/assets' }, { subject: 'A company asset was issued to you', html: '<p>A company asset was issued to you. Please confirm you received it in YukthiX.</p>' })
        .catch(() => undefined);
    return { ok: true };
  }

  async takeBack(ctx: TenantContext, user: ScopeUser, assetId: string, dto: { returnedOn: string; condition: string; status: 'in_stock' | 'in_repair' | 'lost' }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.assetOr404(tx, org, v, assetId, 'asset.manage');
      const x = await tx.assetAssignment.findFirst({ where: { organizationId: org, assetId, returnedOn: null } });
      if (!x) throw new ConflictException('This asset is not with anyone.');
      if (dto.returnedOn < iso(x.issuedOn) || dto.returnedOn > todayIst()) throw new BadRequestException('The return date is between the issue date and today.');
      const lost = dto.status === 'lost';
      if (!lost) await tx.assetAssignment.update({ where: { id: x.id }, data: { returnedOn: asDate(dto.returnedOn), returnCondition: dto.condition.trim(), returnedBy: c.userId ?? null, version: { increment: 1 } } });
      else await tx.assetAssignment.update({ where: { id: x.id }, data: { returnedOn: asDate(dto.returnedOn), returnCondition: `Not returned: ${dto.condition.trim()}`.slice(0, 200), returnedBy: c.userId ?? null, version: { increment: 1 } } });
      await tx.asset.update({ where: { id: assetId }, data: { status: dto.status, version: { increment: 1 } } });
      // Returning closes its clearance item; a lost asset leaves the item open for a recovery.
      if (!lost) {
        const items = await tx.clearanceItem.findMany({ where: { organizationId: org, assetAssignmentId: x.id, status: 'open' } });
        for (const i of items) {
          await tx.clearanceItem.update({ where: { id: i.id }, data: { status: 'cleared', note: `Returned on ${dto.returnedOn}: ${dto.condition.trim()}`.slice(0, 1000), signedOffBy: c.userId ?? null, signedOffAt: new Date(), version: { increment: 1 } } });
          await this.maybeClearedIn(tx, c, i.exitCaseId);
        }
      }
      // The payroll hand-off of a leaver holding it moves on (returned: no recovery; lost: still to recover).
      for (const i of await tx.clearanceItem.findMany({ where: { organizationId: org, assetAssignmentId: x.id }, select: { exitCaseId: true } })) await freezeSettlementIn(tx, c, i.exitCaseId, 'asset_returned');
      await audit(tx, c, lost ? 'asset.lost' : 'asset.returned', 'asset', assetId, { assignmentId: x.id });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'asset.returned', payload: { assetId, assignmentId: x.id, lost } } });
      return { ok: true };
    });
  }

  async myAssets(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      if (!own.personId) return { rows: [] };
      const open = await tx.assetAssignment.findMany({ where: { organizationId: c.organizationId, personId: own.personId, returnedOn: null }, orderBy: { issuedOn: 'desc' } });
      const assets = await tx.asset.findMany({ where: { organizationId: c.organizationId, id: { in: open.map((o) => o.assetId) } } });
      return { rows: open.map((o) => { const a = assets.find((x) => x.id === o.assetId)!; return { assignmentId: o.id, name: a.name, category: a.category, tag: a.tag, serial: a.serial, issuedOn: iso(o.issuedOn), condition: o.issueCondition, acknowledgedAt: (o.ackEvidence as { at?: string } | null)?.at ?? null }; }) };
    });
  }

  async acknowledge(ctx: TenantContext, user: ScopeUser, assignmentId: string, meta: { ip: string | null; device: string | null }) {
    const v = await this.viewer(user);
    if (v.actingForOther) throw new ForbiddenException('Only the holder confirms they received it.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const own = await ownOf(tx, c, v);
      const x = own.personId ? await tx.assetAssignment.findFirst({ where: { organizationId: c.organizationId, id: assignmentId, personId: own.personId, returnedOn: null } }) : null;
      if (!x) throw new NotFoundException('No such asset with you.');
      if (x.ackEvidence) return { ok: true };
      await tx.assetAssignment.update({ where: { id: x.id }, data: { ackEvidence: { method: 'click', at: new Date().toISOString(), ip: meta.ip, device: meta.device }, version: { increment: 1 } } });
      await audit(tx, c, 'asset.acknowledged', 'asset', x.assetId, { assignmentId });
      return { ok: true };
    });
  }
}
