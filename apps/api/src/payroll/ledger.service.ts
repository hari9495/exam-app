import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { tenantWide, type ScopeUser, type Viewer } from '../access/scope';
import { asDate, dateOf, monthRange } from '../time/time-core';
import type { LedgerMappingDto } from './dto-ledger';
import { NET_PAY, SUSPENSE, buildJournal, projectShares, reverseLines, type JournalLine, type JournalSlip, type Mapping } from './ledger';
import { settingFor } from '../people/probation';
import { lineApproved } from '../time/line-rules';
import { FIXED_CODES } from '../expenses/journal';
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
      const expense = dto.componentCode.startsWith('exp.');
      const known = expense
        ? FIXED_CODES.includes(dto.componentCode) || (await tx.expenseCategory.count({ where: { organizationId: org, code: dto.componentCode.slice(4) } })) > 0
        : dto.componentCode === NET_PAY ||
          dto.componentCode === SUSPENSE ||
        (await tx.payComponent.count({ where: { organizationId: org, code: dto.componentCode } })) > 0 ||
        (await withPayScope(tx, await entitiesFor(tx, c, v, 'payroll.ledger.manage'), () => tx.payslipLine.count({ where: { organizationId: org, componentCode: dto.componentCode } }))) > 0;
      if (!known) throw new BadRequestException(expense ? `${dto.componentCode} is not an expense category or account.` : `${dto.componentCode} is not a pay line.`);
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
      select: { id: true, employmentId: true, employeeId: true, departmentId: true, locationId: true },
    });
    const split = await tx.assignmentCostCentre.findMany({ where: { organizationId: org, assignmentId: { in: asg.map((a) => a.id) } } });
    // Enterprise E4 (O21): the company may split costs by approved project hours in the run's month.
    const mode = (await settingFor(tx, c, 'payroll.costing.split', { legalEntityId: run.legalEntityId })) as 'cost_centre' | 'project_hours';
    const projects = mode === 'project_hours' ? await this.projectMinutes(tx, org, dateOf(run.periodStart), dateOf(run.periodEnd), asg.map((a) => a.employeeId)) : new Map<string, Map<string, number>>();
    const input: JournalSlip[] = slips.map((s) => {
      const a = asg.find((x) => x.employmentId === s.employmentId);
      return {
        legalEntityId: run.legalEntityId,
        departmentId: a?.departmentId ?? null,
        locationId: a?.locationId ?? null,
        projects: a ? projectShares(projects.get(a.employeeId) ?? new Map()) : [],
        costCentres: split.filter((x) => x.assignmentId === a?.id).map((x) => ({ id: x.costCentreId, percent: x.percent.toFixed(2) })),
        lines: lines.filter((l) => l.payslipId === s.id).map((l) => ({ code: l.componentCode, kind: l.kind, amount: l.amount.toFixed(2) })),
      };
    });
    const ccIds = [...new Set(split.map((x) => x.costCentreId))];
    const maps = await tx.ledgerMapping.findMany({
      where: { organizationId: org, OR: [{ scopeType: 'company' }, { scopeType: 'legal_entity', scopeId: run.legalEntityId }, { scopeType: 'cost_centre', scopeId: { in: ccIds } }] },
    });
    // O20: unmapped amounts go to the suspense account (the entity's, else the company's) while the company setting is on.
    const suspenseOn = (await settingFor(tx, c, 'payroll.journal.suspense', { legalEntityId: run.legalEntityId })) === 'on';
    const sus = maps.find((m) => m.componentCode === SUSPENSE && m.scopeType === 'legal_entity' && m.scopeId === run.legalEntityId) ?? maps.find((m) => m.componentCode === SUSPENSE && m.scopeType === 'company');
    const suspense = suspenseOn && sus ? { accountCode: sus.accountCode, accountName: sus.accountName } : null;
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
      { split: mode, suspense },
    );
    const ccNames = new Map((await tx.costCentre.findMany({ where: { organizationId: org, id: { in: ccIds } }, select: { id: true, code: true } })).map((x) => [x.id, x.code]));
    const names = await this.dimNames(tx, org, journal.lines);
    return { run, journal, ccNames, names, suspense, suspenseOn, mode };
  }

  /** Approved minutes per person and project inside [from, to] (the run's month), as project costing reads them. */
  private async projectMinutes(tx: Tx, org: string, from: string, to: string, employeeIds: string[]) {
    const out = new Map<string, Map<string, number>>();
    if (!employeeIds.length) return out;
    const plus = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const sheets = await tx.timesheet.findMany({ where: { organizationId: org, employeeId: { in: employeeIds }, status: 'approved', weekStart: { gte: asDate(plus(from, -6)), lte: asDate(to) } }, select: { id: true, employeeId: true, weekStart: true } });
    const lines = sheets.length ? await tx.timesheetLine.findMany({ where: { organizationId: org, timesheetId: { in: sheets.map((s) => s.id) } } }) : [];
    for (const s of sheets) {
      const monday = dateOf(s.weekStart);
      for (const l of lines.filter((x) => x.timesheetId === s.id)) {
        lineApproved(l).forEach((mins, k) => {
          const on = plus(monday, k);
          if (on < from || on > to || !mins) return;
          const per = out.get(s.employeeId) ?? new Map<string, number>();
          per.set(l.projectId, (per.get(l.projectId) ?? 0) + mins);
          out.set(s.employeeId, per);
        });
      }
    }
    // No approved hours: the person's allocations in force at the month end, by their percent.
    const without = employeeIds.filter((e) => !out.has(e));
    if (without.length) {
      const alloc = await tx.projectAllocation.findMany({ where: { organizationId: org, employeeId: { in: without }, tentative: false, fromOn: { lte: asDate(to) }, OR: [{ toOn: null }, { toOn: { gte: asDate(to) } }] } });
      for (const a of alloc) {
        const per = out.get(a.employeeId) ?? new Map<string, number>();
        per.set(a.projectId, (per.get(a.projectId) ?? 0) + a.percent);
        out.set(a.employeeId, per);
      }
    }
    return out;
  }

  /** O22: the names of the department, location and project dimensions on the lines. */
  private async dimNames(tx: Tx, org: string, lines: JournalLine[]) {
    const ids = (k: 'departmentId' | 'locationId' | 'projectId') => [...new Set(lines.map((l) => l[k]).filter((x): x is string => Boolean(x)))];
    const [deps, locs, prjs] = await Promise.all([
      tx.department.findMany({ where: { organizationId: org, id: { in: ids('departmentId') } }, select: { id: true, code: true, name: true } }),
      tx.location.findMany({ where: { organizationId: org, id: { in: ids('locationId') } }, select: { id: true, code: true, name: true } }),
      tx.timesheetProject.findMany({ where: { organizationId: org, id: { in: ids('projectId') } }, select: { id: true, code: true, name: true } }),
    ]);
    const of = (list: { id: string; code: string | null; name: string }[]) => (id: string | null) => (id ? (list.find((x) => x.id === id) ?? null) : null);
    return { department: of(deps), location: of(locs), project: of(prjs) };
  }

  async journal(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      // O22: a voided or reopened run whose journal was exported offers its reversing journal instead.
      const { stored, reversal } = await this.reversalOf(tx, c, v, runId);
      if (reversal) {
        return {
          runId,
          postedAt: reversal.run.postedAt,
          canPost: false,
          unmapped: [],
          suspense: { on: false, account: null, amount: '0.00' },
          split: 'cost_centre',
          defaultFormat: await this.defaultFormat(tx, c, reversal.run.legalEntityId),
          lines: [],
          exports: stored?.exports ?? [],
          reversal: { lines: reversal.lines, exportedAt: reversal.exportedAt },
        };
      }
      const { run, journal, ccNames, names, suspense, suspenseOn, mode } = await this.journalOf(tx, c, v, runId);
      return {
        runId,
        postedAt: run.postedAt,
        canPost: !journal.unmapped.length || Boolean(suspense),
        unmapped: journal.unmapped,
        suspense: { on: suspenseOn, account: suspense ? `${suspense.accountCode} · ${suspense.accountName}` : null, amount: journal.inSuspense },
        split: mode,
        defaultFormat: await this.defaultFormat(tx, c, run.legalEntityId),
        lines: journal.lines.map((l) => ({
          ...l,
          costCentre: l.costCentreId ? (ccNames.get(l.costCentreId) ?? null) : null,
          department: names.department(l.departmentId)?.name ?? null,
          location: names.location(l.locationId)?.name ?? null,
          project: names.project(l.projectId)?.name ?? null,
          ledger: l.accountName,
        })),
        exports: stored?.exports ?? [],
        reversal: null,
      };
    });
  }

  private async defaultFormat(tx: Tx, c: CompanyContext, legalEntityId: string) {
    return (await settingFor(tx, c, 'payroll.journal.format', { legalEntityId })) as JournalFormat;
  }

  /**
   * O22: the reversing journal of a run that was voided or reopened after its journal was exported (the lines as last
   * exported, debits and credits swapped). Null for any other run.
   */
  private async reversalOf(tx: Tx, c: CompanyContext, v: Viewer, runId: string) {
    const ids = await entitiesFor(tx, c, v, 'payroll.journal.export');
    await payScope(tx, ids);
    const run = await tx.payrollRun.findFirst({ where: { organizationId: c.organizationId, id: runId } });
    if (!run || !ids.includes(run.legalEntityId)) throw new NotFoundException('Not found');
    const stored = await tx.journal.findFirst({ where: { organizationId: c.organizationId, runId } });
    if (!['void', 'reopened'].includes(run.status)) return { stored, reversal: null };
    const exported = ((stored?.exports as { format: string; at: string; reversal?: boolean }[] | undefined) ?? []).filter((e) => !e.reversal);
    if (!stored || !exported.length) throw new ConflictException('This run was never exported to the books, so there is nothing to reverse.');
    return { stored, reversal: { run, lines: reverseLines(stored.lines as unknown as JournalLine[]), exportedAt: exported[exported.length - 1].at } };
  }

  private refuseUnmapped(unmapped: { componentCode: string; side: string }[], suspense: unknown) {
    // O20: with a suspense account the unmapped amounts are parked there, so the journal can go to the books.
    if (unmapped.length && !suspense)
      throw new ConflictException({
        statusCode: 409,
        code: 'JOURNAL_UNMAPPED',
        message: `Map these pay lines to ledger accounts first: ${[...new Set(unmapped.map((u) => `${u.componentCode} (${u.side})`))].slice(0, 10).join(', ')}.`,
        unmapped,
      });
  }

  /**
   * CSV, Tally (XML vouchers), Zoho Books (CSV journal), SAP (flat file) or Oracle (GL interface CSV) for the accountant;
   * refused while anything is unmapped and there is no suspense account; recorded. A voided or reopened run exports its
   * reversing journal (O22).
   */
  async exportJournal(ctx: TenantContext, user: ScopeUser, runId: string, format: JournalFormat) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const { stored, reversal } = await this.reversalOf(tx, c, v, runId);
      let run: Prisma.PayrollRunGetPayload<object>;
      let lines: JournalLine[];
      let ccNames: Map<string, string>;
      let names: Awaited<ReturnType<LedgerService['dimNames']>>;
      if (reversal) {
        run = reversal.run;
        lines = reversal.lines;
        ccNames = new Map((await tx.costCentre.findMany({ where: { organizationId: org, id: { in: lines.map((l) => l.costCentreId).filter((x): x is string => Boolean(x)) } }, select: { id: true, code: true } })).map((x) => [x.id, x.code]));
        names = await this.dimNames(tx, org, lines);
      } else {
        const j = await this.journalOf(tx, c, v, runId);
        this.refuseUnmapped(j.journal.unmapped, j.suspense);
        ({ run, ccNames, names } = j);
        lines = j.journal.lines;
      }
      const month = dateOf(run.periodStart).slice(0, 7);
      const tag = reversal ? 'REVERSAL' : 'PAYROLL';
      const { file, name, type } = journalFile(format, lines, {
        month,
        postingDate: monthRange(month).to,
        reference: `${tag}-${month}`,
        text: reversal ? `Reversal of payroll ${month}` : `Payroll ${month}`,
        cc: (id) => (id ? (ccNames.get(id) ?? '') : ''),
        dept: (id) => names.department(id)?.code ?? '',
        loc: (id) => names.location(id)?.code ?? '',
        project: (id) => names.project(id)?.code ?? '',
        suffix: reversal ? '-reversal' : '',
      });
      const exports = [...((stored?.exports as unknown[]) ?? []), { format, at: new Date().toISOString(), by: v.userId, ...(reversal ? { reversal: true } : {}) }];
      // The lines as exported are kept, so a later reversal reverses exactly what went to the books.
      const keep = (reversal ? (stored!.lines as Prisma.InputJsonValue) : (lines as unknown as Prisma.InputJsonValue));
      if (stored) await tx.journal.update({ where: { id: stored.id }, data: { exports: exports as Prisma.InputJsonValue, lines: keep } });
      else await tx.journal.create({ data: { organizationId: org, legalEntityId: run.legalEntityId, runId, lines: keep, exports: exports as Prisma.InputJsonValue } });
      await audit(tx, c, reversal ? 'payroll.journal.reversal_exported' : 'payroll.journal.exported', 'payroll_run', runId, { format });
      return { file: Buffer.from(file, 'utf8'), name, contentType: type };
    });
  }

  /** "Mark posted" (P10 Q7): the run's journal is in the books; refused while anything is unmapped (without suspense). */
  async markPosted(ctx: TenantContext, user: ScopeUser, runId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { run, journal, suspense } = await this.journalOf(tx, c, v, runId);
      this.refuseUnmapped(journal.unmapped, suspense);
      if (run.postedAt) return { runId, postedAt: run.postedAt };
      const at = new Date();
      await tx.payrollRun.update({ where: { id: run.id }, data: { postedAt: at, version: { increment: 1 } } });
      await audit(tx, c, 'payroll.journal.posted', 'payroll_run', run.id, { lines: journal.lines.length, inSuspense: journal.inSuspense });
      return { runId, postedAt: at };
    });
  }
}

