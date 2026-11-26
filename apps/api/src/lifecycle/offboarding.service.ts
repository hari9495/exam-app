import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, covers, implicitPeriods, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { checkAnswers } from '../rules-engine/forms';
import { displayName } from '../employee-history/employee-history.service';
import { ownOf, reachesPerson } from '../documents/person-access';
import { EXIT_INTERVIEW_FORM } from './exit-rules';
import { ExitsService } from './exits.service';
import { freezeSettlementIn } from './settlement';
import { settingFor } from '../people/probation';
import { DeskAccessService, RequestUser, companyOf, visibleTickets } from '../service-desk/desk-access';
import { STARTER_CATEGORIES, addMonthsIso, netBookValue, nextTag, recoveryAmount, tagHead } from './asset-categories';

// Lifecycle batch 6c (design §10.6): clearance sign-offs (LIFE-3.05), the exit interview (LIFE-3.06) and the shared
// asset list (LIFE-3.07, D3).
//   clearance  each item has an owner (a person or a team); they clear it, waive it with a reason, or record a recovery
//              (amount + reason) for payroll; when every item is done the case is "cleared". Open items never block the
//              exit itself: they go to payroll as open recoveries (M01 §3.7);
//   interview  the leaver answers the company form once; the answers are sealed and readable only with
//              lifecycle.exit.confidential.view (YX-LC-09); the manager only learns "done / not done";
//   assets     asset.view / asset.manage per legal entity or location; one open assignment per asset (database);
//              the person acknowledges by a click; returning an asset clears its clearance item.

/** Answer 2713: how the category depreciates, in words (null: it does not). */
export function depreciationText(c: { usefulLifeYears: number | null; depreciationMethod: string; depreciationRate: Prisma.Decimal | null } | null): string | null {
  if (!c) return null;
  if (c.depreciationMethod === 'declining') return c.depreciationRate ? `Declining balance at ${Number(c.depreciationRate)}% a year` : null;
  return c.usefulLifeYears ? `Straight line over ${c.usefulLifeYears} ${c.usefulLifeYears === 1 ? 'year' : 'years'}` : null;
}

/** Does the key reach this place (company-wide, its entity or its location)? A place-less record: company-wide only. */
export function reachesPlace(v: Viewer, key: string, a: { legalEntityId: string | null; locationId: string | null }) {
  if (v.actingForOther && key === 'asset.manage') return false;
  if (tenantWide(v, key)) return true;
  return (v.scopes.get(key) ?? []).some((s) => (s.type === 'legal_entity' && s.id === a.legalEntityId) || (s.type === 'location' && s.id === a.locationId));
}

export const ASSET_KEYS = ['lifecycle.exit.manage', 'lifecycle.exit.confidential.view', 'asset.view', 'asset.manage', 'asset.finance.view', 'org.settings.manage'] as const;
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
  /** IT assets part 1 (answer 2712): the category from the company list; or its name (older callers). */
  categoryId?: string | null;
  category?: string | null;
  name: string;
  tag: string;
  serial?: string | null;
  legalEntityId?: string | null;
  locationId?: string | null;
  purchasedOn?: string | null;
  cost?: string | null;
  status?: 'in_stock' | 'in_repair' | 'retired' | 'lost';
  version?: number;
  maker?: string | null;
  model?: string | null;
  invoiceNumber?: string | null;
  warrantyMonths?: number | null;
  supplierId?: string | null;
}

export interface AssetCategoryDto {
  name: string;
  trackedBy?: string | null;
  defaultRecovery?: string | null;
  usefulLifeYears?: number | null;
  /** Answer 2720: the tag pattern (no prefix: none). */
  tagPrefix?: string | null;
  tagYear?: boolean;
  tagDigits?: number;
  /** Answer 2713: straight_line (default) or declining at depreciationRate % a year. */
  depreciationMethod?: 'straight_line' | 'declining';
  depreciationRate?: string | null;
  version?: number;
}
/** A company-wide setting (the asset keys are company-wide only, so no place is needed). */
const companySetting = (tx: Tx, c: CompanyContext, key: 'asset.ack_method' | 'asset.recovery_to_fnf' | 'asset.recovery_basis') => settingFor(tx, c, key, { legalEntityId: '' });

