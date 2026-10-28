import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '@exam-platform/shared';
import { audit, CompanyContext, Tx } from '../org-structure/org-structure.service';
import { asDate, isoDate, todayIst } from '../org-structure/org-validation';
import { displayName, EmployeeHistoryService, Viewer } from '../employee-history/employee-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { settingFor } from './probation';
import type { PreclearanceDto, TradeReportDto } from './person-panels.dto';

// PPL-44 Trading pre-clearance (SEBI PIT Regulations 2015, Sch. B; Confidential). A designated person asks before
// trading; the compliance officer (compliance.declaration.manage in scope, never on their own request) approves or
// rejects. An approval is valid for the company's number of trading days (weekdays; exchange holidays are not known
// here), then the person reports the trade with its contract note. Unreported approvals show as expired to both.

const KEY = 'compliance.declaration.manage';
type Row = Prisma.TradePreclearanceGetPayload<object>;

/** The day `days` trading days after `from` (weekdays; `from` itself counts when it is one). */
export function tradingDaysFrom(from: string, days: number): string {
  let d = asDate(from);
  let left = days;
  for (;;) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && --left === 0) return isoDate(d);
    d = new Date(d.getTime() + 86_400_000);
  }
}

@Injectable()
export class PreclearanceService {
  constructor(
    private readonly history: EmployeeHistoryService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The company's rules for a person's legal entity (the company-wide values when there is no person). */
  private async rules(tx: Tx, c: CompanyContext, employeeId: string | null) {
    const job = employeeId ? await tx.employment.findFirst({ where: { organizationId: c.organizationId, employeeId }, orderBy: { joinedOn: 'desc' }, select: { legalEntityId: true } }) : null;
    const scope = { legalEntityId: job?.legalEntityId ?? '' };
    return {
      threshold: Number(await settingFor(tx, c, 'bfsi.preclearance_threshold', scope)),
      validDays: Number(await settingFor(tx, c, 'bfsi.preclearance_valid_days', scope)),
      decideDays: Number(await settingFor(tx, c, 'bfsi.preclearance_decide_days', scope)),
    };
  }

  private view(r: Row, names: Map<string, string>) {
    const today = todayIst();
    const status = r.status === 'pending' ? 'Pending' : r.status === 'rejected' ? 'Rejected' : r.reportedAt ? 'Done' : isoDate(r.validUntil!) < today ? 'Expired' : 'Approved';
    return {
      id: r.id,
      employeeId: r.employeeId,
      name: names.get(r.employeeId) ?? null,
      referenceNo: r.referenceNo,
      security: r.security,
      side: r.side,
      quantity: r.quantity,
      value: r.value.toString(),
      status,
      requestedAt: r.createdAt.toISOString(),
      decidedBy: r.decidedBy ? (names.get(r.decidedBy) ?? null) : null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      validUntil: r.validUntil ? isoDate(r.validUntil) : null,
      tradedOn: r.tradedOn ? isoDate(r.tradedOn) : null,
      tradedQuantity: r.tradedQuantity,
    };
  }

  private async names(tx: Tx, c: CompanyContext, rows: Row[]) {
    const people = await tx.employee.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.employeeId) } } });
    const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: rows.flatMap((r) => (r.decidedBy ? [r.decidedBy] : [])) } }, select: { id: true, name: true, email: true } });
    return new Map<string, string>([...people.map((p) => [p.id, displayName(p)] as [string, string]), ...users.map((u) => [u.id, u.name || u.email] as [string, string])]);
  }

  private async me(tx: Tx, c: CompanyContext, v: Viewer) {
    const employeeId = await this.history.ownEmployeeId(tx, c, v);
    if (!employeeId || v.actingForOther) throw new NotFoundException('You have no employee record in this company.');
    if (!(await tx.bfsiDesignation.findUnique({ where: { organizationId_employeeId: { organizationId: c.organizationId, employeeId } } }))) throw new ForbiddenException('Only designated persons ask for pre-clearance.');
    return employeeId;
  }

  /** My requests, newest first, and the company's rules. */
  my(ctx: TenantContext, v: Viewer) {
    return this.history.run(ctx, async (tx, c) => {
      const employeeId = await this.me(tx, c, v);
      const rows = await tx.tradePreclearance.findMany({ where: { organizationId: c.organizationId, employeeId }, orderBy: { createdAt: 'desc' }, take: 20 });
      const names = await this.names(tx, c, rows);
      const { personId } = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: employeeId }, select: { personId: true } });
      // personId: where the contract note is uploaded (my documents).
      return { personId, rules: await this.rules(tx, c, employeeId), requests: rows.map((r) => this.view(r, names)) };
    });
  }

  async request(ctx: TenantContext, v: Viewer, dto: PreclearanceDto) {
    const out = await this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const employeeId = await this.me(tx, c, v);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preclearance:${org}`}))`;
      const year = todayIst().slice(0, 4);
      const n = await tx.tradePreclearance.count({ where: { organizationId: org, referenceNo: { startsWith: `PC-${year}-` } } });
      const row = await tx.tradePreclearance.create({
        data: { organizationId: org, employeeId, referenceNo: `PC-${year}-${String(n + 1).padStart(4, '0')}`, security: dto.security.trim(), side: dto.side, quantity: dto.quantity, value: new Prisma.Decimal(dto.value), requestedBy: v.userId! },
      });
      await audit(tx, c, 'compliance.preclearance.requested', 'employee', employeeId, { id: row.id, referenceNo: row.referenceNo });
      return { id: row.id, referenceNo: row.referenceNo };
    });
    return out;
  }

  /** The trade made under an approval, with its contract note (my own document of that type). */
  report(ctx: TenantContext, v: Viewer, id: string, dto: TradeReportDto) {
    return this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const employeeId = await this.me(tx, c, v);
      const r = await tx.tradePreclearance.findFirst({ where: { organizationId: org, id, employeeId } });
      if (!r) throw new NotFoundException('Not found');
      if (r.status !== 'approved' || r.reportedAt) throw new ConflictException(r.reportedAt ? 'This trade is already reported.' : 'Only an approved pre-clearance has a trade to report.');
      if (dto.tradedOn < isoDate(r.decidedAt!) || dto.tradedOn > isoDate(r.validUntil!) || dto.tradedOn > todayIst()) throw new BadRequestException(`The trade must be made between ${isoDate(r.decidedAt!)} and ${isoDate(r.validUntil!)}, and not in the future.`);
      if (dto.quantity > r.quantity) throw new BadRequestException(`You were cleared for ${r.quantity}.`);
      const e = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: employeeId }, select: { personId: true } });
      if (!(await tx.document.findFirst({ where: { organizationId: org, id: dto.contractNoteDocumentId, personId: e.personId, typeKey: 'contract_note' } }))) throw new BadRequestException('That is not your contract note.');
      await tx.tradePreclearance.update({ where: { id }, data: { tradedOn: asDate(dto.tradedOn), tradedQuantity: dto.quantity, contractNoteDocumentId: dto.contractNoteDocumentId, reportedAt: new Date() } });
      await audit(tx, c, 'compliance.preclearance.reported', 'employee', employeeId, { id, referenceNo: r.referenceNo });
      return { reported: true };
    });
  }

  /** The compliance officer's queue: requests of the designated persons the key reaches. */
  queue(ctx: TenantContext, v: Viewer) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else');
    return this.history.run(ctx, async (tx, c) => {
      const rows = await tx.tradePreclearance.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'desc' }, take: 300 });
      const reached = await this.history.reachedIds(tx, c, v, KEY, [...new Set(rows.map((r) => r.employeeId))]);
      const shown = rows.filter((r) => reached.has(r.employeeId));
      const names = await this.names(tx, c, shown);
      const own = await this.history.ownEmployeeId(tx, c, v);
      return { rules: await this.rules(tx, c, own ?? shown[0]?.employeeId ?? null), rows: shown.map((r) => this.view(r, names)) };
    });
  }

  async decide(ctx: TenantContext, v: Viewer, id: string, approve: boolean, note: string | undefined) {
    if (v.actingForOther) throw new ForbiddenException('Not available while acting for someone else');
    const out = await this.history.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preclearance:${org}:${id}`}))`;
      const r = await tx.tradePreclearance.findFirst({ where: { organizationId: org, id } });
      if (!r || !(await this.history.reaches(tx, c, v, KEY, r.employeeId, todayIst()))) throw new NotFoundException('Not found');
      if (r.requestedBy === v.userId || (await this.history.ownEmployeeId(tx, c, v)) === r.employeeId) throw new ForbiddenException('Someone else decides your own pre-clearance.');
      if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}.`);
      if (!approve && !note?.trim()) throw new BadRequestException('Say why it is rejected.');
      const validUntil = approve ? tradingDaysFrom(todayIst(), (await this.rules(tx, c, r.employeeId)).validDays) : null;
      await tx.tradePreclearance.update({ where: { id }, data: { status: approve ? 'approved' : 'rejected', decidedBy: v.userId, decidedAt: new Date(), decisionNote: note?.trim() || null, validUntil: validUntil ? asDate(validUntil) : null } });
      await audit(tx, c, approve ? 'compliance.preclearance.approved' : 'compliance.preclearance.rejected', 'employee', r.employeeId, { id, referenceNo: r.referenceNo });
      const user = (await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: r.employeeId }, select: { userId: true } })).userId;
      return { user, text: approve ? `Pre-clearance ${r.referenceNo} approved, valid until ${validUntil}` : `Pre-clearance ${r.referenceNo} rejected: ${note!.trim()}`, employeeId: r.employeeId };
    });
    if (out.user && v.userId) void this.notifications.notify(ctx, v.userId, [out.user], 'workflow.approval.decided', { entityType: 'employee', entityId: out.employeeId, contextText: out.text, linkPath: '/yx/me/pre-clearance' }).catch(() => undefined);
    return { decided: true };
  }
}
