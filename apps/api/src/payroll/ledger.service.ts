import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { tenantWide, type ScopeUser, type Viewer } from '../access/scope';
import { dateOf, monthRange } from '../time/time-core';
import type { LedgerMappingDto } from './dto-ledger';
import { NET_PAY, buildJournal, type JournalSlip, type Mapping } from './ledger';
import { entitiesFor, payScope, payViewer, requireSelf, withPayScope } from './pay-access';

// The journal with ledger mapping (founder decision GP-PAY-1, 10 Oct 2026; M03 §19.7, extends PAY-3.17): mappings at
// company, legal-entity or cost-centre level; the journal worked out from the approved payslips and today's mapping, so a
// fixed mapping shows at once; export (CSV, Tally, Zoho Books) and "mark posted" are refused while anything is unmapped.

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private async viewer(user: ScopeUser) {
    const v = await payViewer(this.prisma, this.tenantPrisma, user);
    requireSelf(v);
    return v;
  }

  private view(m: Prisma.LedgerMappingGetPayload<object>) {
    return { id: m.id, scopeType: m.scopeType, scopeId: m.scopeId, componentCode: m.componentCode, side: m.side, accountCode: m.accountCode, accountName: m.accountName, updatedAt: m.updatedAt };
  }

  /** Mappings the viewer may see: the company defaults and the overrides of the entities (and their cost centres) in scope. */
  async mappings(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const ids = [...new Set([...(await entitiesFor(tx, c, v, 'payroll.ledger.manage')), ...(await entitiesFor(tx, c, v, 'payroll.journal.export'))])];
      const ccs = (await tx.costCentre.findMany({ where: { organizationId: c.organizationId, legalEntityId: { in: ids } }, select: { id: true } })).map((x) => x.id);
      const rows = await tx.ledgerMapping.findMany({
        where: { organizationId: c.organizationId, OR: [{ scopeType: 'company' }, { scopeType: 'legal_entity', scopeId: { in: ids } }, { scopeType: 'cost_centre', scopeId: { in: ccs } }] },
        orderBy: [{ componentCode: 'asc' }, { side: 'asc' }, { scopeType: 'asc' }],
      });
      return rows.map((m) => this.view(m));
    });
  }

  /** The scope must be the viewer's: a company default needs the company-wide grant; an override, the entity in scope. */
  private async requireScope(tx: Tx, c: CompanyContext, v: Viewer, scopeType: string, scopeId: string | null) {
    if (scopeType === 'company') {
      if (!tenantWide(v, 'payroll.ledger.manage')) throw new ForbiddenException('Company defaults need payroll.ledger.manage for the whole company.');
      return;
    }
    const ids = await entitiesFor(tx, c, v, 'payroll.ledger.manage');
    const entity =
      scopeType === 'legal_entity' ? scopeId : (await tx.costCentre.findFirst({ where: { organizationId: c.organizationId, id: scopeId! }, select: { legalEntityId: true } }))?.legalEntityId;
    if (!entity || !ids.includes(entity)) throw new NotFoundException('Not found');
  }

  async setMapping(ctx: TenantContext, user: ScopeUser, dto: LedgerMappingDto) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const scopeId = dto.scopeType === 'company' ? null : (dto.scopeId ?? null);
      if (dto.scopeType !== 'company' && !scopeId) throw new BadRequestException('Say which legal entity or cost centre the override is for.');
      await this.requireScope(tx, c, v, dto.scopeType, scopeId);
      // A pay component, or a line the engine itself writes (loan instalments, court attachments, recoveries) seen on a payslip.
      const known =
        dto.componentCode === NET_PAY ||
        (await tx.payComponent.count({ where: { organizationId: org, code: dto.componentCode } })) > 0 ||
        (await withPayScope(tx, await entitiesFor(tx, c, v, 'payroll.ledger.manage'), () => tx.payslipLine.count({ where: { organizationId: org, componentCode: dto.componentCode } }))) > 0;
      if (!known) throw new BadRequestException(`${dto.componentCode} is not a pay line.`);
      const key = { organizationId: org, scopeType: dto.scopeType, scopeId, componentCode: dto.componentCode, side: dto.side };
      const old = await tx.ledgerMapping.findFirst({ where: key });
      const data = { accountCode: dto.accountCode, accountName: dto.accountName, updatedBy: v.userId!, updatedAt: new Date() };
      const row = old ? await tx.ledgerMapping.update({ where: { id: old.id }, data }) : await tx.ledgerMapping.create({ data: { ...key, ...data } });
      await audit(tx, c, 'payroll.ledger.mapped', 'ledger_mapping', row.id, { ...key, accountCode: dto.accountCode, from: old?.accountCode ?? null });
      return this.view(row);
    });
  }

  async removeMapping(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const m = await tx.ledgerMapping.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!m) throw new NotFoundException('Not found');
      await this.requireScope(tx, c, v, m.scopeType, m.scopeId);
      await tx.ledgerMapping.delete({ where: { id } });
      await audit(tx, c, 'payroll.ledger.unmapped', 'ledger_mapping', id, { scopeType: m.scopeType, scopeId: m.scopeId, componentCode: m.componentCode, side: m.side, accountCode: m.accountCode });
      return { id, removed: true };
    });
  }

  /** The run's journal from its approved payslips and today's mapping (one run the key reaches; else "not found"). */
  private async journalOf(tx: Tx, c: CompanyContext, v: Viewer, runId: string) {
    const org = c.organizationId;
    const ids = await entitiesFor(tx, c, v, 'payroll.journal.export');
    await payScope(tx, ids);
    const run = await tx.payrollRun.findFirst({ where: { organizationId: org, id: runId } });
    if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
    if (!['approved', 'paid'].includes(run.status)) throw new ConflictException('The journal is made once the payroll is approved.');
    const slips = await tx.payslip.findMany({ where: { organizationId: org, runId: run.id, calcVersion: run.calcVersion, status: 'approved' }, select: { id: true, employmentId: true } });
    const lines = await tx.payslipLine.findMany({
      where: { organizationId: org, payslipId: { in: slips.map((s) => s.id) }, kind: { in: ['earning', 'deduction', 'employer'] } },
      select: { payslipId: true, componentCode: true, kind: true, amount: true },
    });
    const asg = await tx.employeeAssignment.findMany({
      where: {
        organizationId: org,
        employmentId: { in: slips.map((s) => s.employmentId) },
        supersededAt: null,
        validFrom: { lte: run.periodEnd },
        OR: [{ validTo: null }, { validTo: { gte: run.periodEnd } }],
      },
      select: { id: true, employmentId: true },
    });
    const split = await tx.assignmentCostCentre.findMany({ where: { organizationId: org, assignmentId: { in: asg.map((a) => a.id) } } });
    const input: JournalSlip[] = slips.map((s) => {
      const a = asg.find((x) => x.employmentId === s.employmentId);
      return {
        legalEntityId: run.legalEntityId,
        costCentres: split.filter((x) => x.assignmentId === a?.id).map((x) => ({ id: x.costCentreId, percent: x.percent.toFixed(2) })),
        lines: lines.filter((l) => l.payslipId === s.id).map((l) => ({ code: l.componentCode, kind: l.kind, amount: l.amount.toFixed(2) })),
      };
    });
    const ccIds = [...new Set(split.map((x) => x.costCentreId))];
    const maps = await tx.ledgerMapping.findMany({
      where: { organizationId: org, OR: [{ scopeType: 'company' }, { scopeType: 'legal_entity', scopeId: run.legalEntityId }, { scopeType: 'cost_centre', scopeId: { in: ccIds } }] },
    });
    const journal = buildJournal(
      input,
      maps.map((m) => ({
        scopeType: m.scopeType as Mapping['scopeType'],
        scopeId: m.scopeId,
        componentCode: m.componentCode,
        side: m.side as Mapping['side'],
        accountCode: m.accountCode,
        accountName: m.accountName,
      })),
    );
    const ccNames = new Map((await tx.costCentre.findMany({ where: { organizationId: org, id: { in: ccIds } }, select: { id: true, code: true } })).map((x) => [x.id, x.code]));
    return { run, journal, ccNames };
  }

  async journal(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { run, journal, ccNames } = await this.journalOf(tx, c, v, runId);
      const j = await tx.journal.findFirst({ where: { organizationId: c.organizationId, runId } });
      return {
        runId,
        postedAt: run.postedAt,
        canPost: !journal.unmapped.length,
        unmapped: journal.unmapped,
        lines: journal.lines.map((l) => ({ ...l, costCentre: l.costCentreId ? (ccNames.get(l.costCentreId) ?? null) : null, ledger: l.accountName })),
        exports: j?.exports ?? [],
      };
    });
  }

  private refuseUnmapped(unmapped: { componentCode: string; side: string }[]) {
    if (unmapped.length)
      throw new ConflictException({
        statusCode: 409,
        code: 'JOURNAL_UNMAPPED',
        message: `Map these pay lines to ledger accounts first: ${[...new Set(unmapped.map((u) => `${u.componentCode} (${u.side})`))].slice(0, 10).join(', ')}.`,
        unmapped,
      });
  }

  /** CSV, Tally (XML vouchers) or Zoho Books (CSV journal) for the accountant; refused while anything is unmapped; recorded. */
  async exportJournal(ctx: TenantContext, user: ScopeUser, runId: string, format: 'csv' | 'tally' | 'zoho') {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { run, journal, ccNames } = await this.journalOf(tx, c, v, runId);
      this.refuseUnmapped(journal.unmapped);
      const month = dateOf(run.periodStart).slice(0, 7);
      const csvCell = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""');
      const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const cc = (id: string | null) => (id ? (ccNames.get(id) ?? '') : '');
      let file: string;
      let name: string;
      let type: string;
      if (format === 'tally') {
        const entries = journal.lines
          .map(
            (l) =>
              `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(l.accountName)}</LEDGERNAME><ISDEEMEDPOSITIVE>${D(l.debit).gt(0) ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${D(l.debit).gt(0) ? `-${l.debit}` : l.credit}</AMOUNT>${l.costCentreId ? `<CATEGORYALLOCATIONS.LIST><COSTCENTREALLOCATIONS.LIST><NAME>${xml(cc(l.costCentreId))}</NAME></COSTCENTREALLOCATIONS.LIST></CATEGORYALLOCATIONS.LIST>` : ''}</ALLLEDGERENTRIES.LIST>`,
          )
          .join('');
        file = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><VOUCHER VCHTYPE="Journal" ACTION="Create"><DATE>${monthRange(month).to.replace(/-/g, '')}</DATE><NARRATION>Payroll ${month}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
        name = `payroll-journal-${month}-tally.xml`;
        type = 'application/xml';
      } else {
        const head = format === 'zoho' ? 'Journal Date,Reference Number,Notes,Account,Account Code,Cost Centre,Debit,Credit' : 'Account code,Account,Cost centre,Debit,Credit';
        const rows = journal.lines.map((l) =>
          format === 'zoho'
            ? `${monthRange(month).to},PAYROLL-${month},"Payroll ${month}","${csvCell(l.accountName)}","${csvCell(l.accountCode)}","${csvCell(cc(l.costCentreId))}",${l.debit},${l.credit}`
            : `"${csvCell(l.accountCode)}","${csvCell(l.accountName)}","${csvCell(cc(l.costCentreId))}",${l.debit},${l.credit}`,
        );
        file = [head, ...rows].join('\r\n') + '\r\n';
        name = `payroll-journal-${month}${format === 'zoho' ? '-zoho' : ''}.csv`;
        type = 'text/csv';
      }
      const j = await tx.journal.findFirst({ where: { organizationId: c.organizationId, runId } });
      const exports = [...((j?.exports as unknown[]) ?? []), { format, at: new Date().toISOString(), by: v.userId }];
      const lines = journal.lines as unknown as Prisma.InputJsonValue;
      if (j) await tx.journal.update({ where: { id: j.id }, data: { exports: exports as Prisma.InputJsonValue, lines } });
      else await tx.journal.create({ data: { organizationId: c.organizationId, legalEntityId: run.legalEntityId, runId, lines, exports: exports as Prisma.InputJsonValue } });
      await audit(tx, c, 'payroll.journal.exported', 'payroll_run', runId, { format });
      return { file: Buffer.from(file, 'utf8'), name, contentType: type };
    });
  }

  /** "Mark posted" (P10 Q7): the run's journal is in the books; refused while anything is unmapped. */
  async markPosted(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { run, journal } = await this.journalOf(tx, c, v, runId);
      this.refuseUnmapped(journal.unmapped);
      if (run.postedAt) return { runId, postedAt: run.postedAt };
      const at = new Date();
      await tx.payrollRun.update({ where: { id: run.id }, data: { postedAt: at, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.journal.posted', 'payroll_run', run.id, { lines: journal.lines.length });
      return { runId, postedAt: at };
    });
  }
}
