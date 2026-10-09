import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { audit, inCompany } from '../org-structure/org-structure.service';
import type { ScopeUser } from '../access/scope';
import { asDate } from '../time/time-core';
import { addDays } from '../time/time-maths';
import { GoLiveDto, ImportDto } from './dto-5b';
import { entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';

// PAY-2.12: opening balances, previous-employer income (Form 12B) and as-paid lines from the old system, staged then
// committed (rows are checked and kept with their hash; nothing lands until commit). Imported as-paid months become
// locked pay periods, so attendance there no longer changes. The go-live check lists people and months still missing.
// There is no P15 import pipeline yet: these batches are its payroll part and move onto it when it exists.

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const FY = /^\d{4}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const HEADS = new Set(['gross', 'exempt_allowances', 'standard_deduction', 'pt', 'pf_employee', 'vpf', 'chapter_via', 'tds', 'perquisites']);
const MAX_ERRORS = 200;

type Staged = Record<string, string> & { employeeId: string; employmentId: string };

@Injectable()
export class PayImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** Checks every row and keeps the batch as staged; errors are listed by row number. */
  async stage(ctx: TenantContext, user: ScopeUser, dto: ImportDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.import.run', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      const codes = [...new Set(dto.rows.map((r) => String(r.employeeCode ?? '').trim()))];
      const emps = await tx.employment.findMany({ where: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, employeeCode: { in: codes } }, select: { id: true, employeeId: true, employeeCode: true } });
      const byCode = new Map(emps.map((e) => [e.employeeCode.toLowerCase(), e]));
      const components = dto.kind === 'as_paid_lines' ? new Set((await tx.payComponent.findMany({ where: { organizationId: c.organizationId }, select: { code: true } })).map((x) => x.code)) : new Set<string>();
      const errors: { row: number; message: string }[] = [];
      const staged: Staged[] = [];
      dto.rows.forEach((raw, i) => {
        const row = i + 1;
        const fail = (message: string) => errors.length < MAX_ERRORS && errors.push({ row, message });
        const r = Object.fromEntries(Object.entries(raw).map(([k, x]) => [k, String(x ?? '').trim()]));
        const e = byCode.get((r.employeeCode ?? '').toLowerCase());
        if (!e) return fail('No employee with that code in this legal entity.');
        if (dto.kind === 'opening_balances') {
          if (!FY.test(r.fy ?? '')) return fail('fy is like 2025-26.');
          if (!HEADS.has(r.head ?? '')) return fail(`head is one of ${[...HEADS].join(', ')}.`);
          if (!MONEY.test(r.amount ?? '')) return fail('amount is a number with up to 2 decimals.');
          staged.push({ employeeId: e.employeeId, employmentId: e.id, fy: r.fy, head: r.head, amount: r.amount });
        } else if (dto.kind === 'as_paid_lines') {
          if (!MONTH.test(r.month ?? '')) return fail('month is like 2026-03.');
          if (!components.has(r.componentCode ?? '')) return fail('componentCode is not in the component library.');
          if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(r.amount ?? '')) return fail('amount is a number with up to 2 decimals.');
          staged.push({ employeeId: e.employeeId, employmentId: e.id, month: r.month, componentCode: r.componentCode, amount: r.amount });
        } else {
          if (!FY.test(r.fy ?? '')) return fail('fy is like 2025-26.');
          if (!TAN.test(r.employerTan ?? '')) return fail('employerTan is the previous employer’s TAN (like ABCD12345E).');
          for (const k of ['gross', 'exemptions', 'tds']) if ((r[k] ?? '') !== '' && !MONEY.test(r[k])) return fail(`${k} is a number with up to 2 decimals.`);
          if (!r.gross) return fail('gross is required.');
          staged.push({ employeeId: e.employeeId, employmentId: e.id, fy: r.fy, employerTan: r.employerTan, gross: r.gross, exemptions: r.exemptions || '0', tds: r.tds || '0' });
        }
      });
      const sha256 = createHash('sha256').update(JSON.stringify(dto.rows)).digest('hex');
      const b = await tx.payImportBatch.create({ data: { organizationId: c.organizationId, legalEntityId: dto.legalEntityId, kind: dto.kind, rows: dto.rows.length, errors: errors as unknown as Prisma.InputJsonValue, staged: staged as unknown as Prisma.InputJsonValue, sha256, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.import.staged', 'pay_import_batch', b.id, { kind: dto.kind, rows: dto.rows.length, errors: errors.length, sha256 });
      return { id: b.id, kind: b.kind, rows: b.rows, valid: staged.length, errors, status: b.status };
    });
  }

  /** Lands a staged batch with no errors. As-paid months become locked pay periods of the entity. */
  async commit(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await payScope(tx, await entitiesFor(tx, c, v, 'payroll.import.run'));
      const b = await tx.payImportBatch.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!b) throw new NotFoundException('Not found');
      if (b.status !== 'staged') throw new ConflictException(`This batch is ${b.status}.`);
      if ((b.errors as unknown[]).length) throw new ConflictException('Fix the rows with errors and stage the file again.');
      const org = c.organizationId;
      const base = { organizationId: org, legalEntityId: b.legalEntityId, batchId: b.id };
      const rows = b.staged as unknown as Staged[];
      try {
        if (b.kind === 'opening_balances') await tx.openingBalance.createMany({ data: rows.map((r) => ({ ...base, employeeId: r.employeeId, employmentId: r.employmentId, fy: r.fy, head: r.head, amount: r.amount })) });
        else if (b.kind === 'form12b') await tx.previousEmploymentIncome.createMany({ data: rows.map((r) => ({ ...base, employeeId: r.employeeId, employmentId: r.employmentId, fy: r.fy, employerTan: r.employerTan, gross: r.gross, exemptions: r.exemptions, tds: r.tds })) });
        else await tx.asPaidLine.createMany({ data: rows.map((r) => ({ ...base, employeeId: r.employeeId, employmentId: r.employmentId, periodStart: asDate(`${r.month}-01`), componentCode: r.componentCode, amount: r.amount })) });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Some of these rows were already imported by an earlier batch.');
        throw e;
      }
      const months = b.kind === 'as_paid_lines' ? [...new Set(rows.map((r) => r.month))].sort() : [];
      for (const m of months) await this.lockImported(tx, org, b.legalEntityId, m, v.userId!);
      await tx.payImportBatch.update({ where: { id }, data: { status: 'committed', committedBy: v.userId, committedAt: new Date() } });
      await audit(tx, c, 'payroll.import.committed', 'pay_import_batch', id, { kind: b.kind, rows: rows.length, lockedMonths: months });
      return { id, status: 'committed', rows: rows.length, lockedMonths: months };
    });
  }

  private async lockImported(tx: Prisma.TransactionClient, org: string, entityId: string, month: string, by: string) {
    const start = `${month}-01`;
    const end = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10), -1);
    const reason = 'Paid in the previous payroll system (imported as-paid month)';
    const p = await tx.payPeriod.findFirst({ where: { organizationId: org, legalEntityId: entityId, payGroupId: null, periodStart: asDate(start) } });
    if (p && p.stage !== 'open') return;
    const row = p
      ? await tx.payPeriod.update({ where: { id: p.id }, data: { stage: 'locked', lockedAt: new Date(), lockedBy: by, changedBy: by, changedAt: new Date(), reason, version: { increment: 1 } } })
      : await tx.payPeriod.create({ data: { organizationId: org, legalEntityId: entityId, periodStart: asDate(start), periodEnd: asDate(end), stage: 'locked', lockedAt: new Date(), lockedBy: by, changedBy: by, reason } });
    await tx.periodLockEvent.create({ data: { organizationId: org, payPeriodId: row.id, fromStage: 'open', toStage: 'locked', byUser: by, reason } });
  }

  /** Before go-live: every person employed in the financial year's earlier months has as-paid lines for each of them. */
  async goLiveCheck(ctx: TenantContext, user: ScopeUser, dto: GoLiveDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await requireEntity(tx, c, v, 'payroll.import.run', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      const [y, m] = dto.goLiveMonth.split('-').map(Number);
      const fyStart = `${m >= 4 ? y : y - 1}-04-01`;
      const missing = await tx.$queryRaw<{ employeeCode: string; month: string }[]>`
        SELECT em.employee_code AS "employeeCode", to_char(g.month, 'YYYY-MM') AS month
        FROM generate_series(${fyStart}::date, (${`${dto.goLiveMonth}-01`}::date - interval '1 month'), interval '1 month') AS g(month)
        JOIN employments em ON em.organization_id = ${c.organizationId}::uuid AND em.legal_entity_id = ${dto.legalEntityId}::uuid
          AND em.joined_on <= (g.month + interval '1 month' - interval '1 day') AND (em.exited_on IS NULL OR em.exited_on >= g.month)
        WHERE NOT EXISTS (SELECT 1 FROM as_paid_lines a WHERE a.organization_id = em.organization_id AND a.employment_id = em.id AND a.period_start = g.month)
        ORDER BY 2, 1 LIMIT 500`;
      return { fyStart, goLiveMonth: dto.goLiveMonth, ready: missing.length === 0, missing };
    });
  }
}
