import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { Tx, audit, inCompany } from '../org-structure/org-structure.service';
import type { ScopeUser } from '../access/scope';
import { asDate, dateOf, leaveVersionBook } from '../time/time-core';
import type { CensusDto, ValuationResultDto } from './dto-5i';
import { ExchangeFilesService } from './exchange-files.service';
import { PayFileStore, sha256 } from './pay-file-store';
import { entitiesFor, payScope, payViewer, requireEntity, requireSelf } from './pay-access';
import { serviceYearsBetween } from './special';

// Batch 5i, PAY-9.03 actuarial census and provisions (M03 YX-PAY-57, J24). Payroll makes the census of a legal entity as
// at a valuation date (everyone employed then and the year's leavers: dates of birth, service, the basic and DA, leave
// balances) as an XLSX kept as an exchange file (encrypted, hashed, downloaded through the audited link); the actuary's
// closing obligation is recorded with their report, and the provision journal (closing less the last booked closing) is
// posted by someone other than the person who recorded it.
// DECISION NEEDED: the journal's accounts are named here; mapping them to the company's ledger codes is the GP-PAY-1
// ledger mapping's job once it has gratuity and leave provision keys.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ACCOUNT = { gratuity: ['Gratuity expense (actuarial)', 'Provision for gratuity'], leave: ['Leave encashment expense (actuarial)', 'Provision for leave encashment'] } as const;