export type JournalFormat = 'csv' | 'tally' | 'zoho' | 'sap' | 'oracle';

/**
 * The journal file in one format (pure, so it is tested directly). Department, location and project are columns of every
 * CSV-like format (O22); Tally keeps its voucher shape. Text cells get the spreadsheet formula guard.
 */
export function journalFile(
  format: JournalFormat,
  lines: JournalLine[],
  o: { month: string; postingDate: string; reference: string; text: string; cc: (id: string | null) => string; dept: (id: string | null) => string; loc: (id: string | null) => string; project: (id: string | null) => string; suffix: string },
): { file: string; name: string; type: string } {
  const cell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
  const dims = (l: JournalLine) => [cell(o.dept(l.departmentId)), cell(o.loc(l.locationId)), cell(o.project(l.projectId))];
  const base = `payroll-journal-${o.month}${o.suffix}`;
  if (format === 'tally') {
    const entries = lines
      .map(
        (l) =>
          `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(l.accountName)}</LEDGERNAME><ISDEEMEDPOSITIVE>${D(l.debit).gt(0) ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${D(l.debit).gt(0) ? `-${l.debit}` : l.credit}</AMOUNT>${
            l.costCentreId ? `<CATEGORYALLOCATIONS.LIST><COSTCENTREALLOCATIONS.LIST><NAME>${xml(o.cc(l.costCentreId))}</NAME></COSTCENTREALLOCATIONS.LIST></CATEGORYALLOCATIONS.LIST>` : ''
          }</ALLLEDGERENTRIES.LIST>`,
      )
      .join('');
    const file = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><VOUCHER VCHTYPE="Journal" ACTION="Create"><DATE>${o.postingDate.replace(/-/g, '')}</DATE><NARRATION>${xml(o.text)}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    return { file, name: `${base}-tally.xml`, type: 'application/xml' };
  }
  if (format === 'zoho') {
    const head = ['Journal Date', 'Reference Number', 'Notes', 'Account', 'Account Code', 'Cost Centre', 'Department', 'Location', 'Project', 'Debit', 'Credit'];
    return { file: csv([head, ...lines.map((l) => [o.postingDate, o.reference, cell(o.text), cell(l.accountName), cell(l.accountCode), cell(o.cc(l.costCentreId)), ...dims(l), l.debit, l.credit])]), name: `${base}-zoho.csv`, type: 'text/csv' };
  }
  if (format === 'sap') {
    // SAP flat file (one line item a row, ready for a BAPI_ACC_DOCUMENT_POST or LSMW upload): posting key 40 debit, 50 credit.
    const head = ['DocDate', 'PostingDate', 'Reference', 'HeaderText', 'PostingKey', 'GLAccount', 'Amount', 'DebitCredit', 'CostCenter', 'Department', 'Location', 'WBSElement', 'ItemText'];
    const rows = lines.flatMap((l) =>
      [
        [D(l.debit).gt(0), l.debit, '40', 'S'],
        [D(l.credit).gt(0), l.credit, '50', 'H'],
      ]
        .filter(([on]) => on)
        .map(([, amt, key, dc]) => [o.postingDate.replace(/-/g, ''), o.postingDate.replace(/-/g, ''), o.reference, cell(o.text), String(key), cell(l.accountCode), String(amt), String(dc), cell(o.cc(l.costCentreId)), ...dims(l), cell(l.accountName)]),
    );
    return { file: csv([head, ...rows]), name: `${base}-sap.csv`, type: 'text/csv' };
  }
  if (format === 'oracle') {
    // Oracle General Ledger open interface (GL_INTERFACE) columns, for a FBDI or Journal Import upload.
    const head = ['STATUS', 'ACCOUNTING_DATE', 'USER_JE_SOURCE_NAME', 'USER_JE_CATEGORY_NAME', 'CURRENCY_CODE', 'ACTUAL_FLAG', 'SEGMENT1_ACCOUNT', 'SEGMENT2_COST_CENTRE', 'SEGMENT3_DEPARTMENT', 'SEGMENT4_LOCATION', 'SEGMENT5_PROJECT', 'ENTERED_DR', 'ENTERED_CR', 'REFERENCE1', 'REFERENCE10'];
    const rows = lines.map((l) => ['NEW', o.postingDate, 'Payroll', 'Payroll', 'INR', 'A', cell(l.accountCode), cell(o.cc(l.costCentreId)), ...dims(l), D(l.debit).gt(0) ? l.debit : '', D(l.credit).gt(0) ? l.credit : '', o.reference, cell(l.accountName)]);
    return { file: csv([head, ...rows]), name: `${base}-oracle.csv`, type: 'text/csv' };
  }
  const head = ['Account code', 'Account', 'Cost centre', 'Department', 'Location', 'Project', 'Debit', 'Credit'];
  return { file: csv([head, ...lines.map((l) => [cell(l.accountCode), cell(l.accountName), cell(o.cc(l.costCentreId)), ...dims(l), l.debit, l.credit])]), name: `${base}.csv`, type: 'text/csv' };
}