@Injectable()
export class OffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
    private readonly exits: ExitsService,
    private readonly desk: DeskAccessService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ASSET_KEYS);
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

  /**
   * PPL-20 HR view by leaver: every department's items for the leavers in HR's scope (lifecycle.exit.manage on the
   * person) whose clearance is still open. Never the HR person's own exit.
   */
  async hrClearance(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const own = await ownOf(tx, c, v);
      const openCases = await tx.clearanceItem.findMany({ where: { organizationId: org, status: 'open' }, select: { exitCaseId: true }, distinct: ['exitCaseId'] });
      const cases = (await tx.exitCase.findMany({ where: { organizationId: org, id: { in: openCases.map((x) => x.exitCaseId) }, status: { in: ['accepted', 'cleared', 'exited'] } }, orderBy: { createdAt: 'asc' } })).filter((k) => k.employeeId !== own.employeeId);
      const reach = await Promise.all(cases.map((k) => reachesPerson(tx, c, v, 'lifecycle.exit.manage', k.personId, own)));
      const mine = cases.filter((_, i) => reach[i]);
      const items = await tx.clearanceItem.findMany({ where: { organizationId: org, exitCaseId: { in: mine.map((k) => k.id) } }, orderBy: { createdAt: 'asc' } });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: mine.map((k) => k.employeeId) } } });
      const names = await this.exits.userNames(tx, org, items.map((i) => i.ownerUserId));
      const gnames = await this.exits.groupNames(tx, org, items.map((i) => i.ownerGroupId));
      return {
        today: todayIst(),
        rows: items.map((i) => {
          const k = mine.find((x) => x.id === i.exitCaseId)!;
          return { ...this.exits.itemView(i, names, gnames), exitCaseId: k.id, person: displayName(people.find((p) => p.id === k.employeeId)!), lastDay: iso(k.approvedLwd ?? k.standardLwd) };
        }),
      };
    });
  }

  /** The item, if the viewer owns it (themselves or a group) or is HR over the leaver; never the leaver themselves. */
  private async ownedItem(tx: Tx, c: CompanyContext, v: Viewer, itemId: string) {
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
    return { i, k };
  }

  /**
   * PPL-20: the owner (or HR) marks an open item blocked with the reason, e.g. an unclaimed advance. It stays open: it
   * still holds F&F finalisation, and signing it off or waiving it ends the block. Marking it again replaces the reason.
   */
  async block(ctx: TenantContext, user: ScopeUser, itemId: string, dto: { reason: string; version: number }) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { i, k } = await this.ownedItem(tx, c, v, itemId);
      const n = await tx.clearanceItem.updateMany({
        where: { organizationId: c.organizationId, id: itemId, version: dto.version, status: 'open' },
        data: { blockedReason: dto.reason.trim().slice(0, 300), blockedAt: new Date(), blockedBy: c.userId ?? null, version: { increment: 1 } },
      });
      if (!n.count) throw new ConflictException('This item changed meanwhile. Reload it.');
      await audit(tx, c, 'exit.clearance.blocked', 'exit_case', k.id, { itemId, department: i.department });
      return { ok: true };
    });
  }

  async signOff(ctx: TenantContext, user: ScopeUser, itemId: string, dto: SignOffDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { i, k } = await this.ownedItem(tx, c, v, itemId);
      if (dto.action === 'waive' && !dto.note?.trim()) throw new BadRequestException('Say why it is waived.');
      if (dto.recoveryAmount && !dto.recoveryReason?.trim()) throw new BadRequestException('Say what the recovery is for.');
      if (dto.action === 'waive' && dto.recoveryAmount) throw new BadRequestException('A waived item has no recovery.');
      const n = await tx.clearanceItem.updateMany({
        where: { organizationId: org, id: itemId, version: dto.version, status: 'open' },
        data: { status: dto.action === 'clear' ? 'cleared' : 'waived', blockedReason: null, blockedAt: null, blockedBy: null, note: dto.note?.trim() || null, recoveryAmount: dto.recoveryAmount ? new Prisma.Decimal(dto.recoveryAmount) : null, recoveryReason: dto.recoveryReason?.trim() || null, signedOffBy: c.userId ?? null, signedOffAt: new Date(), version: { increment: 1 } },
      });
      if (!n.count) throw new ConflictException('Someone else signed this off. Reload it.');
      // An asset item cleared with nothing owed means the asset came back: record the return as "Take back" does
      // (founder 23 Oct 2026: the Assets tab still showed the phone with the leaver).
      if (i.assetAssignmentId && dto.action === 'clear' && !dto.recoveryAmount) {
        const x = await tx.assetAssignment.findFirst({ where: { organizationId: org, id: i.assetAssignmentId, returnedOn: null } });
        if (x) {
          await tx.assetAssignment.update({ where: { id: x.id }, data: { returnedOn: asDate(todayIst()), returnCondition: (dto.note?.trim() || 'Returned at clearance').slice(0, 200), returnedBy: c.userId ?? null, version: { increment: 1 } } });
          await tx.asset.update({ where: { id: x.assetId }, data: { status: 'in_stock', version: { increment: 1 } } });
          await freezeSettlementIn(tx, c, k.id, 'asset_returned');
        }
      }
      // IT assets answer 2718: clearing a leaver's licence seat item frees the seat (audited on the licence).
      if (i.licenceSeatId && dto.action === 'clear') {
        const seat = await tx.assetLicenceSeat.findFirst({ where: { organizationId: org, id: i.licenceSeatId, freedOn: null } });
        if (seat) {
          await tx.assetLicenceSeat.update({ where: { id: seat.id }, data: { freedOn: asDate(todayIst()), freedBy: c.userId ?? null, freeReason: (dto.note?.trim() || 'Freed at exit clearance').slice(0, 200), version: { increment: 1 } } });
          await audit(tx, c, 'asset.licence.seat.freed', 'asset_licence', seat.licenceId, { seatId: seat.id, personId: seat.personId, exitCaseId: k.id });
        }
      }
      await audit(tx, c, `exit.clearance.${dto.action === 'clear' ? 'cleared' : 'waived'}`, 'exit_case', k.id, { itemId, department: i.department, recovery: dto.recoveryAmount ?? null });
      if (dto.recoveryAmount) await freezeSettlementIn(tx, c, k.id, 'recovery');
      await this.maybeClearedIn(tx, c, k.id);
      return { ok: true };
    });
  }

  /** Every item cleared or waived: the case is "cleared" (the no-dues certificate can then be issued, 6d). */
  async maybeClearedIn(tx: Tx, c: CompanyContext, exitCaseId: string) {
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
      // HR who owns the exit is told it is in (founder 24 Oct 2026); only that it was answered, never the answers.
      const j = await tx.journey.findFirst({ where: { organizationId: org, subjectType: 'exit_case', subjectId: k.id, status: { not: 'cancelled' } }, select: { ownerUserId: true } });
      const p = await tx.employee.findFirst({ where: { organizationId: org, id: k.employeeId } });
      return { status: 'submitted', tell: j?.ownerUserId ? { to: j.ownerUserId, who: p ? displayName(p) : 'A leaver', caseId: k.id } : null };
    }).then(async (r) => {
      if (r.tell)
        await this.notifications
          .notifySystem(ctx, [r.tell.to], 'exit.case.update', { entityType: 'exit_case', entityId: r.tell.caseId, contextText: `${r.tell.who} answered the exit interview`, linkPath: `/yx/people/exits/${r.tell.caseId}` }, { subject: `${r.tell.who} answered the exit interview`, html: '<p>The exit interview answers are in YukthiX. Only HR can read them.</p>' })
          .catch(() => undefined);
      return { status: r.status };
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
    return reachesPlace(v, key, a);
  }

  /** Answer 2711: money on an asset (cost, later net book value) for its place's asset managers and asset.finance.view. */
  private seesMoney(v: Viewer, a: { legalEntityId: string | null; locationId: string | null }) {
    return this.reachesAsset(v, 'asset.manage', a) || this.reachesAsset(v, 'asset.finance.view', a);
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
      const cats = new Map((await tx.assetCategory.findMany({ where: { organizationId: org } })).map((x) => [x.id, x]));
      // Settings 2.8: a leaver's return form offers a recovery for F&F only when the company adds them, starting from the basis.
      const toFnf = (await companySetting(tx, c, 'asset.recovery_to_fnf')) === 'on';
      const basis = await companySetting(tx, c, 'asset.recovery_basis');
      const open = await tx.assetAssignment.findMany({ where: { organizationId: org, assetId: { in: rows.map((a) => a.id) }, returnedOn: null } });
      const people = await tx.employee.findMany({ where: { organizationId: org, personId: { in: open.map((o) => o.personId) } } });
      // A holder who is leaving (their asset is on an open clearance item): the return form offers a recovery for F&F.
      const leaving = await tx.clearanceItem.findMany({ where: { organizationId: org, status: 'open', assetAssignmentId: { in: open.map((o) => o.id) } }, select: { assetAssignmentId: true, exitCaseId: true } });
      const cases = leaving.length ? await tx.exitCase.findMany({ where: { organizationId: org, id: { in: leaving.map((l) => l.exitCaseId) } }, select: { id: true, approvedLwd: true, standardLwd: true } }) : [];
      const lastDayOf = (assignmentId: string) => {
        const k = cases.find((c) => c.id === leaving.find((l) => l.assetAssignmentId === assignmentId)?.exitCaseId);
        return k ? iso(k.approvedLwd ?? k.standardLwd) : null;
      };
      return {
        today: todayIst(),
        money: rows.some((a) => this.seesMoney(v, a)),
        recovery: { toFnf, basis },
        rows: rows.map((a) => {
          const o = open.find((x) => x.assetId === a.id);
          const p = o ? people.find((x) => x.personId === o.personId) : null;
          const cat = a.categoryId ? cats.get(a.categoryId) : undefined;
          const manage = this.reachesAsset(v, 'asset.manage', a);
          const leavingOn = o ? lastDayOf(o.id) : null;
          return {
            id: a.id,
            categoryId: a.categoryId,
            category: cat?.name ?? a.category,
            name: a.name,
            tag: a.tag,
            serial: a.serial,
            legalEntityId: a.legalEntityId,
            locationId: a.locationId,
            purchasedOn: a.purchasedOn ? iso(a.purchasedOn) : null,
            // Answer 2714: the register shows an ended warranty in red.
            warrantyEndsOn: a.purchasedOn && a.warrantyMonths ? addMonthsIso(iso(a.purchasedOn), a.warrantyMonths) : null,
            // Answer 2711: no cost in the answer for whoever may not see money.
            ...(this.seesMoney(v, a) ? { cost: a.cost?.toFixed(2) ?? null } : {}),
            status: a.status,
            version: a.version,
            canManage: manage,
            holder: o
              ? {
                  assignmentId: o.id,
                  employeeId: p?.id ?? null,
                  name: p ? displayName(p) : 'Someone',
                  issuedOn: iso(o.issuedOn),
                  condition: o.issueCondition,
                  acknowledged: Boolean(o.ackEvidence),
                  ackNone: (o.ackEvidence as { method?: string } | null)?.method === 'none',
                  leavingOn,
                  ...(manage && leavingOn ? { recoveryDefault: recoveryAmount(basis, cat?.defaultRecovery, a.cost, cat ? netBookValue(a.cost, a.purchasedOn ? iso(a.purchasedOn) : null, todayIst(), cat) : null) } : {}),
                }
              : null,
          };
        }),
      };
    });
  }

  // ------------------------------------------------------------------------------------------ categories (Settings 2.8)

  /** All the company's categories; a company with none yet starts from the drawn starter list (answer 2712). */
  private async categoriesIn(tx: Tx, org: string, userId: string | null) {
    const rows = await tx.assetCategory.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } });
    if (rows.length) return rows;
    // skipDuplicates: two first readers at once add the list once (one active name per company).
    await tx.assetCategory.createMany({ data: STARTER_CATEGORIES.map((x) => ({ organizationId: org, ...x, defaultRecovery: x.defaultRecovery ? new Prisma.Decimal(x.defaultRecovery) : null, createdBy: userId })), skipDuplicates: true });
    return tx.assetCategory.findMany({ where: { organizationId: org }, orderBy: { name: 'asc' } });
  }

  /** The active categories (Settings 2.8 and the Add asset picker); HR's company-wide settings key changes them. */
  async categories(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = (await this.categoriesIn(tx, org, c.userId ?? null)).filter((x) => !x.retiredAt);
      const used = await tx.asset.groupBy({ by: ['categoryId'], where: { organizationId: org, categoryId: { in: rows.map((x) => x.id) } }, _count: { _all: true } });
      // Answer 2720: the next tag of each pattern, from the tags already made with it this year.
      const year = todayIst().slice(0, 4);
      const heads = [...new Set(rows.map((x) => tagHead(x, year)).filter((h): h is string => Boolean(h)))];
      const tags = heads.length ? (await tx.asset.findMany({ where: { organizationId: org, OR: heads.map((h) => ({ tag: { startsWith: h, mode: 'insensitive' as const } })) }, select: { tag: true } })).map((a) => a.tag) : [];
      return {
        canEdit: tenantWide(v, 'org.settings.manage') && !v.actingForOther,
        rows: rows.map((x) => ({ id: x.id, name: x.name, trackedBy: x.trackedBy, defaultRecovery: x.defaultRecovery?.toFixed(2) ?? null, usefulLifeYears: x.usefulLifeYears, depreciationMethod: x.depreciationMethod, depreciationRate: x.depreciationRate?.toFixed(2) ?? null, tagPrefix: x.tagPrefix, tagYear: x.tagYear, tagDigits: x.tagDigits, nextTag: nextTag(x, year, tags), assets: used.find((u) => u.categoryId === x.id)?._count._all ?? 0, version: x.version })),
      };
    });
  }

  async saveCategory(ctx: TenantContext, user: ScopeUser, id: string | null, dto: AssetCategoryDto) {
    const v = await this.viewer(user);
    if (!tenantWide(v, 'org.settings.manage') || v.actingForOther) throw new ForbiddenException('Only HR with the company-wide settings key changes asset categories.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await this.categoriesIn(tx, org, c.userId ?? null);
      const data = { name: dto.name.trim(), trackedBy: dto.trackedBy?.trim() || null, defaultRecovery: dto.defaultRecovery ? new Prisma.Decimal(dto.defaultRecovery) : null, usefulLifeYears: dto.usefulLifeYears ?? null, tagPrefix: dto.tagPrefix?.trim().toUpperCase() || null, tagYear: Boolean(dto.tagYear), tagDigits: dto.tagDigits ?? 4, depreciationMethod: dto.depreciationMethod ?? 'straight_line', depreciationRate: dto.depreciationMethod === 'declining' && dto.depreciationRate ? new Prisma.Decimal(dto.depreciationRate) : null };
      if (data.depreciationMethod === 'declining' && !data.depreciationRate) throw new BadRequestException('Give the yearly rate for declining balance.');
      try {
        if (!id) {
          const x = await tx.assetCategory.create({ data: { organizationId: org, ...data, createdBy: c.userId ?? null } });
          await audit(tx, c, 'asset.category.added', 'asset_category', x.id, { name: x.name });
          return { id: x.id };
        }
        const cur = await tx.assetCategory.findFirst({ where: { organizationId: org, id, retiredAt: null } });
        if (!cur) throw new NotFoundException('No such category.');
        const n = await tx.assetCategory.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { ...data, version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this category. Reload it.');
        await audit(tx, c, 'asset.category.updated', 'asset_category', id, { from: { name: cur.name, trackedBy: cur.trackedBy, defaultRecovery: cur.defaultRecovery?.toFixed(2) ?? null, usefulLifeYears: cur.usefulLifeYears, tagPrefix: cur.tagPrefix, tagYear: cur.tagYear, tagDigits: cur.tagDigits, depreciationMethod: cur.depreciationMethod, depreciationRate: cur.depreciationRate?.toFixed(2) ?? null }, to: { ...data, defaultRecovery: data.defaultRecovery?.toFixed(2) ?? null, depreciationRate: data.depreciationRate?.toFixed(2) ?? null } });
        return { id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Another category already has that name.');
        throw e;
      }
    });
  }

  /** Retired, never deleted: it leaves the pickers; assets in it keep it. */
  async retireCategory(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    if (!tenantWide(v, 'org.settings.manage') || v.actingForOther) throw new ForbiddenException('Only HR with the company-wide settings key changes asset categories.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const n = await tx.assetCategory.updateMany({ where: { organizationId: org, id, retiredAt: null }, data: { retiredAt: new Date(), version: { increment: 1 } } });
      if (!n.count) throw new NotFoundException('No such category.');
      await audit(tx, c, 'asset.category.retired', 'asset_category', id, {});
      return { ok: true };
    });
  }

  /** The Issue picker: current employees (id and name only), for whoever may issue assets. */
  async assetPeople(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    if (!v.grants.has('asset.manage')) throw new ForbiddenException('You cannot issue assets.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const current = await tx.employment.findMany({ where: { organizationId: org, exitedOn: null }, select: { employeeId: true }, distinct: ['employeeId'] });
      const people = await tx.employee.findMany({ where: { organizationId: org, id: { in: current.map((e) => e.employeeId) } } });
      return people.map((p) => ({ id: p.id, name: displayName(p) })).sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  /**
   * The asset page (IT assets plan, 26 Nov 2026): the details and the history (added, changed, issued, confirmed,
   * returned), for whoever sees the asset (asset.view over its place); others: 404.
   */
  async assetPage(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    if (!v.grants.has('asset.view')) throw new ForbiddenException('You cannot see the asset list.');
    // Answer 2722: the Helpdesk's own ticket visibility (agents of the ticket's desk, collaborators, shares). Someone the
    // desk refuses for now (e.g. a session without the company's two-step check) sees only the count.
    const agent = await this.desk.actorOf(user as RequestUser, companyOf(ctx)).catch(() => null);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const a = await this.assetOr404(tx, org, v, id, 'asset.view');
      const [entity, location] = await Promise.all([
        a.legalEntityId ? tx.legalEntity.findFirst({ where: { organizationId: org, id: a.legalEntityId }, select: { name: true } }) : null,
        a.locationId ? tx.location.findFirst({ where: { organizationId: org, id: a.locationId }, select: { name: true } }) : null,
      ]);
      const spells = await tx.assetAssignment.findMany({ where: { organizationId: org, assetId: a.id }, orderBy: { issuedOn: 'asc' } });
      const people = await tx.employee.findMany({ where: { organizationId: org, personId: { in: spells.map((s) => s.personId) } } });
      const audits = await tx.auditLog.findMany({ where: { organizationId: org, entityType: 'asset', entityId: a.id, action: { in: ['asset.added', 'asset.updated'] } }, orderBy: { createdAt: 'asc' }, take: 500 });
      const userIds = [...new Set(spells.flatMap((s) => [s.issuedBy, s.returnedBy]).filter((x): x is string => Boolean(x)))];
      const users = new Map((await tx.user.findMany({ where: { organizationId: org, id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
      const nameOf = (personId: string) => {
        const p = people.find((x) => x.personId === personId);
        return p ? displayName(p) : 'Someone';
      };
      const by = (uid: string | null) => (uid ? (users.get(uid) ?? 'Someone') : 'Automatic');
      const history: { id: string; at: string; who: string; what: string }[] = [
        ...audits.map((x) => ({ id: x.id, at: x.createdAt.toISOString(), who: x.actorName ?? 'Someone', what: x.action === 'asset.added' ? 'added the asset' : 'changed the details' })),
        ...spells.flatMap((s) => [
          { id: `${s.id}-i`, at: iso(s.issuedOn), who: by(s.issuedBy), what: `issued it to ${nameOf(s.personId)} (${s.issueCondition})` },
          ...((s.ackEvidence as { at?: string } | null)?.at ? [{ id: `${s.id}-a`, at: (s.ackEvidence as { at: string }).at, who: nameOf(s.personId), what: 'confirmed they received it' }] : []),
          ...(s.returnedOn ? [{ id: `${s.id}-r`, at: iso(s.returnedOn), who: by(s.returnedBy), what: s.returnCondition?.startsWith('Not returned') ? `marked it not returned by ${nameOf(s.personId)}` : `took it back from ${nameOf(s.personId)} (${s.returnCondition ?? 'returned'})` }] : []),
        ]),
      ].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
      const open = spells.find((s) => !s.returnedOn);
      const cat = a.categoryId ? await tx.assetCategory.findFirst({ where: { organizationId: org, id: a.categoryId }, select: { name: true, usefulLifeYears: true, depreciationMethod: true, depreciationRate: true } }) : null;
      const money = this.seesMoney(v, a);
      const supplier = a.supplierId ? await tx.itSupplier.findFirst({ where: { organizationId: org, id: a.supplierId }, select: { name: true } }) : null;
      // Answer 2717: the contracts covering it that this viewer sees (asset.view over the contract's place).
      const covering = (await tx.assetContract.findMany({ where: { organizationId: org, id: { in: (await tx.assetContractAsset.findMany({ where: { organizationId: org, assetId: a.id }, select: { contractId: true } })).map((l) => l.contractId) } }, orderBy: { endsOn: 'desc' } })).filter((k) => reachesPlace(v, 'asset.view', k));
      const contractSuppliers = new Map((await tx.itSupplier.findMany({ where: { organizationId: org, id: { in: covering.map((k) => k.supplierId) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
      // Answer 2718: the licence seats on this device, of the licences this viewer sees (asset.view over the licence's place).
      const deviceSeats = await tx.assetLicenceSeat.findMany({ where: { organizationId: org, assetId: a.id, freedOn: null }, orderBy: { givenOn: 'desc' } });
      const seatLicences = (await tx.assetLicence.findMany({ where: { organizationId: org, id: { in: deviceSeats.map((x) => x.licenceId) } } })).filter((l) => reachesPlace(v, 'asset.view', l));
      // Answer 2715: its bookings (past, current and to come), newest first.
      const bookings = await tx.assetBooking.findMany({ where: { organizationId: org, assetId: a.id }, orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }], take: 200 });
      const bookers = await tx.employee.findMany({ where: { organizationId: org, personId: { in: [...new Set(bookings.map((b) => b.personId))] } } });
      const warrantyEndsOn = a.purchasedOn && a.warrantyMonths ? addMonthsIso(iso(a.purchasedOn), a.warrantyMonths) : null;
      // Answer 2722: every viewer of the asset gets how many tickets are about it; only the ones they may see are listed.
      const ticketCount = await tx.sdTicket.count({ where: { organizationId: org, assetId: a.id } });
      const seen = agent && ticketCount ? await tx.sdTicket.findMany({ where: { AND: [await visibleTickets(tx, agent), { organizationId: org, assetId: a.id }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true, number: true, subject: true, systemState: true, createdAt: true } }) : [];
      return {
        today: todayIst(),
        canManage: this.reachesAsset(v, 'asset.manage', a),
        money,
        asset: {
          id: a.id,
          categoryId: a.categoryId,
          category: cat?.name ?? a.category,
          name: a.name,
          tag: a.tag,
          serial: a.serial,
          maker: a.maker,
          model: a.model,
          status: a.status,
          legalEntityId: a.legalEntityId,
          locationId: a.locationId,
          legalEntity: entity?.name ?? null,
          location: location?.name ?? null,
          purchasedOn: a.purchasedOn ? iso(a.purchasedOn) : null,
          ...(money ? { cost: a.cost?.toFixed(2) ?? null } : {}),
          // Answer 2713: the net book value today (money, as the cost) and how it is worked out; a management figure.
          ...(money ? { netBookValue: cat ? netBookValue(a.cost, a.purchasedOn ? iso(a.purchasedOn) : null, todayIst(), cat) : null, depreciation: depreciationText(cat) } : {}),
          invoiceNumber: a.invoiceNumber,
          warrantyMonths: a.warrantyMonths,
          warrantyEndsOn,
          // Answer 2716: the IT and Admin supplier.
          supplierId: a.supplierId,
          supplier: supplier?.name ?? null,
          bookable: a.bookable,
          version: a.version,
        },
        holder: open ? { name: nameOf(open.personId), issuedOn: iso(open.issuedOn), acknowledged: Boolean(open.ackEvidence), ackNone: (open.ackEvidence as { method?: string } | null)?.method === 'none' } : null,
        history,
        contracts: covering.map((k) => ({ id: k.id, kind: k.kind, number: k.number, supplier: contractSuppliers.get(k.supplierId) ?? 'Unknown supplier', endsOn: iso(k.endsOn), renewal: k.renewal, status: k.status })),
        licences: deviceSeats.flatMap((x) => {
          const l = seatLicences.find((y) => y.id === x.licenceId);
          return l ? [{ id: l.id, seatId: x.id, software: l.software, softwareVersion: l.softwareVersion, expiresOn: l.expiresOn ? iso(l.expiresOn) : null, givenOn: iso(x.givenOn) }] : [];
        }),
        bookings: bookings.map((b) => {
          const p = bookers.find((x) => x.personId === b.personId);
          return { id: b.id, person: p ? displayName(p) : 'Someone', startsOn: iso(b.startsOn), endsOn: iso(b.endsOn), status: b.status, overdue: b.status === 'out' && iso(b.endsOn) < todayIst() };
        }),
        tickets: { count: ticketCount, rows: seen.map((t) => ({ id: t.id, number: t.number, subject: t.subject, state: t.systemState, raisedAt: t.createdAt.toISOString() })) },
      };
    });
  }

  /** PPL-03 Assets tab: what one person holds now, read-only: themselves, asset.view over the asset, or their managers. */
  async personAssets(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: employeeId }, select: { id: true, personId: true } });
      if (!emp) throw new NotFoundException('Not found');
      const own = await ownOf(tx, c, v);
      const team = own.employeeId !== emp.id && covers(await implicitPeriods(tx, c, own.employeeId, emp.id), todayIst());
      const self = own.employeeId === emp.id;
      const open = await tx.assetAssignment.findMany({ where: { organizationId: org, personId: emp.personId, returnedOn: null }, orderBy: { issuedOn: 'asc' } });
      const assets = await tx.asset.findMany({ where: { organizationId: org, id: { in: open.map((o) => o.assetId) } } });
      const shown = assets.filter((a) => self || team || this.reachesAsset(v, 'asset.view', a));
      if (!self && !team && !v.grants.has('asset.view')) throw new NotFoundException('Not found');
      return {
        rows: open.flatMap((o) => {
          const a = shown.find((x) => x.id === o.assetId);
          return a ? [{ tag: a.tag, name: a.name, issuedOn: iso(o.issuedOn), condition: o.issueCondition, acknowledged: Boolean(o.ackEvidence) }] : [];
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
      const cur = id ? await this.assetOr404(tx, org, v, id, 'asset.manage') : null;
      // Answer 2712: the category comes from the company list (an asset may keep a category retired since).
      const cats = await this.categoriesIn(tx, org, c.userId ?? null);
      const wanted = dto.category?.trim().toLowerCase();
      const cat = cats.find((x) => (dto.categoryId ? x.id === dto.categoryId : x.name.toLowerCase() === wanted) && (!x.retiredAt || x.id === cur?.categoryId));
      if (!cat) throw new BadRequestException('Choose a category from the list in Settings › Assets.');
      // Answer 2716: a supplier from the IT and Admin list (an asset may keep a supplier retired since); left out: unchanged.
      if (dto.supplierId) {
        const sup = await tx.itSupplier.findFirst({ where: { organizationId: org, id: dto.supplierId }, select: { retiredAt: true } });
        if (!sup || (sup.retiredAt && dto.supplierId !== cur?.supplierId)) throw new BadRequestException('Choose a supplier from the list.');
      }
      const data = { categoryId: cat.id, category: cat.name, name: dto.name.trim(), tag: dto.tag.trim(), serial: dto.serial?.trim() || null, ...place, purchasedOn: dto.purchasedOn ? asDate(dto.purchasedOn) : null, cost: dto.cost ? new Prisma.Decimal(dto.cost) : null, maker: dto.maker?.trim() || null, model: dto.model?.trim() || null, invoiceNumber: dto.invoiceNumber?.trim() || null, warrantyMonths: dto.warrantyMonths ?? null, ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}) };
      try {
        if (!id) {
          const a = await tx.asset.create({ data: { organizationId: org, ...data, createdBy: c.userId ?? null } });
          await audit(tx, c, 'asset.added', 'asset', a.id, { tag: a.tag, category: a.category, categoryId: cat.id, supplierId: a.supplierId });
          return { id: a.id };
        }
        if (!cur) throw new NotFoundException('No such asset.');
        if (dto.status && dto.status !== cur.status && cur.status === 'assigned') throw new ConflictException('Take the asset back before changing its status.');
        // Answer 2715: a bookable asset with bookings to come stays in stock until they are cancelled.
        if (dto.status && dto.status !== cur.status && dto.status !== 'in_stock' && (await tx.assetBooking.count({ where: { organizationId: org, assetId: cur.id, status: { in: ['pending', 'booked'] } } }))) throw new ConflictException('This asset has bookings to come. Cancel them before changing its status.');
        const n = await tx.asset.updateMany({ where: { organizationId: org, id, version: dto.version }, data: { ...data, ...(dto.status && cur.status !== 'assigned' ? { status: dto.status } : {}), version: { increment: 1 } } });
        if (!n.count) throw new ConflictException('Someone else changed this asset. Reload it.');
        await audit(tx, c, 'asset.updated', 'asset', id, { status: dto.status ?? cur.status, ...(dto.supplierId !== undefined && dto.supplierId !== cur.supplierId ? { supplier: { from: cur.supplierId, to: dto.supplierId } } : {}) });
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
      // IT assets answer 2715: a bookable asset goes out only through a booking (so a booked one is never issued to someone else).
      if (a.bookable) throw new ConflictException('This asset is bookable. Hand it over from its booking, or make it not bookable first.');
      if (a.status !== 'in_stock') throw new ConflictException(a.status === 'assigned' ? 'This asset is already with someone. Take it back first.' : 'Only an asset in stock can be issued.');
      const emp = await tx.employee.findFirst({ where: { organizationId: org, id: dto.employeeId } });
      if (!emp || !(await tx.employment.findFirst({ where: { organizationId: org, employeeId: emp.id, exitedOn: null }, select: { id: true } }))) throw new BadRequestException('Choose a current employee.');
      if (dto.issuedOn > todayIst()) throw new BadRequestException('The issue date cannot be in the future.');
      return this.issueIn(tx, c, a, emp, dto.issuedOn, dto.condition);
    });
    await this.notifyIssued(ctx, assetId, res);
    return { ok: true };
  }

  /** Records an issue of an in-stock asset to a current employee (the register's Issue, and a booking's hand-over, answer 2715). */
  async issueIn(tx: Tx, c: CompanyContext, a: { id: string; name: string }, emp: { id: string; personId: string; userId: string | null }, issuedOn: string, condition: string) {
    const org = c.organizationId;
    // Settings 2.8: with acknowledgement "None" the person has nothing to confirm (recorded as such).
    const ackNone = (await companySetting(tx, c, 'asset.ack_method')) === 'none';
    try {
      const x = await tx.assetAssignment.create({ data: { organizationId: org, assetId: a.id, personId: emp.personId, issuedOn: asDate(issuedOn), issueCondition: condition.trim(), issuedBy: c.userId ?? null, ...(ackNone ? { ackEvidence: { method: 'none', at: new Date().toISOString() } } : {}) } });
      await tx.asset.update({ where: { id: a.id }, data: { status: 'assigned', version: { increment: 1 } } });
      await audit(tx, c, 'asset.assigned', 'asset', a.id, { assignmentId: x.id, employeeId: emp.id });
      await tx.eventOutbox.create({ data: { organizationId: org, eventType: 'asset.assigned', payload: { assetId: a.id, assignmentId: x.id, personId: emp.personId } } });
      // Someone already leaving: the asset joins their clearance list.
      const k = await tx.exitCase.findFirst({ where: { organizationId: org, personId: emp.personId, status: 'accepted' }, select: { id: true } });
      if (k) await this.exits.assetItemsIn(tx, org, k.id, emp.personId, c.userId ?? null);
      return { assignmentId: x.id, userId: emp.userId, name: a.name, ackNone };
    } catch (e) {
      // The database keeps one open assignment per asset.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This asset is already with someone. Take it back first.');
      throw e;
    }
  }

  /** Tells the person an asset was issued to them (after the transaction). */
  async notifyIssued(ctx: TenantContext, assetId: string, res: { userId: string | null; name: string; ackNone: boolean }) {
    if (!res.userId) return;
    await this.notifications
      .notifySystem(ctx, [res.userId], 'asset.assigned', { entityType: 'asset', entityId: assetId, contextText: `${res.name} was issued to you`, linkPath: '/yx/me/assets' }, { subject: 'A company asset was issued to you', html: res.ackNone ? '<p>A company asset was issued to you. You can see it in YukthiX under My assets.</p>' : '<p>A company asset was issued to you. Please confirm you received it in YukthiX.</p>' })
      .catch(() => undefined);
  }

  async takeBack(ctx: TenantContext, user: ScopeUser, assetId: string, dto: { returnedOn: string; condition: string; status: 'in_stock' | 'in_repair' | 'lost'; recoveryAmount?: string | null }) {
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
      // IT assets answer 2715: taking back a booked asset ends its booking (the register and the bookings stay true).
      await tx.assetBooking.updateMany({ where: { organizationId: org, assignmentId: x.id, status: 'out' }, data: { status: 'returned', version: { increment: 1 } } });
      // A recovery (damage or loss, founder 24 Oct 2026) signs the leaver's clearance item off with it: an F&F recovery line.
      const recovery = dto.recoveryAmount && Number(dto.recoveryAmount) > 0 ? dto.recoveryAmount : null;
      if (recovery && (await companySetting(tx, c, 'asset.recovery_to_fnf')) !== 'on') throw new BadRequestException('Recovery to F&F is off in Settings › Assets.');
      if (recovery) {
        const items = await tx.clearanceItem.findMany({ where: { organizationId: org, assetAssignmentId: x.id, status: 'open' } });
        if (!items.length) throw new BadRequestException('A recovery goes on a leaver’s F&F; this person is not leaving.');
        for (const i of items) {
          await tx.clearanceItem.update({ where: { id: i.id }, data: { status: 'cleared', note: `${lost ? 'Not returned' : `Returned on ${dto.returnedOn}`}: ${dto.condition.trim()}`.slice(0, 1000), recoveryAmount: new Prisma.Decimal(recovery), recoveryReason: (lost ? `Not returned: ${dto.condition.trim()}` : dto.condition.trim()).slice(0, 300), signedOffBy: c.userId ?? null, signedOffAt: new Date(), version: { increment: 1 } } });
          await freezeSettlementIn(tx, c, i.exitCaseId, 'recovery');
          await this.maybeClearedIn(tx, c, i.exitCaseId);
        }
      }
      // Returning closes its clearance item; a lost asset leaves the item open for a recovery.
      if (!lost && !recovery) {
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
      if (!own.personId) return { rows: [], seats: [] };
      const open = await tx.assetAssignment.findMany({ where: { organizationId: c.organizationId, personId: own.personId, returnedOn: null }, orderBy: { issuedOn: 'desc' } });
      const assets = await tx.asset.findMany({ where: { organizationId: c.organizationId, id: { in: open.map((o) => o.assetId) } } });
      // Answer 2718: the licence seats given to me.
      const mine = await tx.assetLicenceSeat.findMany({ where: { organizationId: c.organizationId, personId: own.personId, freedOn: null }, orderBy: { givenOn: 'desc' } });
      const licences = await tx.assetLicence.findMany({ where: { organizationId: c.organizationId, id: { in: mine.map((x) => x.licenceId) } } });
      const seats = mine.map((x) => { const l = licences.find((y) => y.id === x.licenceId)!; return { seatId: x.id, software: l.software, softwareVersion: l.softwareVersion, expiresOn: l.expiresOn ? iso(l.expiresOn) : null, givenOn: iso(x.givenOn) }; });
      return { seats, rows: open.map((o) => { const a = assets.find((x) => x.id === o.assetId)!; return { assignmentId: o.id, name: a.name, category: a.category, tag: a.tag, serial: a.serial, issuedOn: iso(o.issuedOn), condition: o.issueCondition, acknowledgedAt: (o.ackEvidence as { at?: string } | null)?.at ?? null, ackNone: (o.ackEvidence as { method?: string } | null)?.method === 'none' }; }) };
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