@Injectable()
export class ActuarialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly exchange: ExchangeFilesService,
    private readonly files: PayFileStore,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  /** Monthly basic and DA in force on a day for each employment. */
  private async basicDa(tx: Tx, org: string, employmentIds: string[], on: Date) {
    const comps = await tx.compensation.findMany({ where: { organizationId: org, employmentId: { in: employmentIds }, supersededAt: null, validFrom: { lte: on }, OR: [{ validTo: null }, { validTo: { gte: on } }] } });
    const pkgs = await tx.compensationPackage.findMany({ where: { organizationId: org, changeId: { in: comps.map((x) => x.changeId) } } });
    const codes = await tx.payComponent.findMany({ where: { organizationId: org, code: { in: ['basic', 'da'] } }, select: { id: true } });
    const lines = await tx.compensationLine.findMany({ where: { organizationId: org, packageId: { in: pkgs.map((p) => p.id) }, componentId: { in: codes.map((x) => x.id) } } });
    return (employmentId: string) => {
      const comp = comps.find((x) => x.employmentId === employmentId);
      const pkg = comp ? pkgs.find((p) => p.changeId === comp.changeId) : undefined;
      return pkg ? lines.filter((l) => l.packageId === pkg.id).reduce((t, l) => t.add(l.monthly), D(0)) : D(0);
    };
  }

  async census(ctx: TenantContext, user: ScopeUser, dto: CensusDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'payroll.special.manage', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      const asOf = asDate(dto.asOf);
      const fyStart = asDate(`${Number(dto.asOf.slice(5, 7)) >= 4 ? dto.asOf.slice(0, 4) : Number(dto.asOf.slice(0, 4)) - 1}-04-01`);
      const ems = await tx.employment.findMany({ where: { organizationId: org, legalEntityId: dto.legalEntityId, joinedOn: { lte: asOf }, OR: [{ exitedOn: null }, { exitedOn: { gte: fyStart } }] }, orderBy: { employeeCode: 'asc' } });
      const people = await tx.employeePersonalDetails.findMany({ where: { organizationId: org, employeeId: { in: ems.map((e) => e.employeeId) } }, select: { employeeId: true, dateOfBirth: true, gender: true } });
      const wage = await this.basicDa(tx, org, ems.map((e) => e.id), asOf);
      // Paid as of the valuation date (TIM-27: pay is dated with the leave type's versions).
      const payOf = await leaveVersionBook(tx, org);
      const types = (await tx.leaveType.findMany({ where: { organizationId: org, active: true }, orderBy: { code: 'asc' } })).filter((t) => payOf(t.id, dto.asOf).paid);
      const ledger = await tx.leaveLedgerEntry.groupBy({ by: ['employeeId', 'leaveTypeId'], where: { organizationId: org, employeeId: { in: ems.map((e) => e.employeeId) }, entryOn: { lte: asOf } }, _sum: { days: true } });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Census');
      ws.addRow(['employee_code', 'date_of_birth', 'gender', 'joined_on', 'exited_on', 'service_years', 'basic_da_monthly', ...types.map((t) => `leave_${String(t.code).toLowerCase()}`)]);
      for (const e of ems) {
        const p = people.find((x) => x.employeeId === e.employeeId);
        const end = e.exitedOn && e.exitedOn < asOf ? e.exitedOn : asOf;
        ws.addRow([String(e.employeeCode), p?.dateOfBirth ? dateOf(p.dateOfBirth) : '', p?.gender ?? '', dateOf(e.joinedOn), e.exitedOn ? dateOf(e.exitedOn) : '', serviceYearsBetween(dateOf(e.joinedOn), dateOf(end)), wage(e.id).toFixed(2), ...types.map((t) => ledger.find((l) => l.employeeId === e.employeeId && l.leaveTypeId === t.id)?._sum.days?.toFixed(2) ?? '0.00')]);
      }
      const data = Buffer.from(await wb.xlsx.writeBuffer());
      const f = await this.exchange.generateIn(tx, c, { legalEntityId: dto.legalEntityId, kind: 'census', ownerType: 'legal_entity', ownerId: dto.legalEntityId, periodStart: null, fileName: `actuarial-census-${dto.asOf}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data, rows: ems.length, totals: { people: String(ems.length) }, by: v.userId! });
      const row = await tx.actuarialCensusExport.create({ data: { organizationId: org, legalEntityId: dto.legalEntityId, asOf, standard: dto.standard, fileRef: f.id, sha256: f.sha256, rowCount: ems.length, createdBy: v.userId! } });
      await audit(tx, c, 'payroll.actuarial.census_made', 'actuarial_census_export', row.id, { asOf: dto.asOf, standard: dto.standard, rows: ems.length, fileId: f.id });
      return { id: row.id, fileId: f.id, rows: ems.length, sha256: f.sha256 };
    });
  }

  async list(ctx: TenantContext, user: ScopeUser, entityId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set([...(await entitiesFor(tx, c, v, 'payroll.special.manage')), ...(await entitiesFor(tx, c, v, 'payroll.journal.export'))])];
      if (!ids.includes(entityId)) throw new NotFoundException('Not found');
      await payScope(tx, [entityId]);
      const org = c.organizationId;
      const censuses = await tx.actuarialCensusExport.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { createdAt: 'desc' }, take: 20 });
      const valuations = await tx.actuarialValuation.findMany({ where: { organizationId: org, legalEntityId: entityId }, orderBy: { valuedOn: 'desc' }, take: 40 });
      return {
        censuses: censuses.map((x) => ({ id: x.id, asOf: dateOf(x.asOf), standard: x.standard, rows: x.rowCount, fileId: x.fileRef, createdAt: x.createdAt })),
        valuations: valuations.map((x) => ({ id: x.id, valuedOn: dateOf(x.valuedOn), standard: x.standard, kind: x.kind, opening: x.opening.toFixed(2), closing: x.closing.toFixed(2), delta: x.provisionDelta.toFixed(2), journal: x.journal, status: x.status, madeByMe: x.createdBy === v.userId, hasReport: Boolean(x.reportRef) })),
      };
    });
  }

  /** The actuary's closing obligation (with their report as PDF): the journal books the change since the last posted figure. */
  async record(ctx: TenantContext, user: ScopeUser, dto: ValuationResultDto, report: Buffer | undefined) {
    const v = await this.viewer(user);
    if (report && (report.subarray(0, 5).toString('latin1') !== '%PDF-' || report.length > 10 * 1024 * 1024)) throw new BadRequestException("Attach the actuary's report as a PDF of at most 10 MB.");
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      await requireEntity(tx, c, v, 'payroll.journal.export', dto.legalEntityId);
      await payScope(tx, [dto.legalEntityId]);
      if (dto.censusId && !(await tx.actuarialCensusExport.findFirst({ where: { organizationId: org, id: dto.censusId, legalEntityId: dto.legalEntityId } }))) throw new NotFoundException('Not found');
      const last = await tx.actuarialValuation.findFirst({ where: { organizationId: org, legalEntityId: dto.legalEntityId, kind: dto.kind, status: 'posted' }, orderBy: { valuedOn: 'desc' } });
      if (last && dateOf(last.valuedOn) >= dto.asOf) throw new ConflictException(`A valuation as at ${dateOf(last.valuedOn)} is already posted.`);
      const opening = last?.closing ?? D(0);
      const delta = D(dto.closing).sub(opening);
      const [expense, provision] = ACCOUNT[dto.kind];
      const amount = delta.abs().toFixed(2);
      const journal = delta.isZero() ? [] : delta.gt(0) ? [{ account: expense, debit: amount }, { account: provision, credit: amount }] : [{ account: provision, debit: amount }, { account: expense, credit: amount }];
      const ref = report ? await this.files.put(`actuarial/${org}/${dto.legalEntityId}/${randomBytes(12).toString('hex')}.pdf`, report) : null;
      try {
        const row = await tx.actuarialValuation.create({ data: { organizationId: org, legalEntityId: dto.legalEntityId, valuedOn: asDate(dto.asOf), standard: dto.standard, kind: dto.kind, censusId: dto.censusId ?? null, opening, closing: D(dto.closing), provisionDelta: delta, reportRef: ref, reportSha256: report ? sha256(report) : null, journal: journal as unknown as Prisma.InputJsonValue, createdBy: v.userId! } });
        await audit(tx, c, 'payroll.actuarial.valuation_recorded', 'actuarial_valuation', row.id, { kind: dto.kind, asOf: dto.asOf, opening: opening.toFixed(2), closing: dto.closing, delta: delta.toFixed(2) });
        return { id: row.id, delta: delta.toFixed(2), journal };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This valuation is already recorded.');
        throw e;
      }
    });
  }

  async post(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = await entitiesFor(tx, c, v, 'payroll.journal.export');
      await payScope(tx, ids);
      await tx.$queryRaw`SELECT id FROM actuarial_valuations WHERE organization_id = ${c.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const x = await tx.actuarialValuation.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x || !ids.includes(x.legalEntityId)) throw new NotFoundException('Not found');
      if (x.status !== 'recorded') throw new ConflictException('This journal is already posted.');
      if (x.createdBy === v.userId) throw new ForbiddenException('You recorded these figures, so someone else posts the journal.');
      await tx.actuarialValuation.update({ where: { id }, data: { status: 'posted', postedBy: v.userId!, postedAt: new Date() } });
      await audit(tx, c, 'payroll.actuarial.journal_posted', 'actuarial_valuation', id, { kind: x.kind, delta: x.provisionDelta.toFixed(2) });
      return { id, status: 'posted' };
    });
  }
}
